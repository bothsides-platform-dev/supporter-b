/**
 * requireActiveWorkspace — PG 멤버십 승인 데이터 경계.
 *
 * requirePgSession 게이트(session.test.ts)만으로는 채팅·보드·계약 라이프사이클
 * (cancel/resend/remind) 등 requireActiveWorkspace 경유 표면이 열려 있다 —
 * pending_approval PG 멤버(canonical-PG 합류 직후)의 유효한 JWT 로 직접 호출이
 * 가능했다(red-team 리뷰 P2). 여기서 같은 승인 게이트가 걸리는 것을 고정한다.
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

import { requireActiveWorkspace } from '../_session';

function sessionFor(workspaceType: 'buyer' | 'pg', email = 'a@b.c') {
  return {
    user: {
      id: 'u-1',
      email,
      sessionVersion: 1,
      workspaceId: `ws-${workspaceType}`,
      workspaceType,
      role: 'admin',
    },
  };
}

beforeEach(() => {
  authMock.mockReset();
  getDbSessionVersionMock.mockReset();
  getDbEmailVerifiedMock.mockReset();
  getDbMemberApprovalStatusMock.mockReset();
  getDbSessionVersionMock.mockResolvedValue(1);
  getDbEmailVerifiedMock.mockResolvedValue(true);
  getDbMemberApprovalStatusMock.mockResolvedValue('approved');
});

describe('requireActiveWorkspace — PG 멤버십 승인 게이트', () => {
  it('approved PG 멤버는 통과한다', async () => {
    authMock.mockResolvedValue(sessionFor('pg'));
    await expect(requireActiveWorkspace()).resolves.toEqual({
      ok: true,
      userId: 'u-1',
      workspaceId: 'ws-pg',
      workspaceType: 'pg',
    });
  });

  it('pending_approval PG 멤버 → FORBIDDEN_PG (채팅·보드·계약 라이프사이클 차단)', async () => {
    authMock.mockResolvedValue(sessionFor('pg'));
    getDbMemberApprovalStatusMock.mockResolvedValue('pending_approval');
    await expect(requireActiveWorkspace()).resolves.toEqual({
      ok: false,
      error: 'FORBIDDEN_PG',
    });
  });

  it('rejected PG 멤버 → FORBIDDEN_PG', async () => {
    authMock.mockResolvedValue(sessionFor('pg'));
    getDbMemberApprovalStatusMock.mockResolvedValue('rejected');
    await expect(requireActiveWorkspace()).resolves.toEqual({
      ok: false,
      error: 'FORBIDDEN_PG',
    });
  });

  it('buyer 세션은 승인 상태를 읽지 않고 통과한다', async () => {
    authMock.mockResolvedValue(sessionFor('buyer'));
    getDbMemberApprovalStatusMock.mockResolvedValue('pending_approval');
    await expect(requireActiveWorkspace()).resolves.toEqual({
      ok: true,
      userId: 'u-1',
      workspaceId: 'ws-buyer',
      workspaceType: 'buyer',
    });
    expect(getDbMemberApprovalStatusMock).not.toHaveBeenCalled();
  });

  it('마스터 계정(멤버십 row 없음)은 PG 워크스페이스에서도 통과한다', async () => {
    const prev = process.env.MASTER_ACCOUNT_EMAILS;
    process.env.MASTER_ACCOUNT_EMAILS = 'ops@support-b.com';
    try {
      authMock.mockResolvedValue(sessionFor('pg', 'ops@support-b.com'));
      getDbMemberApprovalStatusMock.mockResolvedValue(null);
      await expect(requireActiveWorkspace()).resolves.toEqual({
        ok: true,
        userId: 'u-1',
        workspaceId: 'ws-pg',
        workspaceType: 'pg',
      });
      expect(getDbMemberApprovalStatusMock).not.toHaveBeenCalled();
    } finally {
      process.env.MASTER_ACCOUNT_EMAILS = prev;
    }
  });
});
