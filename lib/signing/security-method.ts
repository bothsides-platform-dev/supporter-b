import type { SigningSecurityMethod } from '@/lib/types/signing';
import { formatPhoneInput } from '@/lib/utils/phone';

/**
 * 간편인증이 받는 번호는 **010 으로 시작하는 11자리**뿐이다 — 실측(2026-08-07)에서
 * 구 번호대를 보내면 `VALIDATION_ERROR`("간편인증 휴대폰 번호는 010으로 시작하는
 * 국내 휴대폰 번호여야 합니다")로 계약 생성이 400 이다.
 *
 * 가입 UI 의 `isCompletePhone` 은 `01[0-9]` 를 허용한다(구 번호로 가입한 계정이
 * 이미 있을 수 있어 그쪽은 넓게 둔다). 여기서만 좁힌다 — 넓은 판정을 그대로
 * 쓰면 강등 대신 발송 실패가 되어 딜이 멈춘다.
 */
const EASY_CERT_PHONE = /^010\d{8}$/;

/**
 * 서명자 본인인증 판정의 단일 출처.
 *
 * 제품 결정은 **기본강제**다 — 양측 참여자 모두 휴대폰 간편인증
 * (`identity_verification`)으로 서명한다. 이메일 인증은 선택지가 아니라
 * **휴대폰 번호를 확보하지 못했을 때의 강등**이며, 그래서 타입이
 * `method: 'email'` 과 `downgraded: true` 를 묶어 둔다.
 *
 * 강등 판정이 여기 한 곳에만 있어야 서버 페이로드·참여자 행·화면 경고·감사
 * 로그가 서로 어긋나지 않는다.
 */
export type SigningSecurityDecision =
  | {
      method: 'easy_cert';
      downgraded: false;
      /** 공급자 전송용 하이픈 포맷. `users.phone` 은 숫자만으로 저장된다. */
      phone: string;
      providerSecurity: { method: 'identity_verification' };
    }
  | { method: 'email'; downgraded: true };

/**
 * 참여자의 휴대폰 번호로 서명 인증수단을 정한다.
 *
 * 휴대폰 형식이 아니면 강등한다(fail-closed) — 쓰레기 번호를 그대로 보내면
 * 공급자가 발송을 거부해 딜이 멈추고, 그것은 강등보다 나쁘다.
 */
export function resolveSecurityMethod(
  phone: string | null | undefined,
): SigningSecurityDecision {
  if (!phone || !EASY_CERT_PHONE.test(phone.replace(/\D/g, ''))) {
    return { method: 'email', downgraded: true };
  }
  return {
    method: 'easy_cert',
    downgraded: false,
    phone: formatPhoneInput(phone),
    providerSecurity: { method: 'identity_verification' },
  };
}

/**
 * 의도한 인증수단과 공급자가 실제로 적용한 값을 대조한다.
 *
 * 정책 강등(`resolveSecurityMethod` 의 `downgraded`)과 달리 이쪽은 **우리가
 * 간편인증을 요청했는데 공급자 쪽에서 이메일로 처리된** 경우다 — 요청이
 * 조용히 무시됐다는 뜻이라 같은 경고로 합류시킨다. reconcile 이 공급자
 * 값을 미러링하기 전(`undefined`)에는 강등으로 단정하지 않는다.
 */
export function isSilentDowngrade(
  intended: SigningSecurityMethod,
  actual: SigningSecurityMethod | undefined,
): boolean {
  return intended === 'easy_cert' && actual === 'email';
}
