import { z } from 'zod';

export type PasswordRuleCheck = {
  id: 'length' | 'letter' | 'digit' | 'special';
  label: string;
  satisfied: boolean;
};

export function getPasswordRuleChecks(value: string): PasswordRuleCheck[] {
  return [
    { id: 'length', label: '10자 이상', satisfied: value.length >= 10 },
    { id: 'letter', label: '영문자 포함', satisfied: /[A-Za-z]/.test(value) },
    { id: 'digit', label: '숫자 포함', satisfied: /\d/.test(value) },
    { id: 'special', label: '특수문자 포함', satisfied: /[^A-Za-z0-9]/.test(value) },
  ];
}

export function isPasswordValid(value: string): boolean {
  return getPasswordRuleChecks(value).every((r) => r.satisfied);
}

export function validatePasswordConfirm(
  password: string,
  confirm: string,
): string | null {
  if (password !== confirm) return '비밀번호가 일치하지 않습니다.';
  return null;
}

// Shared by server actions (signupCompleteAction, passwordResetAction) and
// any future API surface — keep this as the *single source of truth* for the
// 4 password rules. The min/max bounds run first; only valid-length strings
// reach the refinement so the WEAK_PASSWORD message implies length passed.
export const passwordSchema = z
  .string()
  .min(10)
  .max(200)
  .refine(isPasswordValid, { message: 'WEAK_PASSWORD' });
