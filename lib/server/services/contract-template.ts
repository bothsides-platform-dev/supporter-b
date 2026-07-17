// ContractTemplateService — 전자계약 템플릿(계약서 PDF) CRUD.
// QuoteTemplateService 를 미러하되, 템플릿은 실제 PDF 첨부를 소유하므로 저장 시
// storage 바이트를 읽어 validateTemplatePdf 로 신뢰 경계를 세우고(통과분만
// 발송에 흐른다), 첨부를 exclusive-arc(contract_template_id)로 claim 하며,
// create/delete 를 audit 에 남긴다. 세션 경계는 액션 레이어에 있고 이 서비스는
// 이미 해석된 Actor(userId + active PG workspaceId)만 받는다.
import { randomUUID } from 'node:crypto';

import { validateTemplatePdf } from '@/lib/server/contracts/template-validate';
import { getStorage } from '@/lib/server/storage';
import { MAX_CONTRACT_TEMPLATES } from '@/lib/types/contract-doc';
import type {
  AttachmentRepo,
  AuditLogRepo,
  ContractTemplateRepo,
} from '@/lib/server/repositories/types';
import type { Actor, ServiceResult } from './types';

export type { Actor, ServiceResult };

// The save payload — mirrors what saveContractTemplateAction (Wave 4) parses.
export type SaveContractTemplateServiceInput = {
  name: string;
  description?: string;
  attachmentId: string;
};

export class ContractTemplateService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly templateRepo: ContractTemplateRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly auditRepo: AuditLogRepo,
  ) {}

  /**
   * Create a contract template owned by the actor's PG workspace, backed by an
   * uploaded PDF attachment. Capped at MAX_CONTRACT_TEMPLATES per workspace. The
   * attachment must be a ready, unclaimed upload owned by the actor and must
   * pass validateTemplatePdf (the trust boundary — only validated bytes ever
   * reach composeBasePdf). On success the attachment is claimed to the template.
   * Errors: LIMIT_REACHED | INVALID_ATTACHMENT | TEMPLATE_PDF_INVALID.
   */
  async save(
    input: SaveContractTemplateServiceInput,
    actor: Actor,
  ): Promise<ServiceResult<{ templateId: string }>> {
    const count = await this.templateRepo.countByWorkspace(actor.workspaceId);
    if (count >= MAX_CONTRACT_TEMPLATES) return { ok: false, error: 'LIMIT_REACHED' };

    // Existence + ready + unclaimed + ownership in one query (findUnclaimedByIds
    // filters status='ready' and all owner arcs NULL, and returns uploadedBy).
    const [unclaimed] = await this.attachmentRepo.findUnclaimedByIds([input.attachmentId]);
    if (!unclaimed) return { ok: false, error: 'INVALID_ATTACHMENT' };
    if (unclaimed.uploadedBy !== actor.userId) return { ok: false, error: 'INVALID_ATTACHMENT' };

    // Storage bytes are keyed by the attachment id (see lib/server/storage/r2.ts).
    const bytes = await readStorageBytes(input.attachmentId);
    const validation = await validateTemplatePdf(bytes);
    if (!validation.ok) return { ok: false, error: 'TEMPLATE_PDF_INVALID' };

    const templateId = randomUUID();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      await this.templateRepo.create(
        {
          id: templateId,
          pgWsId: actor.workspaceId,
          name: input.name,
          description: input.description ?? '',
          createdBy: actor.userId,
        },
        tx,
      );
      await this.attachmentRepo.claim(
        {
          ids: [input.attachmentId],
          owner: { contractTemplateId: templateId },
          uploadedBy: actor.userId,
        },
        tx,
      );
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'contract_template.save',
          entityType: 'contract_template',
          entityId: templateId,
          metadata: { name: input.name },
        },
        tx,
      );
    });

    return { ok: true, templateId };
  }

  /**
   * Delete a template owned by the actor's PG workspace. Any contract_docs that
   * referenced it keep the document (template_id ON DELETE SET NULL).
   * Errors: TEMPLATE_NOT_FOUND | FORBIDDEN.
   */
  async remove(templateId: string, actor: Actor): Promise<ServiceResult> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) return { ok: false, error: 'TEMPLATE_NOT_FOUND' };
    if (template.pgWsId !== actor.workspaceId) return { ok: false, error: 'FORBIDDEN' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this._db.transaction(async (tx: any) => {
      await this.templateRepo.delete(templateId, tx);
      await this.auditRepo.insert(
        {
          actorUserId: actor.userId,
          actorWorkspaceId: actor.workspaceId,
          action: 'contract_template.delete',
          entityType: 'contract_template',
          entityId: templateId,
          metadata: { name: template.name },
        },
        tx,
      );
    });

    return { ok: true };
  }
}

// Drain a storage object's stream into a single Buffer. Reading only the first
// chunk silently truncates large PDFs, so consume the whole stream.
async function readStorageBytes(key: string): Promise<Buffer> {
  const { stream } = await getStorage().read(key);
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// ─── Factory (QuoteTemplateService single-global pattern) ────────────────────

declare global {
  var __bidit_contract_template_service__: ContractTemplateService | undefined;
}

export async function getContractTemplateService(): Promise<ContractTemplateService> {
  if (!globalThis.__bidit_contract_template_service__) {
    const [{ db }, { getContractTemplateRepo, getAttachmentRepo, getAuditLogRepo }] =
      await Promise.all([
        import('@/lib/db/client'),
        import('@/lib/server/repositories/factory'),
      ]);
    const [templateRepo, attachmentRepo, auditRepo] = await Promise.all([
      getContractTemplateRepo(),
      getAttachmentRepo(),
      getAuditLogRepo(),
    ]);
    globalThis.__bidit_contract_template_service__ = new ContractTemplateService(
      db,
      templateRepo,
      attachmentRepo,
      auditRepo,
    );
  }
  return globalThis.__bidit_contract_template_service__!;
}

export function __resetContractTemplateServiceForTest(): void {
  globalThis.__bidit_contract_template_service__ = undefined;
}

export function __setContractTemplateServiceForTest(service: ContractTemplateService): void {
  globalThis.__bidit_contract_template_service__ = service;
}
