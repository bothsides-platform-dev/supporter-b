import type { SigningContractStatus } from '@/lib/types/signing';

/** A reminder can only be claimed while signatures are still pending. */
export const REMINDABLE_STATUSES: SigningContractStatus[] = ['sent', 'in_progress'];

/**
 * 리마인더 쿨다운 창 — 서비스의 CAS 판정(`claimRemind`)과 사용자 문구
 * (`error-messages.ts`)가 같은 값을 소비한다. 하나만 바꾸면 문구가 거짓말한다.
 */
export const REMIND_COOLDOWN_HOURS = 24;
export const REMIND_COOLDOWN_MS = REMIND_COOLDOWN_HOURS * 60 * 60 * 1000;

/**
 * 공급자 429 뒤의 짧은 쿨다운 — 안 나간 것은 확실하지만 클레임을 풀면 한도가 포화된
 * 순간 쿨다운이 꺼져 재시도가 부하를 키운다. 24시간을 잠그기엔 0통 나간 리마인더라
 * 이 만큼만 기다리게 한다.
 */
export const REMIND_RATE_LIMIT_BACKOFF_MS = 10 * 60 * 1000;
