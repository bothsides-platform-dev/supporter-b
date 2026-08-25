import { formatPhoneInput } from '@/lib/utils/phone';

/**
 * 간편인증이 받는 번호는 **010 으로 시작하는 11자리**뿐이다 — 실측(2026-08-07)에서
 * 구 번호대를 보내면 `VALIDATION_ERROR`("간편인증 휴대폰 번호는 010으로 시작하는
 * 국내 휴대폰 번호여야 합니다")로 계약 생성이 400 이다.
 *
 * 가입 UI 의 `isCompletePhone` 은 `01[0-9]` 를 허용한다(구 번호로 가입한 계정이
 * 이미 있을 수 있어 그쪽은 넓게 둔다). 여기서만 좁힌다 — 넓은 판정을 그대로
 * 쓰면 차단이 아니라 발송 400 이 되어 딜이 원인 없이 멈춘다.
 */
const EASY_CERT_PHONE = /^010\d{8}$/;

/**
 * 공급자가 **계약 참여자** 상세(`GET /v1/contracts/{id}`)에서 회신하는 "본인인증이
 * 걸렸다"의 값. 템플릿 서명자(`GET /v1/templates/{id}` 의 `signers[].security_method`)가
 * 쓰는 `easy_cert` 와 **어휘가 다르다** — 실측 근거는 `docs/SNOWSIGN_SANDBOX.md` S4.
 *
 * 둘을 혼동하면 판정이 통째로 뒤집힌다(계약 참여자를 `easy_cert` 로 비교하면 강제된
 * 초안도 미강제로 읽힌다). 그래서 리터럴을 여기 한 곳에 두고 역참조한다.
 */
export const PROVIDER_ENFORCED_SECURITY_METHOD = 'identity_verification';

// ⚠️ **발송 경로 둘 다 차단이다** — 템플릿 지름길(`sendFromTemplate`)과 조항형 자체
// 발송(`sendComposedContract`)이 같은 정책을 쓴다. 한때 자체 발송 경로만 참여자별
// **강등**(번호 없는 쪽만 이메일 인증)으로 갈 계획이었으나 **2026-08-17 결정으로
// 뒤집혔다**(2026-08-08 의 강등 결정 폐기). 뒤집은 이유 셋:
//   ① 강등 팔에는 저장할 method 값이 없어 서비스가 `signing_participants` 행에 값을
//      **지어내야** 한다 — v0.4.46.0·v0.4.50.0 을 깨뜨린 fail-open 이 그 모양이었다.
//   ② 한 딜룸에 보안 수준이 다른 발송 버튼 둘이 생기면 게이트가 **선택지**가 된다
//      (막힌 PG 가 서식 종류만 바꿔 이메일 링크 계약을 보낼 수 있다).
//   ③ "차단은 데드엔드"라는 원래 근거가 약해졌다 — 현행 문구가 이미 임베드 경로를
//      탈출구로 안내하고, 설정 > 프로필에 번호를 넣을 화면도 생겼다.
// seam(`createContract`)의 참여자별 강등 **능력** 자체는 그대로 둔다 — 올바른 seam
// 의미이고, 이제 호출자가 쓰지 않을 뿐이다. 이 파일이 "단일 출처"를 자칭하므로
// 정책을 여기 적어 둔다 — 정책을 쫓는 사람이 먼저 도착한다.
//
// 임베드 경로는 여전히 이메일 인증이다(`POST /v1/embed-sessions` 에 보안정책
// 파라미터가 없다) — 강제의 실제 범위가 거기서 갈린다.

/**
 * 서명자 본인인증 판정의 단일 출처.
 *
 * 제품 결정은 **기본강제**다 — 양측 참여자 모두 휴대폰 간편인증으로 서명한다.
 * 못 하는 경우는 이메일로 **강등하지 않고 발송을 차단**한다. 그렇게 정한 것은
 * 취향이 아니라 공급자 제약이다: 인증수단이 **템플릿 역할 단위**로 저장되어
 * 계약별로 달리 줄 수 없고, 역할이 `easy_cert` 인데 phone 이 없으면 공급자가
 * fail-closed 400 을 낸다(실측). 즉 강등하려면 발송 경로 자체를 바꿔야 한다.
 *
 * 차단 이유를 갈라 두는 것은 화면 문구가 갈리기 때문이다 — "휴대폰 인증을
 * 완료해주세요"와 "간편인증은 010 번호만 지원해요"는 사용자가 할 일이 다르다.
 */
export type SigningSecurityDecision =
  | {
      enforced: true;
      method: 'easy_cert';
      /** 공급자 전송용 하이픈 포맷. `users.phone` 은 숫자만으로 저장된다. */
      phone: string;
      providerSecurity: { method: typeof PROVIDER_ENFORCED_SECURITY_METHOD };
    }
  | { enforced: false; reason: 'PHONE_MISSING' | 'PHONE_NOT_MOBILE_010' };

/** 참여자의 휴대폰 번호로 본인인증 가능 여부를 판정한다. */
export function resolveSecurityMethod(
  phone: string | null | undefined,
): SigningSecurityDecision {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits === '') return { enforced: false, reason: 'PHONE_MISSING' };
  if (!EASY_CERT_PHONE.test(digits)) return { enforced: false, reason: 'PHONE_NOT_MOBILE_010' };
  return {
    enforced: true,
    method: 'easy_cert',
    phone: formatPhoneInput(digits),
    providerSecurity: { method: PROVIDER_ENFORCED_SECURITY_METHOD },
  };
}
