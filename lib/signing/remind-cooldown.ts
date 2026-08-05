/**
 * 리마인더 쿨다운 창 — 서비스의 CAS 판정(`claimRemind`)과 사용자 문구
 * (`error-messages.ts`)가 같은 값을 소비한다. 하나만 바꾸면 문구가 거짓말한다.
 */
export const REMIND_COOLDOWN_HOURS = 24;
export const REMIND_COOLDOWN_MS = REMIND_COOLDOWN_HOURS * 60 * 60 * 1000;
