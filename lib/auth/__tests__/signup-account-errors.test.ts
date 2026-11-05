import { describe, expect, it } from 'vitest';
import {
  getSignupAccountErrors,
  hasSignupAccountErrors,
} from '../signup-account-errors';

const VALID = {
  email: 'kim@example.com',
  password: 'Password123!',
  passwordConfirm: 'Password123!',
  agreements: { terms: true, privacy: true },
};

describe('getSignupAccountErrors', () => {
  it('reports no errors for a complete step', () => {
    const errors = getSignupAccountErrors(VALID);
    expect(errors).toEqual({ email: null, password: null, passwordConfirm: null, agreements: null });
    expect(hasSignupAccountErrors(errors)).toBe(false);
  });

  it('separates an empty email from a malformed one', () => {
    expect(getSignupAccountErrors({ ...VALID, email: '  ' }).email).toBe('이메일을 입력해요.');
    expect(getSignupAccountErrors({ ...VALID, email: 'kim@example' }).email).toBe(
      'your@company.com 형식으로 입력해요.',
    );
  });

  it('blocks when either required consent is missing', () => {
    for (const agreements of [
      { terms: false, privacy: true },
      { terms: true, privacy: false },
    ]) {
      const errors = getSignupAccountErrors({ ...VALID, agreements });
      expect(errors.agreements).toBe('필수 약관에 동의하면 가입할 수 있어요.');
      expect(hasSignupAccountErrors(errors)).toBe(true);
    }
  });

  it('passes the confirm-filled state into the password hint', () => {
    const chrome = 'Xk7mQ2vLpR9nT4w';
    expect(
      getSignupAccountErrors({ ...VALID, password: chrome, passwordConfirm: chrome }).password,
    ).toContain('비밀번호 확인 칸도 똑같이 바꿔요.');
    expect(
      getSignupAccountErrors({ ...VALID, password: chrome, passwordConfirm: '' }).password,
    ).not.toContain('확인 칸');
  });
});
