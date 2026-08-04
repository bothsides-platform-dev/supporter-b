import { randomUUID } from 'node:crypto';

import type { PgSigningTemplateRepo } from '@/lib/server/repositories/types';
import type { PgSigningTemplate, SigningTemplateFieldInput } from '@/lib/types/signing';
import { buildSignatureFieldsPayload, validateTemplateFields } from '@/lib/signing/template-fields';
import { SnowSignError, type SnowSignClient } from '@/lib/server/signing/snowsign-client';
import {
  hasUploadTokenSecret,
  signUploadToken,
  verifyUploadToken,
} from '@/lib/server/signing/upload-token';
import {
  bindUploadSlot,
  releaseUploadSlot,
  releaseUploadSlotByUploadId,
  reserveUploadSlot,
} from '@/lib/server/signing/upload-session-budget';
import type { Actor, ServiceResult } from './types';

/** 스노우싸인 role 문자열 — 항상 이 두 값 고정(구매사/PG사). 매핑 단계가 없다. */
const ROLE_LABELS = ['구매사', 'PG사'];

export class SigningTemplateService {
  constructor(
    private readonly templateRepo: PgSigningTemplateRepo,
    private readonly snowsign: SnowSignClient,
  ) {}

  /**
   * PDF 업로드용 presigned 세션 발급 — 에디터가 브라우저에서 직접 **POST**(presigned
   * POST form)한다. raw PUT 은 403 이다(실측, `docs/SNOWSIGN_SANDBOX.md` T2).
   *
   * 업로드 세션은 워크스페이스가 아니라 API 키(조직 전체) 단위라, 클라이언트가 준
   * 원시 id 를 그대로 믿으면 남의 업로드로 자기 템플릿을 만드는 경로가 열린다. 그래서
   * **워크스페이스에 서명 바인딩한 토큰**을 준다.
   *
   * 불변식은 "원시 id 가 브라우저에 절대 안 보인다"가 **아니라 "위조할 수 없다"** 이다 —
   * presigned POST 의 `fields.key`·`uploadUrl` 에 id 가 비칠 수 있다(공급자가 정하는
   * 값이라 우리가 통제하지 못한다). 방어는 남의 id 를 알아도 **자기 워크스페이스로는
   * 서명이 맞지 않는다**는 데 있다. 이 구분을 흐리면 "안 보이니 안전하다"는 잘못된
   * 전제 위에 다음 코드가 얹힌다.
   */
  async createUploadSession(
    actor: Actor,
    input: { filename: string; contentType: string; sizeBytes: number },
  ): Promise<
    ServiceResult<{ uploadToken: string; uploadUrl: string; fields: Record<string, string> }>
  > {
    // 시크릿 검사를 **SnowSign 호출 앞에** 둔다. 뒤에 두면 이미 만들어진 업로드
    // 세션이 버려지는데, 세션은 조직(API 키) 공유 동시 3개 한도에 10분 TTL·해제 API
    // 부재라 설정 오류 3번이면 모든 PG 의 업로드가 막힌다. 실패 코드도 구분한다 —
    // SNOWSIGN_ERROR 로 나가면 운영자가 env 대신 공급자를 쫓는다.
    if (!hasUploadTokenSecret()) return { ok: false, error: 'SIGNING_MISCONFIGURED' };

    // 조직 공유 한도를 **공급자 호출 앞에서** 잡는다. 세션 3개/150MB 는 API 키 단위라
    // (docs/SNOWSIGN_API.md) 한 PG 가 50MB 를 세 번 선언하면 10분간 모든 PG 의 업로드가
    // 막힌다 — 왕복을 사이에 둔 사후 검사는 동시 요청 둘을 함께 통과시켜 의미가 없다.
    const slot = reserveUploadSlot(actor.workspaceId, input.sizeBytes);
    if (!slot.ok) return { ok: false, error: slot.error };

    try {
      const s = await this.snowsign.createUploadSession({
        purpose: 'template_document',
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      });
      // 소비 시점에 자리를 돌려주려면 공급자가 준 id 와 묶어 둬야 한다.
      bindUploadSlot(slot.slotId, s.uploadId);
      return {
        ok: true,
        uploadToken: signUploadToken(s.uploadId, actor.workspaceId, Date.now()),
        uploadUrl: s.uploadUrl,
        fields: s.fields,
      };
    } catch (e) {
      // 세션이 만들어지지 않았으므로 자리를 잡아둘 이유가 없다.
      releaseUploadSlot(slot.slotId);
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }
  }

  /**
   * 업로드된 PDF + 배치된 필드로 스노우싸인 템플릿을 만들고 워크스페이스에 등록한다.
   * 역할은 항상 구매사/PG 고정(signers 고정) — roleMapping 단계 없음.
   */
  async createTemplate(
    actor: Actor,
    input: { name: string; uploadToken: string; fields: SigningTemplateFieldInput[] },
  ): Promise<ServiceResult<{ templateId: string }>> {
    // 소유 대조가 **먼저**다 — 검증 실패든 아니든 남의 업로드로는 아무것도 하지 않는다.
    const bound = verifyUploadToken(input.uploadToken, actor.workspaceId, Date.now());
    if (!bound.ok) return bound;

    const validation = validateTemplateFields(input.fields);
    if (!validation.ok) return validation;

    let created: { templateId: string };
    try {
      created = await this.snowsign.createTemplate({
        name: input.name,
        documentUploadId: bound.uploadId,
        signers: ROLE_LABELS,
        signatureFields: buildSignatureFieldsPayload(input.fields),
      });
    } catch (e) {
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }
    // 업로드가 템플릿으로 소비됐다 — 조직 자리를 TTL(10분) 기다리지 않고 돌려준다.
    releaseUploadSlotByUploadId(bound.uploadId);

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
