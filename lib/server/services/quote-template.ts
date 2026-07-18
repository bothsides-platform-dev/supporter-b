// QuoteTemplateService — business logic for the PG bid quote template (견적
// 요율표) CRUD. Extracted from the quote-template actions so that actions stay
// thin (session + parse + delegate). The Next-auth session boundary stays in
// the actions (quote-template/_shared.ts); this service receives an
// already-resolved Actor (userId + active PG workspaceId) and never imports
// @/lib/auth/session.
import { randomUUID } from 'node:crypto';

import type {
  BidQuoteTemplate,
  BidQuoteTemplateRepo,
} from '@/lib/server/repositories/types';
import type { PaymentMethod, TierRates } from '@/lib/types/bid';
import type { Actor, ServiceResult } from './types';

// The save payload — mirrors what saveQuoteTemplateAction parses and passes.
// `id` present → update an owned template; absent → create a new one.
export type SaveQuoteTemplateServiceInput = {
  id?: string;
  name: string;
  settleCycle: string;
  settleLimit: number;
  guaranteeInsurance: number;
  signupFee: number;
  paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
};

// 한 PG 워크스페이스가 보유할 수 있는 템플릿 상한 (createRfp 커스텀 결제수단 20개
// 상한과 동일 결). 이전엔 save/duplicate 액션에 각각 중복 선언돼 있었으나 서비스로
// 단일화.
const MAX_TEMPLATES = 20;

export class QuoteTemplateService {
  constructor(private readonly templateRepo: BidQuoteTemplateRepo) {}

  /**
   * Save (create or update) a bid quote template shared across the actor's
   * active PG workspace. `id` present updates an owned template; absent creates
   * a new one, capped at MAX_TEMPLATES per workspace. created_by records who
   * authored it.
   * Errors: FORBIDDEN | TEMPLATE_NOT_FOUND | LIMIT_REACHED.
   */
  async save(
    input: SaveQuoteTemplateServiceInput,
    actor: Actor,
  ): Promise<ServiceResult<{ templateId: string }>> {
    const {
      id,
      name,
      settleCycle,
      settleLimit,
      guaranteeInsurance,
      signupFee,
      paymentFees,
    } = input;

    if (id) {
      const owned = await this.requireOwned(id, actor.workspaceId);
      if (!owned.ok) return owned;
      await this.templateRepo.update(id, {
        name,
        settleCycle,
        settleLimit,
        guaranteeInsurance,
        signupFee,
        paymentFees,
      });
      return { ok: true, templateId: id };
    }

    const existing = await this.templateRepo.listByWorkspace(actor.workspaceId);
    if (existing.length >= MAX_TEMPLATES) return { ok: false, error: 'LIMIT_REACHED' };

    const templateId = randomUUID();
    await this.templateRepo.create({
      id: templateId,
      pgWsId: actor.workspaceId,
      name,
      settleCycle,
      settleLimit,
      guaranteeInsurance,
      signupFee,
      paymentFees,
      createdBy: actor.userId,
    });
    return { ok: true, templateId };
  }

  /**
   * Duplicate a template owned by the actor's active PG workspace. The new
   * template is named "<원본이름> 복제". Cross-workspace guard: FORBIDDEN for
   * another workspace's template. LIMIT_REACHED when the workspace already has
   * MAX_TEMPLATES templates.
   * Errors: FORBIDDEN | TEMPLATE_NOT_FOUND | LIMIT_REACHED.
   */
  async duplicate(
    templateId: string,
    actor: Actor,
  ): Promise<ServiceResult<{ templateId: string }>> {
    const owned = await this.requireOwned(templateId, actor.workspaceId);
    if (!owned.ok) return owned;

    const existing = await this.templateRepo.listByWorkspace(actor.workspaceId);
    if (existing.length >= MAX_TEMPLATES) return { ok: false, error: 'LIMIT_REACHED' };

    const { template } = owned;
    const newId = randomUUID();
    await this.templateRepo.create({
      id: newId,
      pgWsId: actor.workspaceId,
      name: `${template.name} 복제`,
      settleCycle: template.settleCycle,
      settleLimit: template.settleLimit,
      guaranteeInsurance: template.guaranteeInsurance,
      signupFee: template.signupFee,
      paymentFees: { ...template.paymentFees },
      createdBy: actor.userId,
    });

    return { ok: true, templateId: newId };
  }

  /**
   * Delete a template owned by the actor's active PG workspace.
   * Errors: FORBIDDEN | TEMPLATE_NOT_FOUND.
   */
  async remove(templateId: string, actor: Actor): Promise<ServiceResult> {
    const owned = await this.requireOwned(templateId, actor.workspaceId);
    if (!owned.ok) return owned;
    await this.templateRepo.remove(templateId);
    return { ok: true };
  }

  /**
   * List the templates shared across the actor's active PG workspace.
   * Cross-workspace isolation: only the actor workspace's templates are
   * returned.
   */
  async list(actor: Actor): Promise<ServiceResult<{ templates: BidQuoteTemplate[] }>> {
    const templates = await this.templateRepo.listByWorkspace(actor.workspaceId);
    return { ok: true, templates };
  }

  // Load a template owned by the given workspace (cross-workspace guard for
  // update/duplicate/delete). Returns TEMPLATE_NOT_FOUND when absent, FORBIDDEN
  // when it belongs to another workspace.
  private async requireOwned(
    templateId: string,
    workspaceId: string,
  ): Promise<
    | { ok: true; template: BidQuoteTemplate }
    | { ok: false; error: string }
  > {
    const template = await this.templateRepo.findById(templateId);
    if (!template) return { ok: false, error: 'TEMPLATE_NOT_FOUND' };
    if (template.pgWsId !== workspaceId) return { ok: false, error: 'FORBIDDEN' };
    return { ok: true, template };
  }
}

// ─── Factory (BidService single-global pattern) ──────────────────────────────

declare global {
  var __bidit_quote_template_service__: QuoteTemplateService | undefined;
}

export async function getQuoteTemplateService(): Promise<QuoteTemplateService> {
  if (!globalThis.__bidit_quote_template_service__) {
    const { getBidQuoteTemplateRepo } = await import(
      '@/lib/server/repositories/factory'
    );
    const templateRepo = await getBidQuoteTemplateRepo();
    globalThis.__bidit_quote_template_service__ = new QuoteTemplateService(templateRepo);
  }
  return globalThis.__bidit_quote_template_service__!;
}

export function __resetQuoteTemplateServiceForTest(): void {
  globalThis.__bidit_quote_template_service__ = undefined;
}

export function __setQuoteTemplateServiceForTest(service: QuoteTemplateService): void {
  globalThis.__bidit_quote_template_service__ = service;
}
