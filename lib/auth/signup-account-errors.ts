import {
  getPasswordConfirmError,
  getPasswordError,
} from '@/lib/auth/password-validation';

/** 가입 1단계 이메일 형식. 중복 확인 요청을 보내기 전 클라이언트 판정이다. */
export const SIGNUP_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMAIL_EMPTY_ERROR = '이메일을 입력해요.';
export const EMAIL_FORMAT_ERROR = 'your@company.com 형식으로 입력해요.';
export const REQUIRED_CONSENT_ERROR = '필수 약관에 동의하면 가입할 수 있어요.';

export type SignupAccountInput = {
  email: string;
  password: string;
  passwordConfirm: string;
  agreements: { terms: boolean; privacy: boolean };
};

export type SignupAccountErrors = {
  email: string | null;
  password: string | null;
  passwordConfirm: string | null;
  agreements: string | null;
};

/**
 * 가입 1단계(구매사·PG 공통)에서 [다음]을 막는 입력 사유를 필드별로 돌려준다.
 *
 * 서버 응답으로만 알 수 있는 사유(이미 가입된 이메일, 마스터 이메일)는 여기에
 * 없다 — 화면이 그 응답을 따로 들고 있다. 모든 값이 null 이어야 제출할 수 있다.
 */
export function getSignupAccountErrors(input: SignupAccountInput): SignupAccountErrors {
  const email = input.email.trim();
  return {
    email:
      email === ''
        ? EMAIL_EMPTY_ERROR
        : SIGNUP_EMAIL_PATTERN.test(email)
          ? null
          : EMAIL_FORMAT_ERROR,
    password: getPasswordError(input.password, {
      outcome: 'continue',
      confirmFilled: input.passwordConfirm !== '',
    }),
    passwordConfirm: getPasswordConfirmError(input.password, input.passwordConfirm),
    agreements:
      input.agreements.terms && input.agreements.privacy ? null : REQUIRED_CONSENT_ERROR,
  };
}

export function hasSignupAccountErrors(errors: SignupAccountErrors): boolean {
  return Object.values(errors).some((e) => e !== null);
}
