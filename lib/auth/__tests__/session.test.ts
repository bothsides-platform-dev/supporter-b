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
const getDbEmailVerifiedMock = vi.fn();
const getDbMemberApprovalStatusMock = vi.fn();
vi.mock('@/lib/auth/session-version-db', () => ({
  getDbSessionVersion: (userId: string) => getDbSessionVersionMock(userId),
  getDbEmailVerified: (userId: string) => getDbEmailVerifiedMock(userId),
  getDbMemberApprovalStatus: (userId: string, workspaceId: string) =>
    getDbMemberApprovalStatusMock(userId, workspaceId),
}));

import {
  requireSession,
  requireBuyerSession,
  requirePgSession,
  isSessionRevoked,
  isEmailUnverified,
} from '../session';

beforeEach(() => {
  authMock.mockReset();
  getDbSessionVersionMock.mockReset();
  getDbEmailVerifiedMock.mockReset();
  getDbMemberApprovalStatusMock.mockReset();
  getDbEmailVerifiedMock.mockResolvedValue(true); // default: 인증 완료
  getDbMemberApprovalStatusMock.mockResolvedValue('approved'); // default: 승인 완료
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

describe('requireSession — emailVerified gate', () => {
  it('이메일 미인증 사용자 → EMAIL_UNVERIFIED', async () => {
    authMock.mockResolvedValue({
      user: { id: 'u-1', email: 'a@b.c', sessionVersion: 1 },
    });
    getDbSessionVersionMock.mockResolvedValue(1);
    getDbEmailVerifiedMock.mockResolvedValue(false);
    await expect(requireSession()).rejects.toThrow('EMAIL_UNVERIFIED');
  });

  it('인증 완료 + sv 일치 → 세션 반환', async () => {
    const session = { user: { id: 'u-1', email: 'a@b.c', sessionVersion: 1 } };
    authMock.mockResolvedValue(session);
    getDbSessionVersionMock.mockResolvedValue(1);
    getDbEmailVerifiedMock.mockResolvedValue(true);
    await expect(requireSession()).resolves.toBe(session);
  });
});

describe('requirePgSession — 멤버십 승인 게이트', () => {
  const pgUser = {
    id: 'u-1',
    email: 'a@b.c',
    sessionVersion: 1,
    workspaceId: 'ws-pg',
    workspaceType: 'pg',
    role: 'admin',
  };

  beforeEach(() => {
    getDbSessionVersionMock.mockResolvedValue(1);
  });

  it('approved 멤버는 세션을 반환한다', async () => {
    const session = { user: pgUser };
    authMock.mockResolvedValue(session);
    getDbMemberApprovalStatusMock.mockResolvedValue('approved');
    await expect(requirePgSession()).resolves.toBe(session);
    expect(getDbMemberApprovalStatusMock).toHaveBeenCalledWith('u-1', 'ws-pg');
  });

  it('pending_approval 멤버(canonical-PG 합류 직후) → FORBIDDEN_PG', async () => {
    authMock.mockResolvedValue({ user: pgUser });
    getDbMemberApprovalStatusMock.mockResolvedValue('pending_approval');
    await expect(requirePgSession()).rejects.toThrow('FORBIDDEN_PG');
  });

  it('rejected 멤버 → FORBIDDEN_PG', async () => {
    authMock.mockResolvedValue({ user: pgUser });
    getDbMemberApprovalStatusMock.mockResolvedValue('rejected');
    await expect(requirePgSession()).rejects.toThrow('FORBIDDEN_PG');
  });

  it('멤버십 행이 없으면(null — stale JWT) → FORBIDDEN_PG (fail-closed)', async () => {
    authMock.mockResolvedValue({ user: pgUser });
    getDbMemberApprovalStatusMock.mockResolvedValue(null);
    await expect(requirePgSession()).rejects.toThrow('FORBIDDEN_PG');
  });

  it('requireBuyerSession 은 승인 상태를 읽지 않는다 (pending 을 만드는 경로가 PG 뿐)', async () => {
    const session = {
      user: { ...pgUser, workspaceId: 'ws-buyer', workspaceType: 'buyer' },
    };
    authMock.mockResolvedValue(session);
    getDbMemberApprovalStatusMock.mockResolvedValue('pending_approval');
    await expect(requireBuyerSession()).resolves.toBe(session);
    expect(getDbMemberApprovalStatusMock).not.toHaveBeenCalled();
  });
});

describe('isEmailUnverified', () => {
  it('세션 없음 → true', async () => {
    await expect(isEmailUnverified(null)).resolves.toBe(true);
  });

  it('미인증(getDbEmailVerified=false) → true', async () => {
    getDbEmailVerifiedMock.mockResolvedValue(false);
    await expect(
      isEmailUnverified({ user: { id: 'u-1' } } as never),
    ).resolves.toBe(true);
  });

  it('인증 완료(getDbEmailVerified=true) → false', async () => {
    getDbEmailVerifiedMock.mockResolvedValue(true);
    await expect(
      isEmailUnverified({ user: { id: 'u-1' } } as never),
    ).resolves.toBe(false);
  });
});
