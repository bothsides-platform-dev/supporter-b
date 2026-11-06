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

/**
 * 비밀번호 조건을 못 채웠을 때 무엇을 할 수 있게 되는지. 가입 1단계는 다음
 * 단계로 넘어가고, 재설정은 비밀번호를 바꾼다 — 문구의 끝만 다르다.
 */
export type PasswordOutcome = 'continue' | 'change';

const OUTCOME_PHRASE: Record<PasswordOutcome, string> = {
  continue: '넘어갈 수 있어요',
  change: '바꿀 수 있어요',
};

export const PASSWORD_EMPTY_ERROR = '비밀번호를 입력해요.';
export const PASSWORD_CONFIRM_EMPTY_ERROR = '비밀번호를 한 번 더 입력해요.';
export const PASSWORD_CONFIRM_MISMATCH_ERROR =
  '비밀번호가 서로 달라요. 같은 비밀번호를 입력해요.';

/**
 * 제출을 막는 비밀번호 사유를 한 문장으로 돌려준다. 통과하면 null.
 *
 * 특수문자 하나만 남은 경우를 따로 안내한다. Chrome 비밀번호 관리자가
 * 제안하는 비밀번호는 기본 사양상 대·소문자·숫자 15자이고 특수문자를 넣지
 * 않는다(Chromium `password_generator.cc` BuildDefaultSpec — "no symbols").
 * 사이트가 그 사양을 바꾸거나 생성을 끌 방법은 없어서, 제안을 받아들인
 * 사용자는 정확히 이 상태로 막힌다. Chrome 은 확인 칸까지 같은 값으로 채우므로
 * 확인 칸이 채워져 있을 때만 "확인 칸도 똑같이" 를 덧붙인다 — 비어 있으면 확인
 * 칸 자체 오류가 따로 안내한다.
 */
export function getPasswordError(
  password: string,
  { outcome, confirmFilled }: { outcome: PasswordOutcome; confirmFilled: boolean },
): string | null {
  if (password === '') return PASSWORD_EMPTY_ERROR;
  const unmet = getPasswordRuleChecks(password).filter((r) => !r.satisfied);
  if (unmet.length === 0) return null;
  const phrase = OUTCOME_PHRASE[outcome];
  if (unmet.length === 1 && unmet[0].id === 'special') {
    const base = `특수문자(! @ # 등)를 하나 넣으면 ${phrase}.`;
    return confirmFilled ? `${base} 비밀번호 확인 칸도 똑같이 바꿔요.` : base;
  }
  return `비밀번호 조건을 모두 채우면 ${phrase}.`;
}

/** 확인 칸 사유. 비어 있음과 불일치를 구분한다. 통과하면 null. */
export function getPasswordConfirmError(
  password: string,
  confirm: string,
): string | null {
  if (confirm === '') return PASSWORD_CONFIRM_EMPTY_ERROR;
  if (password !== confirm) return PASSWORD_CONFIRM_MISMATCH_ERROR;
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
