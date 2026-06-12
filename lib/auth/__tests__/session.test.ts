/**
 * requireSession — the single chokepoint every server action passes through
 * (requireBuyerSession / requirePgSession delegate to it). The revocation
 * check must live here so a bumped users.session_version kills stale JWTs on
 * actions, not just on page loads (the shell guard covers those).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => authMock(),
}));

const getDbSessionVersionMock = vi.fn();
vi.mock('@/lib/auth/session-version-db', () => ({
  getDbSessionVersion: (userId: string) => getDbSessionVersionMock(userId),
}));

import { requireSession, isSessionRevoked } from '../session';

beforeEach(() => {
  authMock.mockReset();
  getDbSessionVersionMock.mockReset();
});

describe('requireSession — sessionVersion revocation', () => {
  it('세션 없음 → UNAUTHENTICATED', async () => {
    authMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow('UNAUTHENTICATED');
  });

  it('토큰 sv가 DB보다 낮으면(비번 변경 후 옛 토큰) → UNAUTHENTICATED', async () => {
    authMock.mockResolvedValue({
      user: { id: 'u-1', email: 'a@b.c', sessionVersion: 1 },
    });
    getDbSessionVersionMock.mockResolvedValue(2);
    await expect(requireSession()).rejects.toThrow('UNAUTHENTICATED');
  });

  it('토큰 sv와 DB가 일치하면 세션을 반환한다', async () => {
    const session = { user: { id: 'u-1', email: 'a@b.c', sessionVersion: 2 } };
    authMock.mockResolvedValue(session);
    getDbSessionVersionMock.mockResolvedValue(2);
    await expect(requireSession()).resolves.toBe(session);
    expect(getDbSessionVersionMock).toHaveBeenCalledWith('u-1');
  });

  it('sv claim 없는 레거시 토큰 + DB 기본값 1 → 통과 (강제 로그아웃 없음)', async () => {
    const session = { user: { id: 'u-1', email: 'a@b.c' } };
    authMock.mockResolvedValue(session);
    getDbSessionVersionMock.mockResolvedValue(1);
    await expect(requireSession()).resolves.toBe(session);
  });

  it('DB에 사용자 행이 없으면(null) → UNAUTHENTICATED', async () => {
    authMock.mockResolvedValue({
      user: { id: 'u-1', email: 'a@b.c', sessionVersion: 1 },
    });
    getDbSessionVersionMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow('UNAUTHENTICATED');
  });
});

describe('isSessionRevoked — API 라우트용 폐기 판정', () => {
  it('세션 없음 → false (미인증은 라우트가 이미 401 처리)', async () => {
    await expect(isSessionRevoked(null)).resolves.toBe(false);
  });

  it('토큰 sv가 DB보다 낮으면 true', async () => {
    getDbSessionVersionMock.mockResolvedValue(2);
    await expect(
      isSessionRevoked({ user: { id: 'u-1', email: 'a@b.c', sessionVersion: 1 } } as never),
    ).resolves.toBe(true);
  });

  it('토큰 sv와 DB가 일치하면 false', async () => {
    getDbSessionVersionMock.mockResolvedValue(2);
    await expect(
      isSessionRevoked({ user: { id: 'u-1', email: 'a@b.c', sessionVersion: 2 } } as never),
    ).resolves.toBe(false);
  });

  it('레거시 토큰(sv 부재) + DB 기본값 1 → false', async () => {
    getDbSessionVersionMock.mockResolvedValue(1);
    await expect(
      isSessionRevoked({ user: { id: 'u-1', email: 'a@b.c' } } as never),
    ).resolves.toBe(false);
  });
});
