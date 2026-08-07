import type { SigningSecurityMethod } from '@/lib/types/signing';
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
      providerSecurity: { method: 'identity_verification' };
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
    providerSecurity: { method: 'identity_verification' },
  };
}

/**
 * 의도한 인증수단과 공급자가 실제로 적용한 값을 대조한다.
 *
 * 대표 사례는 **기존 템플릿**이다 — `security_method` 는 템플릿 생성 시점에만
 * 붙으므로, 이 기능 이전에 만들어진 템플릿으로 발송하면 우리는 간편인증을
 * 의도했는데 참여자가 `email` 로 돌아온다. 조용히 지나가면 강제가 켜져 있다고
 * 믿는 채 이메일 링크로 서명된다. reconcile 이 공급자 값을 미러링하기
 * 전(`undefined`)에는 강등으로 단정하지 않는다.
 */
export function isSilentDowngrade(
  intended: SigningSecurityMethod,
  actual: SigningSecurityMethod | undefined,
): boolean {
  return intended === 'easy_cert' && actual === 'email';
}
