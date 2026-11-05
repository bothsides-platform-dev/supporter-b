import { describe, expect, it } from 'vitest';
import {
  getPasswordConfirmError,
  getPasswordError,
  getPasswordRuleChecks,
  isPasswordValid,
  passwordSchema,
} from '../password-validation';

describe('getPasswordRuleChecks', () => {
  it('flags every rule when value is empty', () => {
    const checks = getPasswordRuleChecks('');
    expect(checks.map((c) => c.id)).toEqual([
      'length',
      'letter',
      'digit',
      'special',
    ]);
    expect(checks.every((c) => !c.satisfied)).toBe(true);
  });

  it('rejects 9 chars and accepts 10 chars (length boundary)', () => {
    expect(byId(getPasswordRuleChecks('Aa1!aaaaa'), 'length').satisfied).toBe(
      false,
    );
    expect(byId(getPasswordRuleChecks('Aa1!aaaaaa'), 'length').satisfied).toBe(
      true,
    );
  });

  it('flips only the missing rule, not the others', () => {
    const noLetter = getPasswordRuleChecks('1234567890!');
    expect(byId(noLetter, 'letter').satisfied).toBe(false);
    expect(byId(noLetter, 'digit').satisfied).toBe(true);
    expect(byId(noLetter, 'special').satisfied).toBe(true);
    expect(byId(noLetter, 'length').satisfied).toBe(true);

    const noDigit = getPasswordRuleChecks('aaaaaaaaaa!');
    expect(byId(noDigit, 'digit').satisfied).toBe(false);
    expect(byId(noDigit, 'letter').satisfied).toBe(true);
    expect(byId(noDigit, 'special').satisfied).toBe(true);

    const noSpecial = getPasswordRuleChecks('aaaaaaaaaa1');
    expect(byId(noSpecial, 'special').satisfied).toBe(false);
    expect(byId(noSpecial, 'letter').satisfied).toBe(true);
    expect(byId(noSpecial, 'digit').satisfied).toBe(true);
  });
});

describe('isPasswordValid', () => {
  it('requires all 4 rules to pass', () => {
    expect(isPasswordValid('Aa1!aaaaaa')).toBe(true);
    expect(isPasswordValid('Aa1!aaaaa')).toBe(false); // 9 chars
    expect(isPasswordValid('1234567890!')).toBe(false); // no letter
    expect(isPasswordValid('aaaaaaaaaa!')).toBe(false); // no digit
    expect(isPasswordValid('aaaaaaaaaa1')).toBe(false); // no special
  });
});

describe('getPasswordError', () => {
  const signup = { outcome: 'continue' as const, confirmFilled: false };

  it('asks for a password when empty', () => {
    expect(getPasswordError('', signup)).toBe('비밀번호를 입력해요.');
  });

  it('returns null once every rule passes', () => {
    expect(getPasswordError('Aa1!aaaaaa', signup)).toBeNull();
  });

  // Chrome 비밀번호 관리자의 기본 제안은 대·소문자·숫자 15자, 특수문자 없음.
  it('names the special character when it is the only rule left (Chrome suggestion shape)', () => {
    expect(getPasswordError('Xk7mQ2vLpR9nT4w', signup)).toBe(
      '특수문자(! @ # 등)를 하나 넣으면 넘어갈 수 있어요.',
    );
  });

  it('adds the confirm-field hint only when the confirm field is filled', () => {
    expect(
      getPasswordError('Xk7mQ2vLpR9nT4w', { outcome: 'continue', confirmFilled: true }),
    ).toBe(
      '특수문자(! @ # 등)를 하나 넣으면 넘어갈 수 있어요. 비밀번호 확인 칸도 똑같이 바꿔요.',
    );
  });

  it('falls back to the generic rule message when more than the special rule is missing', () => {
    // 특수문자 + 길이 미충족
    expect(getPasswordError('Aa1', signup)).toBe(
      '비밀번호 조건을 모두 채우면 넘어갈 수 있어요.',
    );
    // 특수문자는 있고 숫자만 없음 — 특수문자 안내를 띄우면 안 된다
    expect(getPasswordError('aaaaaaaaaa!', signup)).toBe(
      '비밀번호 조건을 모두 채우면 넘어갈 수 있어요.',
    );
  });

  it('uses the reset wording for the change outcome', () => {
    expect(getPasswordError('Aa1', { outcome: 'change', confirmFilled: false })).toBe(
      '비밀번호 조건을 모두 채우면 바꿀 수 있어요.',
    );
    expect(
      getPasswordError('Xk7mQ2vLpR9nT4w', { outcome: 'change', confirmFilled: false }),
    ).toBe('특수문자(! @ # 등)를 하나 넣으면 바꿀 수 있어요.');
  });
});

describe('getPasswordConfirmError', () => {
  it('returns null when password and confirm match', () => {
    expect(getPasswordConfirmError('Aa1!aaaaaa', 'Aa1!aaaaaa')).toBeNull();
  });

  it('asks to type it again when confirm is empty', () => {
    expect(getPasswordConfirmError('Aa1!aaaaaa', '')).toBe('비밀번호를 한 번 더 입력해요.');
  });

  it('returns the mismatch message when they differ', () => {
    expect(getPasswordConfirmError('Aa1!aaaaaa', 'different')).toBe(
      '비밀번호가 서로 달라요. 같은 비밀번호를 입력해요.',
    );
  });
});

describe('passwordSchema (zod)', () => {
  it('parses a valid password successfully', () => {
    const r = passwordSchema.safeParse('Aa1!aaaaaa');
    expect(r.success).toBe(true);
  });

  it('rejects with WEAK_PASSWORD when rules fail but length passes', () => {
    // 10+ chars but missing digit/special — survives min(10) but fails refine.
    const r = passwordSchema.safeParse('aaaaaaaaaaaa');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('WEAK_PASSWORD');
    }
  });

  it('rejects strings shorter than 10', () => {
    const r = passwordSchema.safeParse('Aa1!aaaaa');
    expect(r.success).toBe(false);
  });

  it('rejects strings longer than 200', () => {
    const r = passwordSchema.safeParse('Aa1!' + 'a'.repeat(200));
    expect(r.success).toBe(false);
  });
});

function byId<T extends { id: string }>(arr: T[], id: string): T {
  const found = arr.find((x) => x.id === id);
  if (!found) throw new Error(`rule '${id}' not in checks`);
  return found;
}
