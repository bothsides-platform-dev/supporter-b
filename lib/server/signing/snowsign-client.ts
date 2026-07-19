// SnowSign(스노우싸인) Public API 얕은 어댑터 (Direct + Templates).
//
// 서명 위치지정은 SnowSign Templates 에 위임하므로 좌표/PDF 는 다루지 않는다.
// 앱의 유일 소비자는 ContractSigningService — 이 모듈이 SnowSign 시맨틱을
// 격리하는 얕은 seam 이다(교체-용이성은 YAGNI 로 의도적 완화).
//
// 의존성/제약:
//   - `SNOWSIGN_API_KEY` 필수. 없으면 요청 전 `SNOWSIGN_NO_KEY` throw. 키는
//     `X-API-Key` 헤더로만 전달(URL 쿼리 금지 — 로그 표면 유출 방지).
//   - `ky`(시도당 15초 timeout). 429 + 5xx(408/500/502/503/504) 만 자동 재시도
//     (최대 3회, 지수 백오프). 일반 네트워크 오류(TypeError)는 재시도하지 않는다
//     — ky 기본은 네트워크 오류도 재시도하므로 shouldRetry 가 명시 차단.
//   - 멱등: create/send 는 `integration.external_id = signing_contract.id` 로
//     중복 생성/발송을 막는다(호출자 주입).

const DEFAULT_BASE_URL = 'https://api-snowsign.jtsnowball.com/public';
const EXTERNAL_SYSTEM = 'supporter-b';
const SDK_VERSION = '1.0.0';
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export type SnowSignErrorCode =
  | 'SNOWSIGN_NO_KEY'
  | 'SNOWSIGN_INVALID_KEY' // 401 / API_KEY_REQUIRED / INVALID_API_KEY
  | 'SNOWSIGN_VALIDATION' // 400 / VALIDATION_ERROR
  | 'SNOWSIGN_QUOTA_EXCEEDED' // 403 / QUOTA_EXCEEDED
  | 'SNOWSIGN_NOT_FOUND' // 404 / CONTRACT/TEMPLATE/UPLOAD_NOT_FOUND
  | 'SNOWSIGN_UPLOAD_EXPIRED' // UPLOAD_EXPIRED
  | 'SNOWSIGN_PDF_REJECTED' // PDF_REJECTED
  | 'SNOWSIGN_INVALID_STATUS' // INVALID_CONTRACT_STATUS
  | 'SNOWSIGN_RATE_LIMIT' // 429
  | 'SNOWSIGN_MALFORMED' // 2xx 인데 제어흐름 필수 필드 없음/비정상(envelope drift·부분 응답)
  | 'SNOWSIGN_NETWORK'; // 5xx / timeout / 기타

export class SnowSignError extends Error {
  constructor(
    public readonly code: SnowSignErrorCode,
    public readonly providerCode?: string,
    message?: string,
  ) {
    super(message ?? providerCode ?? code);
    this.name = 'SnowSignError';
  }
}

function mapCode(status: number, providerCode?: string): SnowSignErrorCode {
  switch (providerCode) {
    case 'API_KEY_REQUIRED':
    case 'INVALID_API_KEY':
      return 'SNOWSIGN_INVALID_KEY';
    case 'VALIDATION_ERROR':
      return 'SNOWSIGN_VALIDATION';
    case 'QUOTA_EXCEEDED':
      return 'SNOWSIGN_QUOTA_EXCEEDED';
    case 'UPLOAD_NOT_FOUND':
    case 'CONTRACT_NOT_FOUND':
    case 'TEMPLATE_NOT_FOUND':
    case 'TEMPLATE_FILE_NOT_FOUND':
      return 'SNOWSIGN_NOT_FOUND';
    case 'UPLOAD_EXPIRED':
      return 'SNOWSIGN_UPLOAD_EXPIRED';
    case 'PDF_REJECTED':
      return 'SNOWSIGN_PDF_REJECTED';
    case 'INVALID_CONTRACT_STATUS':
      return 'SNOWSIGN_INVALID_STATUS';
    default:
      break;
  }
  if (status === 400) return 'SNOWSIGN_VALIDATION';
  if (status === 401) return 'SNOWSIGN_INVALID_KEY';
  if (status === 403) return 'SNOWSIGN_QUOTA_EXCEEDED';
  if (status === 404) return 'SNOWSIGN_NOT_FOUND';
  if (status === 429) return 'SNOWSIGN_RATE_LIMIT';
  return 'SNOWSIGN_NETWORK';
}

// 네트워크/timeout(fetch reject) → NETWORK. HTTP 상태 오류는 request() 가 직접
// 본문을 읽어 매핑하므로 여기로 오지 않는다.
function mapNetworkError(e: unknown): SnowSignError {
  if (e instanceof SnowSignError) return e;
  const name = (e as { name?: string })?.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new SnowSignError('SNOWSIGN_NETWORK', undefined, 'timeout');
  }
  return new SnowSignError('SNOWSIGN_NETWORK', undefined, (e as Error)?.message);
}

// ── 응답 값 검증 (fail-safe, not fail-strict) ─────────────────────────────
// 2xx 응답을 `as T` 로 캐스팅한 뒤 매퍼가 필드를 dereference 하므로, 제어흐름에
// 쓰는 필수 필드가 없거나(envelope drift·부분 응답) 타입이 어긋나면 하류에서
// 정체불명 TypeError 로 터진다. 여기서 필수 필드만 검증해 typed SNOWSIGN_MALFORMED
// 로 승격하고(호출부의 기존 try/catch 가 우아하게 처리), 비필수 필드는 관대하게
// coerce 한다. 전체 스키마 엄격 검증은 하지 않는다(Phase 11 실 sandbox 전 — 정상
// 응답을 거부하면 오히려 새 취약점).
function reqString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v === '') {
    throw new SnowSignError('SNOWSIGN_MALFORMED', undefined, `invalid ${field}`);
  }
  return v;
}
function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function reqAbsoluteUrl(v: unknown, field: string): string {
  const s = reqString(v, field);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new SnowSignError('SNOWSIGN_MALFORMED', undefined, `invalid ${field}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SnowSignError('SNOWSIGN_MALFORMED', undefined, `invalid ${field}`);
  }
  return s;
}

// ── I/O 타입 (얕은 매핑, snake→camel) ────────────────────────────────────
export type EmbedSessionInput = {
  purpose: string; // 'contract_create'
  allowedOrigins: string[];
  flows: string[]; // ['template_draft'] 등
  externalSystem?: string;
  externalId?: string;
  referenceId?: string;
};
export type EmbedSession = { sessionId: string; iframeUrl: string; codeExpiresAt?: string };

export type CreateContractParticipant = {
  name: string;
  email: string;
  phone?: string;
  role: string; // 템플릿 role_name
  securityMethod?: 'easy_cert' | 'email';
  mobileAlimtalkEnabled?: boolean;
};
export type CreateContractInput = {
  title: string;
  description?: string;
  participants: CreateContractParticipant[];
  variables?: Record<string, string | boolean>;
  signingOrder?: 'parallel' | 'sequential';
  externalId?: string; // 멱등 키(signing_contract.id)
};
export type SnowSignContractRef = {
  contractId: string;
  title?: string;
  status: string;
  sentAt?: string;
};

export type SnowSignParticipantsStatus = { total: number; signed: number; pending: number };
export type SnowSignStatus = {
  contractId?: string;
  status: string;
  participantsStatus?: SnowSignParticipantsStatus;
};
export type SnowSignContractParticipant = {
  name: string;
  email: string;
  phone?: string;
  status: string;
  signedAt?: string;
  securityMethod?: string;
};
export type SnowSignContractDetail = {
  contractId: string;
  title?: string;
  status: string;
  participants: SnowSignContractParticipant[];
  expiresAt?: string;
};

export type SnowSignDownload = { downloadUrl: string; filename?: string; expiresAt?: string };

export type SnowSignTemplateSigner = {
  uuid?: string;
  roleName: string;
  signingOrder?: number;
  securityMethod?: string;
  mobileAlimtalkEnabled?: boolean;
};
export type SnowSignTemplateVariable = {
  name: string;
  label?: string;
  valueType?: string;
  isRequired?: boolean;
};
export type SnowSignTemplateSummary = {
  templateId: string;
  name: string;
  description?: string;
  signingOrder?: string;
  deadlineDays?: number;
};
export type SnowSignTemplateDetail = SnowSignTemplateSummary & {
  signers: SnowSignTemplateSigner[];
  variables: SnowSignTemplateVariable[];
};

export interface SnowSignClient {
  createEmbedSession(input: EmbedSessionInput): Promise<EmbedSession>;
  listTemplates(): Promise<SnowSignTemplateSummary[]>;
  getTemplate(templateId: string): Promise<SnowSignTemplateDetail>;
  createContractFromTemplate(
    templateId: string,
    input: CreateContractInput,
  ): Promise<SnowSignContractRef>;
  getContract(contractId: string): Promise<SnowSignContractDetail>;
  getStatus(contractId: string): Promise<SnowSignStatus>;
  sendContract(contractId: string, message?: string): Promise<SnowSignContractRef>;
  downloadUrl(contractId: string): Promise<SnowSignDownload>;
  auditCertificateUrl(contractId: string): Promise<SnowSignDownload>;
  remind(contractId: string, participantUuids?: string[], message?: string): Promise<void>;
  cancel(contractId: string, reason?: string): Promise<void>;
}

function toSnowSignParticipant(p: CreateContractParticipant): Record<string, unknown> {
  const out: Record<string, unknown> = { name: p.name, email: p.email, role: p.role };
  if (p.phone) out.phone = p.phone;
  if (p.mobileAlimtalkEnabled !== undefined) out.mobile_alimtalk_enabled = p.mobileAlimtalkEnabled;
  // easy_cert(휴대폰 간편인증) → identity_verification. email 은 기본이라 security 생략.
  if (p.securityMethod === 'easy_cert') out.security = { method: 'identity_verification' };
  return out;
}

type DownloadRow = { download_url: string; filename?: string; expires_at?: string };

const MAX_RETRIES = 3;

export type RealSnowSignClientOpts = {
  /** 테스트 전용 — 재시도 딜레이 결정화(예: () => 0). */
  retryDelay?: (attemptCount: number) => number;
  /** 테스트 전용 — 재시도 대기 sleep 주입(미지정 시 setTimeout). */
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
  timeoutMs?: number;
};

export class RealSnowSignClient implements SnowSignClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryDelay: (attemptCount: number) => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: RealSnowSignClientOpts = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.SNOWSIGN_API_URL ?? DEFAULT_BASE_URL;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    // 기본 지수 백오프 200/400/800ms(2000ms 캡). 테스트는 () => 0 주입.
    this.retryDelay = opts.retryDelay ?? ((n) => Math.min(2000, 200 * 2 ** (n - 1)));
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const key = process.env.SNOWSIGN_API_KEY;
    if (!key) throw new SnowSignError('SNOWSIGN_NO_KEY');
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        'X-API-Key': key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
    // 명시적 재시도 루프 — 429 + 5xx(408/500/502/503/504) 만 재시도하고
    // 네트워크 오류(TypeError)/timeout 은 재시도하지 않는다. 본문은 1회만 읽는다.
    for (let attempt = 0; ; attempt += 1) {
      let res: Response;
      try {
        res = await fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (e) {
        throw mapNetworkError(e);
      }
      if (res.ok) {
        const json = (await res.json().catch(() => undefined)) as { data?: T } | undefined;
        return json?.data as T;
      }
      if (RETRY_STATUS.has(res.status) && attempt < MAX_RETRIES) {
        await this.sleep(this.retryDelay(attempt + 1));
        continue;
      }
      const json = (await res.json().catch(() => undefined)) as
        | { error?: { code?: string } }
        | undefined;
      const providerCode = json?.error?.code;
      throw new SnowSignError(mapCode(res.status, providerCode), providerCode, `HTTP ${res.status}`);
    }
  }

  async createEmbedSession(input: EmbedSessionInput): Promise<EmbedSession> {
    const body: Record<string, unknown> = {
      purpose: input.purpose,
      allowed_origins: input.allowedOrigins,
      flows: input.flows,
    };
    if (input.externalSystem) body.external_system = input.externalSystem;
    if (input.externalId) body.external_id = input.externalId;
    if (input.referenceId) body.reference_id = input.referenceId;
    const d = await this.request<
      { session_id?: string; iframe_url?: string; code_expires_at?: string } | undefined
    >('POST', '/v1/embed-sessions', body);
    return {
      sessionId: reqString(d?.session_id, 'session_id'),
      iframeUrl: reqString(d?.iframe_url, 'iframe_url'),
      codeExpiresAt: d?.code_expires_at,
    };
  }

  async listTemplates(): Promise<SnowSignTemplateSummary[]> {
    const d = await this.request<
      | Array<{
          template_id: string;
          name: string;
          description?: string;
          signing_order?: string;
          deadline_days?: number;
        }>
      | undefined
    >('GET', '/v1/templates?per_page=100');
    return (Array.isArray(d) ? d : []).map((t) => ({
      templateId: asString(t?.template_id),
      name: asString(t?.name),
      description: t?.description,
      signingOrder: t?.signing_order,
      deadlineDays: t?.deadline_days,
    }));
  }

  async getTemplate(templateId: string): Promise<SnowSignTemplateDetail> {
    const d = await this.request<{
      template_id: string;
      name: string;
      description?: string;
      signing_order?: string;
      deadline_days?: number;
      signers?: Array<{
        uuid?: string;
        role_name: string;
        signing_order?: number;
        security_method?: string;
        mobile_alimtalk_enabled?: boolean;
      }>;
      variables?: Array<{ name: string; label?: string; value_type?: string; is_required?: boolean }>;
    } | undefined>('GET', `/v1/templates/${encodeURIComponent(templateId)}`);
    return {
      templateId: reqString(d?.template_id, 'template_id'),
      name: asString(d?.name),
      description: d?.description,
      signingOrder: d?.signing_order,
      deadlineDays: d?.deadline_days,
      signers: (d?.signers ?? []).map((s) => ({
        uuid: s?.uuid,
        roleName: asString(s?.role_name),
        signingOrder: s?.signing_order,
        securityMethod: s?.security_method,
        mobileAlimtalkEnabled: s?.mobile_alimtalk_enabled,
      })),
      variables: (d?.variables ?? []).map((v) => ({
        name: asString(v?.name),
        label: v?.label,
        valueType: v?.value_type,
        isRequired: v?.is_required,
      })),
    };
  }

  async createContractFromTemplate(
    templateId: string,
    input: CreateContractInput,
  ): Promise<SnowSignContractRef> {
    const body: Record<string, unknown> = {
      title: input.title,
      participants: input.participants.map(toSnowSignParticipant),
      integration: {
        external_system: EXTERNAL_SYSTEM,
        sdk_version: SDK_VERSION,
        ...(input.externalId ? { external_id: input.externalId } : {}),
      },
    };
    if (input.description) body.description = input.description;
    if (input.variables) body.variables = input.variables;
    if (input.signingOrder) body.signing_order = input.signingOrder;
    const d = await this.request<
      { contract_id?: string; title?: string; status?: string } | undefined
    >('POST', `/v1/templates/${encodeURIComponent(templateId)}/create-contract`, body);
    return { contractId: reqString(d?.contract_id, 'contract_id'), title: d?.title, status: asString(d?.status) };
  }

  async getContract(contractId: string): Promise<SnowSignContractDetail> {
    const d = await this.request<{
      contract_id: string;
      title?: string;
      status: string;
      expires_at?: string;
      participants?: Array<{
        name: string;
        email: string;
        phone?: string | null;
        status: string;
        signed_at?: string | null;
        security_method?: string;
      }>;
    } | undefined>('GET', `/v1/contracts/${encodeURIComponent(contractId)}`);
    return {
      contractId: reqString(d?.contract_id, 'contract_id'),
      title: d?.title,
      status: reqString(d?.status, 'status'),
      expiresAt: d?.expires_at,
      participants: (d?.participants ?? []).map((p) => ({
        name: asString(p?.name),
        email: asString(p?.email),
        phone: p?.phone ?? undefined,
        status: asString(p?.status),
        signedAt: p?.signed_at ?? undefined,
        securityMethod: p?.security_method,
      })),
    };
  }

  async getStatus(contractId: string): Promise<SnowSignStatus> {
    const d = await this.request<{
      contract_id?: string;
      status: string;
      participants_status?: { total: number; signed: number; pending: number };
    }>('GET', `/v1/contracts/${encodeURIComponent(contractId)}/status`);
    return {
      contractId: d.contract_id,
      status: d.status,
      participantsStatus: d.participants_status,
    };
  }

  async sendContract(contractId: string, message?: string): Promise<SnowSignContractRef> {
    const d = await this.request<
      { contract_id?: string; status?: string; sent_at?: string } | undefined
    >('POST', `/v1/contracts/${encodeURIComponent(contractId)}/send`, message ? { message } : {});
    // 발송 성공(2xx)이면 body 가 drift 해도 실패로 오분류하지 않는다(이미 발송된
    // 라이브 계약을 보상 취소해 고아로 만드는 것 방지) — 입력 contractId 로 fallback.
    return {
      contractId: asString(d?.contract_id) || contractId,
      status: asString(d?.status) || 'sent',
      sentAt: d?.sent_at,
    };
  }

  async downloadUrl(contractId: string): Promise<SnowSignDownload> {
    const d = await this.request<DownloadRow | undefined>(
      'GET',
      `/v1/contracts/${encodeURIComponent(contractId)}/download`,
    );
    return {
      downloadUrl: reqAbsoluteUrl(d?.download_url, 'download_url'),
      filename: d?.filename,
      expiresAt: d?.expires_at,
    };
  }

  async auditCertificateUrl(contractId: string): Promise<SnowSignDownload> {
    const d = await this.request<DownloadRow | undefined>(
      'GET',
      `/v1/contracts/${encodeURIComponent(contractId)}/audit-certificate`,
    );
    return {
      downloadUrl: reqAbsoluteUrl(d?.download_url, 'download_url'),
      filename: d?.filename,
      expiresAt: d?.expires_at,
    };
  }

  async remind(contractId: string, participantUuids?: string[], message?: string): Promise<void> {
    const body: Record<string, unknown> = {};
    if (message) body.message = message;
    if (participantUuids && participantUuids.length > 0) body.participant_uuids = participantUuids;
    await this.request('POST', `/v1/contracts/${encodeURIComponent(contractId)}/remind`, body);
  }

  async cancel(contractId: string, reason?: string): Promise<void> {
    await this.request(
      'POST',
      `/v1/contracts/${encodeURIComponent(contractId)}/cancel`,
      reason ? { reason } : {},
    );
  }
}

// ── Injection point (getNtsClient 패턴 미러) ──────────────────────────────
declare global {
  var __bidit_snowsign_client__: SnowSignClient | undefined;
}

let _real: RealSnowSignClient | undefined;

export function getSnowSignClient(): SnowSignClient {
  if (globalThis.__bidit_snowsign_client__) return globalThis.__bidit_snowsign_client__;
  if (!_real) _real = new RealSnowSignClient();
  return _real;
}

export function __setSnowSignClientForTest(client: SnowSignClient | undefined): void {
  globalThis.__bidit_snowsign_client__ = client;
}
