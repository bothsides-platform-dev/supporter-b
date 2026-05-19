import { describe, expect, it } from 'vitest';
import {
  getPasswordRuleChecks,
  isPasswordValid,
  passwordSchema,
  validatePasswordConfirm,
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

describe('validatePasswordConfirm', () => {
  it('returns null when password and confirm match', () => {
    expect(validatePasswordConfirm('Aa1!aaaaaa', 'Aa1!aaaaaa')).toBeNull();
  });

  it('returns mismatch message when they differ', () => {
    expect(validatePasswordConfirm('Aa1!aaaaaa', 'different')).toBe(
      '비밀번호가 일치하지 않습니다.',
    );
  });

  it('treats empty confirm as mismatch', () => {
    expect(validatePasswordConfirm('Aa1!aaaaaa', '')).toBe(
      '비밀번호가 일치하지 않습니다.',
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
