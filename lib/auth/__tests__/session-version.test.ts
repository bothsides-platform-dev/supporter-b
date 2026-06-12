/**
 * isSessionVersionStale — pure decision for server-side JWT revocation.
 *
 * users.sessionVersion bumps on password reset / email change / account
 * deletion; a JWT carrying an older `sv` claim is dead. Legacy tokens issued
 * before the claim existed count as version 1 (the column default) so a
 * deploy does not force-logout every user.
 */
import { describe, it, expect } from 'vitest';
import { isSessionVersionStale } from '../session-version';

describe('isSessionVersionStale', () => {
  it('토큰과 DB 버전이 같으면 유효하다', () => {
    expect(isSessionVersionStale(2, 2)).toBe(false);
  });

  it('DB 버전이 더 크면 stale — 비번 변경 후 남아 있는 옛 토큰', () => {
    expect(isSessionVersionStale(1, 2)).toBe(true);
  });

  it('sv claim 없는 레거시 토큰은 버전 1로 간주 — DB도 1이면 통과', () => {
    expect(isSessionVersionStale(undefined, 1)).toBe(false);
  });

  it('sv claim 없는 레거시 토큰이라도 DB가 2면 stale', () => {
    expect(isSessionVersionStale(undefined, 2)).toBe(true);
  });

  it('DB에 사용자 행이 없으면(null) stale — 세션은 죽어야 한다', () => {
    expect(isSessionVersionStale(1, null)).toBe(true);
  });
});
