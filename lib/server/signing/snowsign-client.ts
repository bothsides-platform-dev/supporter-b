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
//   - 멱등: **없다.** 비멱등 POST(`create-contract`·`send`·`remind`·`uploads`·
//     `templates`)는 문서상 멱등키를 받지 않는다 — `integration.external_id` 는
//     `POST /v1/contracts`(건별 생성, 미사용)에만 실질 의미가 있다. 그래서 이
//     경로들은 5xx 를 재시도하지 않는다(MUTATING_RETRY_STATUS) — 502/504 는 서버가
//     이미 실행했을 수 있는 모호 상태라, 재시도가 서명 메일 이중 발송(send)·유령
//     업로드 세션(uploads — 조직 3슬롯 소진)·중복 템플릿(templates)을 만든다.
//     실패의 뒷수습은 호출자(sendFromTemplate 의 H3 프로브 등)가 실상태를 재조회해
//     맡는다. 429 만은 "처리 전 거절"이라 재시도해도 안전하다.

import type { SnowSignSignatureFieldInput } from '@/lib/signing/template-fields';

const DEFAULT_BASE_URL = 'https://api-snowsign.jtsnowball.com/public';
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);
// 비멱등 POST(발송·리마인드·계약 생성) 전용 — 위 헤더 주석 참조.
const MUTATING_RETRY_STATUS = new Set([429]);

/**
 * `integration.external_system` / 임베드 세션의 `external_system` 에 쓰는 우리 쪽
 * 시스템 식별자. 임베드 경로는 호출자가 주입하는 seam 을 유지하되 값의 출처는
 * 여기 하나다 — 두 리터럴로 두면 공급자측 로그에서 같은 시스템이 둘로 보인다.
 */
export const EXTERNAL_SYSTEM = 'supporter-b';

export type SnowSignErrorCode =
  | 'SNOWSIGN_NO_KEY'
  | 'SNOWSIGN_INVALID_KEY' // 401 / API_KEY_REQUIRED / INVALID_API_KEY
  | 'SNOWSIGN_VALIDATION' // 400 / VALIDATION_ERROR
  | 'SNOWSIGN_QUOTA_EXCEEDED' // 403 / QUOTA_EXCEEDED
  | 'SNOWSIGN_NOT_FOUND' // 404 / CONTRACT/TEMPLATE/UPLOAD_NOT_FOUND
  | 'SNOWSIGN_UPLOAD_EXPIRED' // UPLOAD_EXPIRED
  | 'SNOWSIGN_PDF_REJECTED' // PDF_REJECTED
  | 'SNOWSIGN_INVALID_STATUS' // INVALID_CONTRACT_STATUS
  | 'SNOWSIGN_EMBED_SESSION_ACTIVE' // 409 / EMBED_SESSION_ALREADY_ACTIVE
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
    // 같은 external_id 로 임베드 세션이 이미 살아 있다. 우리는 세션마다 nonce 를
    // 붙이므로 정상 흐름에선 나오지 않지만, 나오면 네트워크 오류로 뭉뚱그리지 않는다.
    case 'EMBED_SESSION_ALREADY_ACTIVE':
      return 'SNOWSIGN_EMBED_SESSION_ACTIVE';
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
// 좌표·크기처럼 값 자체가 load-bearing 인 숫자 전용 — 문자열 숫자도 거부한다
// (조용히 coerce 하면 provider 표기 드리프트가 좌표 0 뭉개짐으로 숨는다).
function reqFiniteNumber(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new SnowSignError('SNOWSIGN_MALFORMED', undefined, `invalid ${field}`);
  }
  return v;
}
// timestamptz 컬럼으로 흘러드는 값 전용 — 파싱 불가 문자열이 `new Date()` 에서
// Invalid Date 가 되면 저장 계층 직렬화가 던지고, reconcile 이 매 폴 같은 실패를
// 반복하는 poison pill 이 된다(비교도 NaN!==NaN 으로 항상 참). 경계에서 버린다.
function asIsoDate(v: unknown): string | undefined {
  return typeof v === 'string' && Number.isFinite(new Date(v).getTime()) ? v : undefined;
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
  /** `email_delivery.status` — 'bounced' 면 서명 요청 메일이 반송됐다. */
  emailDelivery?: string;
};
export type SnowSignContractDetail = {
  contractId: string;
  title?: string;
  status: string;
  participants: SnowSignContractParticipant[];
  expiresAt?: string;
  /** 실측으로 확인된 회신 필드 — 고아 복구가 후보를 사람에게 보여줄 때 쓰는 주 단서. */
  createdAt?: string;
  sentAt?: string;
  /**
   * 우리가 임베드 세션에 넣었던 `external_id`(`sc:<signingContractId>`)의 회신.
   * 건별 임베드는 계약을 브라우저 안에서 만들기 때문에 서버가 contract_id 를
   * 동기적으로 받지 못한다 — 이 값이 되돌아오면 "이 계약이 정말 우리 것인가"를
   * 서버에서 증명할 수 있다. 회신 여부는 실측 전이므로(docs/SNOWSIGN_SANDBOX.md
   * Q3) 호출부는 undefined 를 정상으로 다뤄야 한다.
   */
  externalId?: string;
};


export type SnowSignDownload = { downloadUrl: string; filename?: string; expiresAt?: string };

/** `GET /v1/contracts` 목록 행 — 상세보다 얇다(참여자가 없다). */
export type SnowSignContractSummary = {
  contractId: string;
  title?: string;
  status: string;
  createdAt?: string;
  sentAt?: string;
};

/** 목록 한 페이지 + 잘림 판정 재료. */
export type SnowSignContractPage = {
  rows: SnowSignContractSummary[];
  totalPages: number;
};

export type SnowSignUploadSession = {
  uploadId: string;
  uploadUrl: string;
  fields: Record<string, string>;
  maxSizeBytes: number;
};

export type SnowSignTemplateRef = { templateId: string };

/**
 * `GET /v1/templates/{id}` 의 signature_fields 행 — 쓰기의 `role` 이 아니라
 * **`role_name`** 으로 회신된다(실측, docs/SNOWSIGN_SANDBOX.md). `type` 은 raw 로
 * 통과시킨다 — 지원 타입 판정(fail-closed)은 서비스가 소유한다.
 */
export type SnowSignTemplateFieldRow = {
  roleName: string;
  type: string;
  pageNumber: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
};

export type SnowSignTemplateDetail = {
  templateId: string;
  name?: string;
  /**
   * 템플릿이 변수(type: variable — detail 의 `variables[]`)를 실었는가. 우리
   * 에디터에는 변수 개념이 없어 재생성 저장이 변수를 되살릴 수 없다 — 서비스가
   * 이 신호로 fail-closed(TEMPLATE_UNSUPPORTED) 판정한다(조용히 저장 = 소실).
   */
  hasVariables: boolean;
  signatureFields: SnowSignTemplateFieldRow[];
};

export type SnowSignTemplateContractRef = { contractId: string; status: string };

export type SnowSignSendResult = { contractId: string; status: string; sentAt?: string };

export interface SnowSignClient {
  createEmbedSession(input: EmbedSessionInput): Promise<EmbedSession>;
  /**
   * 계약 목록. **고아 복구 전용**이다 — 완료 postMessage 가 유실돼 우리가 id 를 못 받은
   * 계약을 찾는 첫 단계. 단일 org 키라 다른 테넌트의 계약도 함께 보이므로, 이 결과만으로
   * 무엇을 결정해선 안 되고 반드시 상세 조회의 참여자 이메일로 좁혀야 한다.
   */
  listContracts(
    opts?: { status?: string; page?: number; perPage?: number } & SnowSignCallOpts,
  ): Promise<SnowSignContractPage>;
  getContract(contractId: string, opts?: SnowSignCallOpts): Promise<SnowSignContractDetail>;
  getStatus(contractId: string): Promise<SnowSignStatus>;
  downloadUrl(contractId: string): Promise<SnowSignDownload>;
  auditCertificateUrl(contractId: string): Promise<SnowSignDownload>;
  remind(contractId: string, participantUuids?: string[], message?: string): Promise<void>;
  cancel(contractId: string, reason?: string): Promise<void>;
  createUploadSession(input: {
    purpose: 'contract_document' | 'template_document';
    filename: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<SnowSignUploadSession>;
  createTemplate(input: {
    name: string;
    documentUploadId: string;
    signers: string[];
    signatureFields: SnowSignSignatureFieldInput[];
    /** 서명 마감(일) — 안 보내면 이 템플릿의 계약은 만료되지 않는다(T9 실측). */
    deadlineDays?: number;
  }): Promise<SnowSignTemplateRef>;
  createContractFromTemplate(
    templateId: string,
    input: {
      title: string;
      /**
       * `phone` 은 템플릿 역할이 `easy_cert`(우리가 만드는 모든 템플릿)일 때
       * **필수**다 — 빠지면 공급자가 `VALIDATION_ERROR` 400 을 낸다(실측).
       * 호출자가 `resolveSecurityMethod` 로 010 검증까지 마친 값을 넣는다.
       */
      participants: { role: string; name: string; email: string; phone: string }[],
    },
  ): Promise<SnowSignTemplateContractRef>;
  /**
   * 업로드 PDF 로 계약 **초안**을 만든다 — 참여자별 서명 보안(본인인증)을 우리가
   * 실을 수 있는 **유일한 경로**다. 템플릿 경로의 `security` 는 password 전용이고
   * 인증수단은 템플릿 역할 정책이며, 그 정책은 `POST /v1/templates` 요청 스펙에
   * 없다(문서 v1.7).
   *
   * `send_immediately` 는 의도적으로 지원하지 않는다 — 초안 생성과 발송을 갈라야
   * provider 호출과 로컬 영속 사이의 크래시가 "발송됐는데 추적 불가한 고아"가
   * 되지 않는다(초안은 취소 가능함을 실측 확인).
   */
  createContract(input: SnowSignCreateContractInput): Promise<SnowSignTemplateContractRef>;
  sendContract(contractId: string, message?: string): Promise<SnowSignSendResult>;
  /**
   * 템플릿 상세 — 수정 플로가 기존 서명칸 좌표를 되읽는 유일한 출처(로컬 DB 는
   * 링크 행만 갖는다). 좌표는 저장 시 그대로 되돌아가는 load-bearing 데이터라
   * 비정상 값은 SNOWSIGN_MALFORMED 로 거부한다(관대 coerce 금지).
   */
  getTemplate(templateId: string): Promise<SnowSignTemplateDetail>;
  /**
   * 템플릿 원본 PDF 의 1시간 임시 URL — 응답은 PDF 바이트가 아니라 JSON 봉투다
   * (실측 T5). 소비자는 프록시 라우트(서버 측 즉시 fetch)라 만료는 실질 무관.
   */
  templateDownloadUrl(templateId: string): Promise<SnowSignDownload>;
}

/**
 * PDF 직행 계약 생성의 참여자. `phone`·`security` 는 **둘 다 있거나 둘 다 없다** —
 * 간편인증은 휴대폰 번호가 필수이고, 반대로 이메일 인증 참여자에게 `security` 를
 * 보내면 공급자가 거부한다("이메일/간편인증 역할에는 전달하지 않습니다").
 * 이 짝을 만드는 곳은 `lib/signing/security-method.ts` 하나다.
 */
export type SnowSignContractParticipantInput = {
  role: string;
  name: string;
  email: string;
  phone?: string;
  security?: { method: 'identity_verification' };
};

export type SnowSignCreateContractInput = {
  title: string;
  documentUploadId: string;
  participants: SnowSignContractParticipantInput[];
  signatureFields: SnowSignSignatureFieldInput[];
  /**
   * 상관키. 공급자가 **되돌려주지 않으므로**(실측) 소유 검증·중복 탐지에는 쓸 수
   * 없다 — 공급자측 지원 문의용 best-effort 표식이다.
   */
  externalId?: string;
  /**
   * 서명 마감(일). 문서 v1.7 의 요청 스펙에 없는 필드다 — 수락 여부가 실측
   * 대상이라 호출자가 명시할 때만 싣는다.
   */
  deadlineDays?: number;
};

type DownloadRow = { download_url: string; filename?: string; expires_at?: string };

// `external_id` 회신 위치가 실측 전이라(docs/SNOWSIGN_SANDBOX.md Q3) 문서에 나온
// integration 하위와 최상위 양쪽을 본다. 없으면 undefined — 정상 경로다.
function pickExternalId(row: { external_id?: unknown; integration?: { external_id?: unknown } } | undefined):
  | string
  | undefined {
  const v = row?.integration?.external_id ?? row?.external_id;
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** Retry-After 헤더 파싱 — 초 단위 정수 또는 HTTP-date. 못 읽으면 undefined. */
function parseRetryAfterMs(v: string | null): number | undefined {
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const at = Date.parse(v);
  if (!Number.isNaN(at)) return Math.max(0, at - Date.now());
  return undefined;
}

const MAX_RETRIES = 3;

/**
 * 호출별 옵션. `maxRetries` 는 경로별 재시도 예산 — 폴링·복구 스캔처럼 다음
 * 틱/클릭이 만회하는 경로는 1 로 줄여, 공유 rate limit(조직 전체 100 req/분)을
 * 실패 재시도가 혼자 소진하는 4배 승수를 없앤다. 대화형(발송·attach)은 기본 3.
 */
export type SnowSignCallOpts = { signal?: AbortSignal; maxRetries?: number };

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

  /**
   * 응답 봉투를 통째로 돌려준다. 대부분의 호출자는 `data` 만 필요해 `request()` 를
   * 쓰지만, 목록 조회는 `meta.pagination` 으로 잘림을 판정해야 해서 봉투가 필요하다.
   *
   * `opts.signal` 은 **호출자의 예산**이다. 이 클라이언트에는 총 데드라인이 없어
   * (호출당 최악 = 4시도 × 15초 + 백오프 ≈ 61초) 사람이 기다리는 경로에서는 호출자가
   * 시간을 쥐어야 한다. 두 곳에 건다: fetch 자체(진행 중 호출을 끊는다)와 **재시도
   * 직전**(예산이 끝났으면 다음 시도를 아예 안 내보낸다 — 이게 없으면 429 폭풍이
   * 시계를 계속 재무장시켜 데드라인이 무의미해진다).
   */
  private async requestEnvelope<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: SnowSignCallOpts & { retryStatuses?: ReadonlySet<number> },
  ): Promise<{ data?: T; meta?: { pagination?: { total_pages?: number } } } | undefined> {
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
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
      let res: Response;
      try {
        res = await fetch(url, { ...init, signal });
      } catch (e) {
        throw mapNetworkError(e);
      }
      if (res.ok) {
        return (await res.json().catch(() => undefined)) as
          | { data?: T; meta?: { pagination?: { total_pages?: number } } }
          | undefined;
      }
      const retryBudget = opts?.maxRetries ?? MAX_RETRIES;
      const retryStatuses = opts?.retryStatuses ?? RETRY_STATUS;
      if (retryStatuses.has(res.status) && attempt < retryBudget && !opts?.signal?.aborted) {
        // 429 의 Retry-After 는 "언제 다시 와라"다 — 무시하고 고정 백오프로 때리면
        // 정확히 포화된 순간에 부하를 배가시킨다. 초 단위/HTTP-date 둘 다 받고,
        // 대화형 클릭이 몇 분씩 잠기지 않도록 10초로 캡한다.
        const retryAfter = res.status === 429 ? parseRetryAfterMs(res.headers.get('Retry-After')) : undefined;
        // (#7) 호출자가 예산 신호(signal)를 걸었으면 데드라인 아래에서 돌아야 한다 —
        // Retry-After 가 10초를 재우면 12초 복구 데드라인이 안에서 재무장돼 브라우저가
        // 먼저 끊는다. 그런 경로는 기존 백오프 캡(2s)으로 눌러 둔다.
        const retryAfterCap = opts?.signal ? 2_000 : 10_000;
        await this.sleep(
          retryAfter !== undefined
            ? Math.min(retryAfterCap, retryAfter)
            : this.retryDelay(attempt + 1),
        );
        continue;
      }
      const json = (await res.json().catch(() => undefined)) as
        | { error?: { code?: string } }
        | undefined;
      const providerCode = json?.error?.code;
      throw new SnowSignError(mapCode(res.status, providerCode), providerCode, `HTTP ${res.status}`);
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: SnowSignCallOpts & { retryStatuses?: ReadonlySet<number> },
  ): Promise<T> {
    const env = await this.requestEnvelope<T>(method, path, body, opts);
    return env?.data as T;
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
      // 절대 http(s) URL 만 받는다 — 이 값은 그대로 `<iframe src>` 가 되고, 동시에
      // SigningSendEmbed 의 postMessage 신뢰 오리진(`new URL(iframeUrl).origin`)
      // 도 여기서 파생된다. reqString 만 걸면 `javascript:`·`data:` 가 통과하는데,
      // 그 경우 origin 이 빈 문자열이 아니라 문자열 "null" 이라 그쪽 fail-closed
      // 가드(`if (!origin || ...)`)가 트립하지 않고, opaque origin 프레임이 보내는
      // e.origin("null")과 비교가 통과해 버린다. 상대 경로도 프레임 대상이 우리
      // 오리진으로 해석되므로 함께 막는다. 정상 응답은 영향받지 않는다.
      iframeUrl: reqAbsoluteUrl(d?.iframe_url, 'iframe_url'),
      codeExpiresAt: d?.code_expires_at,
    };
  }

  async listContracts(
    opts: { status?: string; page?: number; perPage?: number } & SnowSignCallOpts = {},
  ): Promise<SnowSignContractPage> {
    const q = new URLSearchParams();
    if (opts.status) q.set('status', opts.status);
    if (opts.page) q.set('page', String(opts.page));
    if (opts.perPage) q.set('per_page', String(opts.perPage));
    const qs = q.toString();
    const env = await this.requestEnvelope<
      Array<{
        contract_id?: string;
        title?: string;
        status?: string;
        created_at?: string;
        sent_at?: string;
      }>
    >('GET', `/v1/contracts${qs ? `?${qs}` : ''}`, undefined, { signal: opts.signal });
    const d = env?.data;
    // 형태 드리프트에 관대하다 — 복구는 보조 경로라, 던져서 화면을 깨뜨리는 것보다
    // 빈 목록으로 넘어가는 편이 낫다(사용자에게는 '못 찾았어요'로 보인다).
    if (!Array.isArray(d)) return { rows: [], totalPages: 1 };
    const rows = d.flatMap((r) => {
      const id = asString(r?.contract_id);
      if (!id) return [];
      return [
        {
          contractId: id,
          title: r?.title,
          status: asString(r?.status),
          createdAt: asIsoDate(r?.created_at),
          sentAt: asIsoDate(r?.sent_at),
        },
      ];
    });
    const total = env?.meta?.pagination?.total_pages;
    return { rows, totalPages: typeof total === 'number' && total > 0 ? total : 1 };
  }

  async getContract(
    contractId: string,
    opts?: SnowSignCallOpts,
  ): Promise<SnowSignContractDetail> {
    const d = await this.request<{
      contract_id: string;
      title?: string;
      status: string;
      expires_at?: string;
      created_at?: string;
      sent_at?: string;
      external_id?: string;
      integration?: { external_id?: string };
      participants?: Array<{
        name: string;
        email: string;
        phone?: string | null;
        status: string;
        signed_at?: string | null;
        security_method?: string;
        email_delivery?: { status?: string } | null;
      }>;
    } | undefined>('GET', `/v1/contracts/${encodeURIComponent(contractId)}`, undefined, opts);
    return {
      contractId: reqString(d?.contract_id, 'contract_id'),
      title: d?.title,
      status: reqString(d?.status, 'status'),
      // 날짜는 전부 asIsoDate — sent_at/signed_at 은 timestamptz 로 흘러들어
      // 한 필드만 지키면 나머지가 같은 poison pill 이 된다(특히 sent_at 은 바인딩
      // tx 를 깨 계약을 영구 고아로 만든다).
      expiresAt: asIsoDate(d?.expires_at),
      createdAt: asIsoDate(d?.created_at),
      sentAt: asIsoDate(d?.sent_at),
      externalId: pickExternalId(d),
      participants: (d?.participants ?? []).map((p) => ({
        name: asString(p?.name),
        email: asString(p?.email),
        phone: p?.phone ?? undefined,
        status: asString(p?.status),
        signedAt: asIsoDate(p?.signed_at),
        securityMethod: p?.security_method,
        // 소문자 정규화 — 화면의 'bounced' 리터럴 판정이 provider 표기 변화(Bounced)에
        // 조용히 꺼지지 않게 한다.
        emailDelivery:
          typeof p?.email_delivery?.status === 'string' && p.email_delivery.status !== ''
            ? p.email_delivery.status.toLowerCase()
            : undefined,
      })),
    };
  }

  async getStatus(contractId: string): Promise<SnowSignStatus> {
    const d = await this.request<
      | { contract_id?: string; status: string; participants_status?: { total: number; signed: number; pending: number } }
      | undefined
    >('GET', `/v1/contracts/${encodeURIComponent(contractId)}/status`);
    return {
      contractId: d?.contract_id,
      status: reqString(d?.status, 'status'),
      participantsStatus: d?.participants_status,
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
    await this.request('POST', `/v1/contracts/${encodeURIComponent(contractId)}/remind`, body, {
      retryStatuses: MUTATING_RETRY_STATUS,
    });
  }

  async cancel(contractId: string, reason?: string): Promise<void> {
    await this.request(
      'POST',
      `/v1/contracts/${encodeURIComponent(contractId)}/cancel`,
      reason ? { reason } : {},
    );
  }

  async createUploadSession(input: {
    purpose: 'contract_document' | 'template_document';
    filename: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<SnowSignUploadSession> {
    const d = await this.request<
      | { upload_id?: string; upload_url?: string; fields?: Record<string, string>; max_size_bytes?: number }
      | undefined
    >(
      'POST',
      '/v1/uploads',
      {
        purpose: input.purpose,
        filename: input.filename,
        content_type: input.contentType,
        size_bytes: input.sizeBytes,
      },
      // 비멱등 + 대가가 크다: 업로드 세션은 조직(API 키) 공유 동시 3개·해제 API 없음·
      // TTL 10분이라, 모호 5xx 재시도가 유령 세션을 만들면 모든 PG 의 템플릿 업로드가
      // 10분간 막힌다(로컬 회계는 provider 쪽 유령을 보지 못한다).
      { retryStatuses: MUTATING_RETRY_STATUS },
    );
    return {
      uploadId: reqString(d?.upload_id, 'upload_id'),
      uploadUrl: reqAbsoluteUrl(d?.upload_url, 'upload_url'),
      fields: d?.fields ?? {},
      maxSizeBytes: typeof d?.max_size_bytes === 'number' ? d.max_size_bytes : 52_428_800,
    };
  }

  async createTemplate(input: {
    name: string;
    documentUploadId: string;
    signers: string[];
    signatureFields: SnowSignSignatureFieldInput[];
    deadlineDays?: number;
  }): Promise<SnowSignTemplateRef> {
    const d = await this.request<{ template_id?: string } | undefined>('POST', '/v1/templates', {
      name: input.name,
      document_upload_id: input.documentUploadId,
      ...(input.deadlineDays !== undefined ? { deadline_days: input.deadlineDays } : {}),
      // 본인인증 기본강제. 인증수단은 **템플릿 역할 단위**로만 저장되므로(계약별
      // 지정 불가 — 실측) 여기가 강제를 심는 유일한 자리다. 안 심으면 이 템플릿으로
      // 만든 모든 계약이 이메일 링크 인증으로 나간다. 호출자가 고르는 값이 아니다
      // (기본강제는 제품 결정이지 호출 옵션이 아니다).
      // 문서 요청 스펙에 없는 필드지만 실제로 반영된다(SNOWSIGN_SANDBOX S5).
      signers: input.signers.map((role) => ({ role, security_method: 'easy_cert' })),
      signature_fields: input.signatureFields.map((f) => ({
        role: f.role,
        type: f.type,
        page_number: f.pageNumber,
        position_x: f.positionX,
        position_y: f.positionY,
        width: f.width,
        height: f.height,
        position_unit: 'pixel',
      })),
      // 비멱등 — 재시도가 provider 에 중복 템플릿을 남긴다(삭제 API 없음).
    }, { retryStatuses: MUTATING_RETRY_STATUS });
    return { templateId: reqString(d?.template_id, 'template_id') };
  }

  async createContractFromTemplate(
    templateId: string,
    input: {
      title: string;
      /**
       * `phone` 은 템플릿 역할이 `easy_cert`(우리가 만드는 모든 템플릿)일 때
       * **필수**다 — 빠지면 공급자가 `VALIDATION_ERROR` 400 을 낸다(실측).
       * 호출자가 `resolveSecurityMethod` 로 010 검증까지 마친 값을 넣는다.
       */
      participants: { role: string; name: string; email: string; phone: string }[],
    },
  ): Promise<SnowSignTemplateContractRef> {
    const d = await this.request<{ contract_id?: string; status?: string } | undefined>(
      'POST',
      `/v1/templates/${encodeURIComponent(templateId)}/create-contract`,
      {
        title: input.title,
        // security 는 싣지 않는다 — 문서상 password 전용이고("이메일/간편인증
        // 역할에는 전달하지 않습니다") 인증수단은 이미 템플릿 역할 정책에 있다.
        participants: input.participants.map((p) => ({
          role: p.role,
          name: p.name,
          email: p.email,
          phone: p.phone,
        })),
      },
      { retryStatuses: MUTATING_RETRY_STATUS },
    );
    return {
      contractId: reqString(d?.contract_id, 'contract_id'),
      status: reqString(d?.status, 'status'),
    };
  }

  async createContract(input: SnowSignCreateContractInput): Promise<SnowSignTemplateContractRef> {
    const d = await this.request<{ contract_id?: string; status?: string } | undefined>(
      'POST',
      '/v1/contracts',
      {
        title: input.title,
        document_upload_id: input.documentUploadId,
        ...(input.deadlineDays !== undefined ? { deadline_days: input.deadlineDays } : {}),
        // phone·security 는 **키 자체를 생략**한다. undefined 로 남기면 JSON 에서는
        // 사라지지만, 여기서 명시적으로 거르는 것이 계약이다 — 간편인증이 아닌
        // 참여자에게 security 가 실리면 공급자가 거부한다.
        participants: input.participants.map((p) => ({
          role: p.role,
          name: p.name,
          email: p.email,
          ...(p.phone !== undefined ? { phone: p.phone } : {}),
          ...(p.security !== undefined ? { security: p.security } : {}),
        })),
        // 서명칸의 참여자 키는 `participant` — 템플릿 경로(`role`)와 다르다.
        // role 로 보내면 칸이 아무 참여자에게도 묶이지 않는다.
        signature_fields: input.signatureFields.map((f) => ({
          participant: f.role,
          type: f.type,
          page_number: f.pageNumber,
          position_x: f.positionX,
          position_y: f.positionY,
          width: f.width,
          height: f.height,
          position_unit: 'pixel',
        })),
        ...(input.externalId !== undefined
          ? { integration: { external_system: EXTERNAL_SYSTEM, external_id: input.externalId } }
          : {}),
        // 비멱등 — 5xx 재시도는 MUTATING_RETRY_STATUS 가 막는다(429 만 재시도).
        // send_immediately 를 쓰지 않는 이유는 SnowSignClient 인터페이스 주석 참조.
      },
      { retryStatuses: MUTATING_RETRY_STATUS },
    );
    return {
      contractId: reqString(d?.contract_id, 'contract_id'),
      status: reqString(d?.status, 'status'),
    };
  }

  async sendContract(contractId: string, message?: string): Promise<SnowSignSendResult> {
    const d = await this.request<
      { contract_id?: string; status?: string; sent_at?: string } | undefined
    >('POST', `/v1/contracts/${encodeURIComponent(contractId)}/send`, message ? { message } : {}, {
      retryStatuses: MUTATING_RETRY_STATUS,
    });
    return {
      contractId: reqString(d?.contract_id, 'contract_id'),
      status: reqString(d?.status, 'status'),
      sentAt: asIsoDate(d?.sent_at),
    };
  }

  async getTemplate(templateId: string): Promise<SnowSignTemplateDetail> {
    const d = await this.request<
      | {
          template_id?: string;
          name?: string;
          variables?: unknown;
          signature_fields?: Array<{
            role_name?: unknown;
            type?: unknown;
            page_number?: unknown;
            position_x?: unknown;
            position_y?: unknown;
            width?: unknown;
            height?: unknown;
          }>;
        }
      | undefined
      // 대화형 클릭 경로(수정 진입) — 재시도 예산 1. 기본 3 이면 5xx 한 번에
      // GET 1개가 provider 호출 4개로 증폭돼 조직 공유 100 req/분을 실패
      // 재시도가 소진한다(다음 클릭이 만회하는 경로다).
    >('GET', `/v1/templates/${encodeURIComponent(templateId)}`, undefined, { maxRetries: 1 });
    // signature_fields 는 수정 플로의 존재 이유다 — 배열이 아니면(envelope drift)
    // 빈 에디터를 여는 대신 typed 오류로 끊는다(빈 채 저장하면 필드가 전부 소실).
    if (!Array.isArray(d?.signature_fields)) {
      throw new SnowSignError('SNOWSIGN_MALFORMED', undefined, 'invalid signature_fields');
    }
    return {
      templateId: reqString(d?.template_id, 'template_id'),
      name: typeof d?.name === 'string' ? d.name : undefined,
      hasVariables: Array.isArray(d?.variables) && d.variables.length > 0,
      signatureFields: d.signature_fields.map((f) => ({
        roleName: reqString(f?.role_name, 'role_name'),
        type: reqString(f?.type, 'type'),
        pageNumber: reqFiniteNumber(f?.page_number, 'page_number'),
        positionX: reqFiniteNumber(f?.position_x, 'position_x'),
        positionY: reqFiniteNumber(f?.position_y, 'position_y'),
        width: reqFiniteNumber(f?.width, 'width'),
        height: reqFiniteNumber(f?.height, 'height'),
      })),
    };
  }

  async templateDownloadUrl(templateId: string): Promise<SnowSignDownload> {
    const d = await this.request<DownloadRow | undefined>(
      'GET',
      `/v1/templates/${encodeURIComponent(templateId)}/download`,
      undefined,
      // getTemplate 과 같은 대화형 재시도 예산(1) — 증폭 방지.
      { maxRetries: 1 },
    );
    return {
      downloadUrl: reqAbsoluteUrl(d?.download_url, 'download_url'),
      filename: d?.filename,
      expiresAt: d?.expires_at,
    };
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
