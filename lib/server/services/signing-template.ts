import { randomUUID } from 'node:crypto';

import type { PgSigningTemplateRepo } from '@/lib/server/repositories/types';
import {
  SIGNING_TEMPLATE_FIELD_TYPES,
  type PgSigningTemplate,
  type SigningTemplateFieldInput,
  type SigningTemplateFieldType,
} from '@/lib/types/signing';
import {
  SIGNING_ROLE_LABELS,
  buildSignatureFieldsPayload,
  partyFromRoleLabel,
  validateTemplateFields,
} from '@/lib/signing/template-fields';
import { SIGNING_DEADLINE_DAYS } from '@/lib/signing/deadline';
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

/**
 * 스노우싸인 role 문자열 — 항상 이 두 값 고정(구매사/PG사), 매핑 단계가 없다.
 * 필드 role 라벨과 같은 출처(template-fields)에서 파생 — 별도 리터럴이면 한쪽만
 * 바뀌었을 때 그 뒤의 모든 템플릿이 수정 진입에서 영구 거부된다.
 */
const ROLE_LABELS: string[] = [...SIGNING_ROLE_LABELS];

// 에디터가 만들 수 있는 타입 전부 — detail 되읽기의 fail-closed 판정에 쓴다.
// 우리 앱이 만든 템플릿은 이 4타입뿐이라 벗어나면(콘솔에서 직접 만든 stamp 등)
// 필드를 조용히 버리는 대신 전체를 거부한다(버린 채 저장하면 그 필드가 소실).
// 목록은 런타임 튜플 SSOT 에서 파생 — 손 나열은 새 타입 추가를 조용히 놓친다.
const SUPPORTED_FIELD_TYPES = new Set<string>(SIGNING_TEMPLATE_FIELD_TYPES);

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
        // 안 보내면 이 템플릿의 계약은 영구 유효다(T9 실측) — 서명 요청에 기한이
        // 있는 것이 표준이고, 만료는 provider 가 판정해 expired 로 회신한다.
        deadlineDays: SIGNING_DEADLINE_DAYS,
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

  /**
   * 수정 진입용 상세 — provider 에서 서명칸 좌표를 되읽어 에디터 입력 형태로 매핑한다
   * (로컬 DB 는 링크 행만 갖는다). name 은 **로컬 행**이 출처다: rename 이 로컬만
   * 갱신하므로 provider name 은 의도적으로 스테일이다.
   */
  async getDetail(
    actor: Actor,
    templateId: string,
  ): Promise<ServiceResult<{ name: string; fields: SigningTemplateFieldInput[] }>> {
    const owned = await this.requireOwned(templateId, actor.workspaceId);
    if (!owned.ok) return owned;
    // 조항형 서식은 provider 템플릿이 없다 — 문서는 우리 DB 에 있고, 편집기도 다르다.
    // 여기로 흘러오면 잘못된 화면이 열리려는 것이므로 종류 자체를 거부한다.
    if (owned.template.kind !== 'pdf') return { ok: false, error: 'TEMPLATE_KIND_MISMATCH' };

    let detail: Awaited<ReturnType<SnowSignClient['getTemplate']>>;
    try {
      detail = await this.snowsign.getTemplate(owned.template.snowsignTemplateId);
    } catch (e) {
      return { ok: false, error: this.translateProviderError(e) };
    }

    // 변수를 실은 템플릿(콘솔 제작)은 재생성 저장이 변수를 되살릴 수 없다 —
    // 서명칸 게이트만으로는 통과해 버려 저장 순간 변수가 소실된다. 전체 거부.
    if (detail.hasVariables) return { ok: false, error: 'TEMPLATE_UNSUPPORTED' };

    const fields: SigningTemplateFieldInput[] = [];
    for (const f of detail.signatureFields) {
      const party = partyFromRoleLabel(f.roleName);
      // 미지 role/type 은 필드를 조용히 버리지 않고 전체를 거부한다 — 버린 채
      // 저장하면 그 필드가 provider 에서 소실된다(데이터 손실).
      if (!party || !SUPPORTED_FIELD_TYPES.has(f.type)) {
        return { ok: false, error: 'TEMPLATE_UNSUPPORTED' };
      }
      fields.push({
        id: randomUUID(),
        type: f.type as SigningTemplateFieldType,
        party,
        pageNumber: f.pageNumber,
        x: f.positionX,
        y: f.positionY,
        width: f.width,
        height: f.height,
      });
    }
    return { ok: true, name: owned.template.name, fields };
  }

  /** 원본 PDF 의 1시간 임시 URL — 소비자는 스트리밍 프록시 라우트(즉시 fetch). */
  async getDocumentDownloadUrl(
    actor: Actor,
    templateId: string,
  ): Promise<ServiceResult<{ url: string; filename?: string }>> {
    const owned = await this.requireOwned(templateId, actor.workspaceId);
    if (!owned.ok) return owned;
    // 조항형 서식에는 내려받을 원본 PDF 가 없다. **이 거부가 pdfjs 에디터를 막는
    // 실제 게이트다** — 목록 UI 분기와 타입 불가능성은 그 위의 편의층이고, 손으로
    // 만든 `/api/signing/templates/{id}/document` 요청은 여기서 404 로 접힌다.
    if (owned.template.kind !== 'pdf') return { ok: false, error: 'TEMPLATE_NOT_FOUND' };
    try {
      const d = await this.snowsign.templateDownloadUrl(owned.template.snowsignTemplateId);
      return { ok: true, url: d.downloadUrl, filename: d.filename };
    } catch (e) {
      return { ok: false, error: this.translateProviderError(e) };
    }
  }

  /**
   * 수정 저장 — SnowSign 에는 템플릿 수정 API 가 없어(PATCH/PUT/DELETE 전무)
   * **재생성 후 교체**다: 새 업로드로 새 provider 템플릿을 만들고 링크 행의
   * snowsign_template_id 를 in-place UPDATE 한다(행 유지 = bids FK 보존). 옛
   * provider 템플릿은 무해한 고아로 남는다(remove 와 같은 정책).
   */
  async update(
    actor: Actor,
    input: {
      templateId: string;
      name: string;
      uploadToken: string;
      fields: SigningTemplateFieldInput[];
    },
  ): Promise<ServiceResult<{ templateId: string }>> {
    // 소유 대조가 먼저 — 남의 업로드로는 아무것도 하지 않는다(createTemplate 동일).
    const bound = verifyUploadToken(input.uploadToken, actor.workspaceId, Date.now());
    if (!bound.ok) return bound;

    const validation = validateTemplateFields(input.fields);
    if (!validation.ok) return validation;

    // 행 소유 검증은 provider 변이 **앞** — 뒤면 남의 templateId 로도 새 provider
    // 템플릿이 만들어진 다음에야 거부돼 고아만 남는다.
    const owned = await this.requireOwned(input.templateId, actor.workspaceId);
    if (!owned.ok) return owned;

    let created: { templateId: string };
    try {
      created = await this.snowsign.createTemplate({
        name: input.name,
        documentUploadId: bound.uploadId,
        signers: ROLE_LABELS,
        signatureFields: buildSignatureFieldsPayload(input.fields),
        deadlineDays: SIGNING_DEADLINE_DAYS,
      });
    } catch (e) {
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }
    releaseUploadSlotByUploadId(bound.uploadId);

    // 소유 검증과 이 UPDATE 사이의 provider 왕복(최대 15초) 동안 동료의 삭제가
    // 끼어들 수 있다 — 0행 스왑을 성공으로 보고하면 에디터가 거짓 '저장했어요'
    // 를 띄운다. 새 provider 템플릿은 무해한 고아로 남는다(remove 와 같은 정책).
    const swapped = await this.templateRepo.updateProviderTemplate(
      input.templateId,
      created.templateId,
      input.name,
    );
    if (!swapped) return { ok: false, error: 'TEMPLATE_NOT_FOUND' };
    return { ok: true, templateId: input.templateId };
  }

  /**
   * provider 오류 → 서비스 코드. NOT_FOUND 는 TEMPLATE_NOT_FOUND 로 번역한다 —
   * 사용자 문구("삭제됐다면…")가 이미 이 코드에 걸려 있다.
   */
  private translateProviderError(e: unknown): string {
    if (e instanceof SnowSignError) {
      return e.code === 'SNOWSIGN_NOT_FOUND' ? 'TEMPLATE_NOT_FOUND' : e.code;
    }
    return 'SNOWSIGN_ERROR';
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
