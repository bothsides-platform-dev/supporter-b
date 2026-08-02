import { randomUUID } from 'node:crypto';

import type { PgSigningTemplateRepo } from '@/lib/server/repositories/types';
import type { PgSigningTemplate, SigningTemplateFieldInput } from '@/lib/types/signing';
import { buildSignatureFieldsPayload, validateTemplateFields } from '@/lib/signing/template-fields';
import { SnowSignError, type SnowSignClient } from '@/lib/server/signing/snowsign-client';
import type { Actor, ServiceResult } from './types';

/** 스노우싸인 role 문자열 — 항상 이 두 값 고정(구매사/PG사). 매핑 단계가 없다. */
const ROLE_LABELS = ['구매사', 'PG사'];

export class SigningTemplateService {
  constructor(
    private readonly templateRepo: PgSigningTemplateRepo,
    private readonly snowsign: SnowSignClient,
  ) {}

  /** PDF 업로드용 presigned 세션 발급 — 에디터가 브라우저에서 직접 PUT한다. */
  async createUploadSession(
    _actor: Actor,
    input: { filename: string; contentType: string; sizeBytes: number },
  ): Promise<ServiceResult<{ uploadId: string; uploadUrl: string; fields: Record<string, string> }>> {
    try {
      const s = await this.snowsign.createUploadSession({
        purpose: 'template_document',
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      });
      return { ok: true, uploadId: s.uploadId, uploadUrl: s.uploadUrl, fields: s.fields };
    } catch (e) {
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }
  }

  /**
   * 업로드된 PDF + 배치된 필드로 스노우싸인 템플릿을 만들고 워크스페이스에 등록한다.
   * 역할은 항상 구매사/PG 고정(signers 고정) — roleMapping 단계 없음.
   */
  async createTemplate(
    actor: Actor,
    input: { name: string; documentUploadId: string; fields: SigningTemplateFieldInput[] },
  ): Promise<ServiceResult<{ templateId: string }>> {
    const validation = validateTemplateFields(input.fields);
    if (!validation.ok) return validation;

    let created: { templateId: string };
    try {
      created = await this.snowsign.createTemplate({
        name: input.name,
        documentUploadId: input.documentUploadId,
        signers: ROLE_LABELS,
        signatureFields: buildSignatureFieldsPayload(input.fields),
      });
    } catch (e) {
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }

    const templateId = randomUUID();
    await this.templateRepo.create({
      id: templateId,
      workspaceId: actor.workspaceId,
      snowsignTemplateId: created.templateId,
      name: input.name,
      createdBy: actor.userId,
    });
    return { ok: true, templateId };
  }

  /** 워크스페이스의 템플릿 목록. */
  async list(actor: Actor): Promise<ServiceResult<{ templates: PgSigningTemplate[] }>> {
    const templates = await this.templateRepo.listByWorkspace(actor.workspaceId);
    return { ok: true, templates };
  }

  /** 이름 변경 — 소유 워크스페이스만. */
  async rename(actor: Actor, templateId: string, name: string): Promise<ServiceResult> {
    const owned = await this.requireOwned(templateId, actor.workspaceId);
    if (!owned.ok) return owned;
    await this.templateRepo.updateName(templateId, name);
    return { ok: true };
  }

  /**
   * 하드 삭제 — 우리 링크 행만 지운다. 스노우싸인 원본 템플릿(수정 API가 없어 재사용
   * 불가)은 고아로 남되 무해.
   */
  async remove(actor: Actor, templateId: string): Promise<ServiceResult> {
    const owned = await this.requireOwned(templateId, actor.workspaceId);
    if (!owned.ok) return owned;
    await this.templateRepo.remove(templateId);
    return { ok: true };
  }

  private async requireOwned(
    templateId: string,
    workspaceId: string,
  ): Promise<{ ok: true; template: PgSigningTemplate } | { ok: false; error: string }> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) return { ok: false, error: 'TEMPLATE_NOT_FOUND' };
    if (template.workspaceId !== workspaceId) return { ok: false, error: 'FORBIDDEN' };
    return { ok: true, template };
  }
}

// ─── Factory (QuoteTemplateService 패턴 미러) ────────────────────────────
declare global {
  var __bidit_signing_template_service__: SigningTemplateService | undefined;
}

export async function getSigningTemplateService(): Promise<SigningTemplateService> {
  if (!globalThis.__bidit_signing_template_service__) {
    const { getPgSigningTemplateRepo } = await import('@/lib/server/repositories/factory');
    const { getSnowSignClient } = await import('@/lib/server/signing/snowsign-client');
    const templateRepo = await getPgSigningTemplateRepo();
    globalThis.__bidit_signing_template_service__ = new SigningTemplateService(
      templateRepo,
      getSnowSignClient(),
    );
  }
  return globalThis.__bidit_signing_template_service__!;
}

export function __resetSigningTemplateServiceForTest(): void {
  globalThis.__bidit_signing_template_service__ = undefined;
}

export function __setSigningTemplateServiceForTest(service: SigningTemplateService): void {
  globalThis.__bidit_signing_template_service__ = service;
}
