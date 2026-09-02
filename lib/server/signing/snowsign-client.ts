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

import { defineSingleton } from '@/lib/server/_singleton';
import type { SnowSignSignatureFieldInput } from '@/lib/signing/template-fields';
// 인증수단 리터럴 단일 출처 — 계약 참여자는 `identity_verification`, 템플릿 서명자는
// `easy_cert`. 여기서 리터럴을 복제하면 두 어휘가 갈릴 때 판정이 조용히 뒤집힌다.
import { PROVIDER_ENFORCED_SECURITY_METHOD } from '@/lib/signing/security-method';

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

/**
 * 서명칸 좌표 단위 — 공급자가 `pixel` 만 지원하고 우리 에디터의
 * `getViewport({ scale: 1 })` 좌표계와 짝을 이룬다. 템플릿·계약 두 매퍼가 같은 값을
 * 써야 하므로 리터럴을 복제하지 않는다(한쪽만 바뀌면 좌표가 조용히 어긋난다).
 */
const POSITION_UNIT = 'pixel';

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
/**
 * 오프셋이 **없는** 날짜-시각. 날짜부의 `-` 와 헷갈리지 않도록 시각부까지 통째로
 * 앵커한다(`^…$`) — 끝에 `Z`/`±HH:MM` 가 붙으면 이 패턴에 걸리지 않는다.
 * 초와 소수 이하는 선택이고, 구분자는 `T` 와 공백을 모두 받는다.
 */
const NAIVE_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/;

/**
 * 공급자 타임스탬프를 **순간(instant)** 으로 확정한다.
 *
 * 스노우싸인은 `sent_at`/`created_at` 을 오프셋 없이 돌려준다(실측:
 * `"2026-08-24T16:50:15.987890"`). 그 값은 UTC 벽시계인데, 그대로 흘리면
 * `new Date(s)` 가 ECMAScript 규칙대로 **로컬 시각**으로 읽어 프로세스 TZ 만큼
 * 어긋난 순간이 DB 에 박힌다 — KST 에서 9시간 과거, 음수 오프셋 지역에서는 미래다.
 * 그 오염은 조용하다: 크래시가 아니라 "보낸 지 N일째"가 틀리고, 30일 방치 알림이
 * 일찍 울고, 서명 타임라인이 선정보다 앞선 시각을 찍는다.
 *
 * 운영이 UTC 라 지금까지 드러나지 않았을 뿐 `TZ` 는 어디에도 고정돼 있지 않다 —
 * 호스트 설정에 정확성을 의존하지 않도록 **경계에서** 확정한다.
 *
 * 오프셋이 이미 있으면 손대지 않는다(그건 이미 순간이다).
 */
function asIsoDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const naive = NAIVE_DATETIME_RE.exec(v);
  const normalized = naive ? `${naive[1]}T${naive[2]}Z` : v;
  return Number.isFinite(new Date(normalized).getTime()) ? normalized : undefined;
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
  /**
   * 역할별 서명 보안 정책. **발송 전 정책 검증의 유일한 근거**다 — 이 값 없이
   * 발송하면 기존(email 정책) 템플릿으로 계약을 보내면서 참여자 행에는
   * `easy_cert` 를 적는 거짓말이 되고, 강제가 안 걸린 계약이 나간 뒤에야
   * reconcile 이 바로잡는다(그때는 이미 늦다).
   *
   * 쓰기는 `security_method`, 읽기도 `security_method` 지만 역할명은 쓰기 `role` ↔
   * 읽기 `role_name` 으로 비대칭이다(기존 좌표 파싱과 같은 함정). 값이 없으면
   * `email` 과 동일하게 처리된다(문서) — 그래서 `undefined` 를 그대로 보존해
   * 호출자가 fail-closed 판정하게 둔다.
   */
  signers: { roleName: string; securityMethod?: string }[];
  /**
   * `role_name` 이 없어 스킵된 signer 수 — 진단 전용. 스킵은 fail-closed 지만
   * **조용하면** 공급자가 읽기 키를 바꿨을 때 모든 발송이 TEMPLATE_AUTH_NOT_ENFORCED
   * 로 죽으면서 처방된 복구(재저장)로는 영원히 안 풀리는데, 로그에는 살아남은
   * signer 만 남아 "정말 미강제 템플릿"과 구별할 수 없게 된다. 옵셔널인 이유:
   * 테스트 fake 가 채우지 않아도 되게(진단값이라 부재 무해).
   */
  signersSkipped?: number;
};

// status 는 관대하게 읽는다(부재 = 키 부재) — 하드 파싱이면 create 성공 후 던져
// contract_id 를 함께 버리고, 공급자에는 계약이 있는데 취소 핸들이 없는 고아가 된다.
export type SnowSignTemplateContractRef = { contractId: string; status?: string };

/**
 * 자체 발송 경로(compose)의 참여자 1명. 임베드와 달리 **서버가 DB 에서 만든다** —
 * 브라우저는 참여자를 보내지 않으므로 수신자 오타·위조 표면이 없다.
 *
 * `auth` 는 **참여자마다 독립적으로** 있거나 없다. 010 번호가 있으면 본인인증, 없으면
 * `auth` 를 생략해 공급자 기본(이메일 링크)으로 나간다 — 강등이지 차단이 아니다
 * (PG 는 구매사 담당자 프로필을 고칠 수 없어 차단이 스스로 풀 수 없는 데드엔드가 된다).
 * 공급자가 이 혼합 목록을 받는 것과, 생략된 쪽을 `security_method:null` 로 회신하는 것은
 * 실측 확정이다(`docs/SNOWSIGN_SANDBOX.md` C6a·C6b).
 *
 * **`auth` 가 한 단위인 것이 이 타입의 요점이다.** 번호와 정책을 독립 옵셔널로 두면
 * 번호만 실린 참여자(= 실제로는 공급자 기본 이메일 인증)를 호출자가 본인인증이라 믿는
 * 상태가 표현 가능해진다 — v0.4.46.0/v0.4.50.0 을 깬 fail-open 이 정확히 그 부류였다.
 * `auth` 하나로 받으면 두 반쪽 다 컴파일되지 않는다. 이 모양은 `resolveSecurityMethod` 의
 * 반환 유니온(`enforced:true` 팔이 phone 을 들고 있다)과 그대로 맞물린다.
 *
 * **인증수단 리터럴은 여기 없다 — seam 이 심는다.** `createTemplate` 과 같은 규율이다:
 * 인증 정책은 제품 결정이지 호출 옵션이 아니다. 입력에 method 채널을 두면 `any`/JS 호출자가
 * 템플릿 어휘(`easy_cert`)를 실을 수 있고, 공급자가 모르는 값을 조용히 무시하면 계약은
 * 이메일로 서명 가능한데 우리 행만 강제를 주장한다.
 *
 * ⚠️ 어휘 주의: 계약 **참여자**는 `identity_verification`, 템플릿 **서명자**는
 * `easy_cert` 다(S4). 리터럴 단일 출처는 `lib/signing/security-method.ts` 의
 * `PROVIDER_ENFORCED_SECURITY_METHOD`.
 */
export type SnowSignContractParticipantInput = {
  role: string;
  name: string;
  email: string;
  /** 있으면 이 참여자는 본인인증. 강등은 이 키를 **생략**해서 표현한다(빈 번호 금지). */
  auth?: { phone: string };
};

/**
 * `createContract` 전용 반환 타입 — `status` 가 **옵셔널**인 것이 형제 타입과 다른 점이다.
 * 이 경로는 status 를 관대하게 읽으므로(아래 메서드 주석) "공급자가 안 줬다"가 정상이고,
 * `string` 으로 두면 `if (ref.status !== 'draft')` 같은 하류 코드가 `''` 에서 조용히
 * 멈춘다. 안 준 것을 타입으로 드러내 호출자가 다루게 강제한다.
 */
export type SnowSignContractRef = { contractId: string; status?: string };

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
   * 자체 발송 경로 — 올린 PDF + 우리 에디터가 배치한 서명칸 + 서버가 만든 참여자로
   * 계약을 **직접** 만든다. 임베드(`createEmbedSession`)와 달리 참여자 프리필이
   * 구조적으로 성립하는 유일한 경로다.
   *
   * **초안만 만든다.** `send_immediately` 는 쓰지 않는다 — 201 을 받는 순간 메일이
   * 나가면 `providerRef` 를 적기 전에 죽었을 때 취소 핸들 없는 고아가 된다.
   * create → ref 영속 → `sendContract` 로 갈라야 다음 재시도가 상태를 치유한다.
   */
  createContract(input: {
    title: string;
    documentUploadId: string;
    participants: SnowSignContractParticipantInput[];
    signatureFields: SnowSignSignatureFieldInput[];
    /**
     * 공급자가 회신하지 않는다 — 소유 검증이 아니라 지원 문의 상관키다.
     * 근거: `docs/SNOWSIGN_SANDBOX.md` **S4**("응답에 integration·external_id 키가 없다"),
     * 임베드 경로는 같은 문서 **Q3**.
     */
    externalId: string;
  }, opts?: SnowSignCallOpts): Promise<SnowSignContractRef>;
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
        position_unit: POSITION_UNIT,
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
      // `status` 는 관대하게 — 던지는 시점이 create 성공 **이후**라 예외가
      // `contract_id` 를 함께 버린다(취소 핸들 없는 공급자 측 고아). 호출자는
      // contractId 만 쓰고 상태 판정은 getContract 재조회가 한다. 값을 지어내지
      // 않는다(`|| 'draft'` 금지) — 안 준 것은 안 준 것으로. createContract 와 동일.
      ...(typeof d?.status === 'string' && d.status !== '' ? { status: d.status } : {}),
    };
  }


  async createContract(input: {
    title: string;
    documentUploadId: string;
    participants: SnowSignContractParticipantInput[];
    signatureFields: SnowSignSignatureFieldInput[];
    externalId: string;
  }, opts?: SnowSignCallOpts): Promise<SnowSignContractRef> {
    // ── 요청 전 불변식 ────────────────────────────────────────────────────────
    // 전부 **공급자 호출 앞**이라 던져도 고아가 생기지 않는다("create 성공 후 던지지
    // 않는다"는 이 모듈의 규율은 응답 파싱에만 적용된다). 여기서 막지 않으면 실패가
    // 공급자 400 이나 — 더 나쁘게 — 조용히 잘못된 계약으로 나타난다.
    const bad = (msg: string) => new SnowSignError('SNOWSIGN_VALIDATION', undefined, msg);
    if (input.participants.length === 0) throw bad('participants is empty');
    // 서명칸 0개 = 아무도 서명할 수 없는 계약. 후속 send 는 그래도 메일을 보낸다.
    if (input.signatureFields.length === 0) throw bad('signatureFields is empty');
    for (const p of input.participants) {
      // `auth` 를 들고 있는데 번호가 공백이면 **조용히 강등하지 않는다.** 떨어뜨리면
      // 호출자는 본인인증을 믿는데 계약은 이메일로 서명 가능해진다(v0.4.50.0 부류).
      // 강등의 표현은 `auth` 생략이고, 빈 번호는 강등 의사가 아니라 상류 버그다.
      if (p.auth && p.auth.phone.trim() === '') {
        throw bad(`participant ${p.role} has auth with a blank phone`);
      }
    }
    // 서명칸의 참여자 키는 참여자 목록에 실재해야 한다 — 어긋나면 그 칸은 아무에게도
    // 묶이지 않고, 계약 상세 응답에 `signature_fields` 가 없어(C1) 우리 스택의 어떤
    // 것도 그것을 탐지하지 못한다. 결과는 한쪽 서명칸이 없는 채 발송된 계약이다.
    const roles = new Set(input.participants.map((p) => p.role));
    for (const f of input.signatureFields) {
      if (!roles.has(f.role)) throw bad(`signature field role not in participants: ${f.role}`);
    }

    const d = await this.request<{ contract_id?: string; status?: string } | undefined>(
      'POST',
      '/v1/contracts',
      {
        title: input.title,
        document_upload_id: input.documentUploadId,
        // 기본값도 parallel 이지만 명시한다 — "구매사가 먼저 서명해야 하는가"는 보안
        // 성질이라 공급자 기본값이 바뀌면 우리 정책이 조용히 따라 흔들린다.
        // 기본값 근거: `docs/SNOWSIGN_SANDBOX.md` S 계열 "우리가 안 보낸 값의 기본값".
        // 전송 근거: `docs/SNOWSIGN_API.md` 는 이 엔드포인트의 request-body **표**에는
        // 이 키를 빼고 **예시**에만 넣어 뒀다(템플릿 경로는 enum 을 문서화한다) — 그래서
        // 미문서 필드로 오독하지 말 것. 실제 전송 수락 여부는 SANDBOX C7 에서 실측했다.
        signing_order: 'parallel',
        // deadline_days 는 싣지 않는다 — 201 로 수락되지만 조용히 무시된다(S6 실측).
        // 보내면 "마감을 설정했다"는 거짓 근거가 코드에 남는다. 이 경로엔 마감 수단이 없다.
        // send_immediately 도 싣지 않는다 — 2단계 발송(위 인터페이스 주석) 계약이다.
        participants: input.participants.map((p) => ({
          role: p.role,
          name: p.name,
          email: p.email,
          // 참여자별 강등: `auth` 가 없으면 두 키 모두 빠져 공급자 기본(이메일 링크)으로
          // 나간다. **spread 가 하나이고 정책 리터럴을 여기서 심는 것이 계약이다** —
          // 갈리면 번호만 실린 참여자(실제는 이메일 인증)가 생기고, 호출자가 리터럴을
          // 고를 수 있으면 템플릿 어휘(`easy_cert`)가 새어 든다. 둘 다 v0.4.50.0 부류다.
          // 빈 번호는 위 불변식이 이미 던졌으므로 여기 도달하지 않는다.
          ...(p.auth
            ? {
                phone: p.auth.phone,
                security: { method: PROVIDER_ENFORCED_SECURITY_METHOD },
              }
            : {}),
        })),
        signature_fields: input.signatureFields.map((f) => ({
          // 계약 경로는 `participant`, 템플릿 경로는 `role` — 문서화된 비대칭이고
          // 실측으로 확인했다(C1: 미리보기가 칸마다 소유자를 라벨링한다). `role` 을 쓰면
          // 칸이 어느 참여자에게도 묶이지 않는다.
          participant: f.role,
          type: f.type,
          page_number: f.pageNumber,
          position_x: f.positionX,
          position_y: f.positionY,
          width: f.width,
          height: f.height,
          position_unit: POSITION_UNIT,
        })),
        integration: { external_system: EXTERNAL_SYSTEM, external_id: input.externalId },
      },
      // 비멱등 — 5xx 재시도는 공급자에 중복 계약을 만든다(삭제 API 없음, 취소만).
      // `opts` 를 받는 이유: 이건 사람이 화면에서 기다리는 발송 경로다. signal 이 없으면
      // `requestEnvelope` 가 **긴** Retry-After 캡(10초)을 고르고 총 대기가 90초까지 갈 수
      // 있어 5분 발송 리스와 60초 하트비트 안에서 위험하다. 호출자가 데드라인을 걸 수
      // 있어야 한다(형제 create 경로에는 이 구멍이 남아 있다 — 선존재).
      { ...opts, retryStatuses: MUTATING_RETRY_STATUS },
    );
    return {
      contractId: reqString(d?.contract_id, 'contract_id'),
      // `status` 는 **관대하게** 읽는다 — 형제 create 경로들이 쓰는 `reqString` 과 의도적으로
      // 다르다. 이유 셋: ① 문서에 초안 응답 스키마가 없다(201 예시는 `send_immediately:true`
      // 형태로 `sent_at` 을 들고 있다) — status 부재는 스펙 위반이 아니다 ② 이 경로에서
      // status 는 제어흐름이 아니다(호출자는 `contractId` 만 쓰고 실제 상태 판정은
      // `getContract` 재조회가 한다) ③ 결정적으로, **던지는 시점이 create 성공 이후**라
      // 예외가 `contract_id` 를 함께 버린다 — 공급자에는 계약이 있는데 우리는 취소 핸들이
      // 없는 고아가 되고, 그건 이 메서드를 2단계로 가른 이유 그 자체다. 모듈 정책(위 검증
      // 헬퍼 주석)도 "제어흐름 필수 필드만 검증, 비필수는 관대하게 coerce" 다.
      // 값을 지어내지 않는다(`|| 'draft'` 금지) — 안 준 것은 **안 준 것으로** 남긴다.
      // 반환 타입이 `status?: string` 인 것이 그 표현이다(빈 문자열로 뭉개면 하류의
      // `if (status !== 'draft')` 가 조용히 멈춘다).
      // 형제 `createContractFromTemplate` 도 같은 관대 파싱으로 정렬했다.
      ...(typeof d?.status === 'string' && d.status !== '' ? { status: d.status } : {}),
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
          signers?: Array<{ role_name?: unknown; security_method?: unknown }>;
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
    const rawSigners = Array.isArray(d?.signers) ? d.signers : [];
    const signers = rawSigners.flatMap((s) =>
      typeof s?.role_name === 'string' && s.role_name !== ''
        ? [
            {
              roleName: s.role_name,
              securityMethod:
                typeof s?.security_method === 'string' ? s.security_method : undefined,
            },
          ]
        : [],
    );
    return {
      templateId: reqString(d?.template_id, 'template_id'),
      name: typeof d?.name === 'string' ? d.name : undefined,
      hasVariables: Array.isArray(d?.variables) && d.variables.length > 0,
      // signers 자체가 없으면 빈 배열 — 호출자의 "모든 역할이 easy_cert 인가"
      // 검사가 자동으로 실패해 fail-closed 가 된다(관대 기본값 금지).
      //
      // role_name 없는 signer 는 **스킵**한다(하드 파싱 금지) — 읽기측 role_name 존재는
      // 실측 미확정이고(쓰기 role ↔ 읽기 role_name 비대칭의 사정권), 던지면 템플릿
      // 수정·발송이 통째로 죽는다. 스킵은 역할 집합을 줄이는 방향뿐이라 위 검사가
      // 자동으로 미강제로 읽는다. signature_fields 의 role_name 은 에디터 매핑의
      // 존재 이유라 하드 파싱을 유지한다(아래). 스킵 수는 진단용으로 노출한다 —
      // 조용하면 공급자 키 드리프트가 "미강제 템플릿"으로 위장한다.
      signers,
      signersSkipped: rawSigners.length - signers.length,
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
export const { get: getSnowSignClient, set: __setSnowSignClientForTest } =
  defineSingleton<SnowSignClient>('snowsign_client', 'infra', () => new RealSnowSignClient());
