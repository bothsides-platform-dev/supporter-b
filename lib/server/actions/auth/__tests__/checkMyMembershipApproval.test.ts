import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({ headers: () => Promise.resolve({ get: () => null }) }));

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('@/auth', () => ({ auth: authMock }));

const { getMemberApprovalStatusMock } = vi.hoisted(() => ({
  getMemberApprovalStatusMock: vi.fn(),
}));
vi.mock('@/lib/server/repositories/factory', () => ({
  getWorkspaceRepo: async () => ({
    getMemberApprovalStatus: getMemberApprovalStatusMock,
  }),
}));

import { checkMyMembershipApprovalAction } from '../checkMyMembershipApprovalAction';

const SESSION = {
  user: { id: 'u-1', workspaceId: 'ws-1', workspaceType: 'pg' as const },
};

beforeEach(() => {
  authMock.mockResolvedValue(SESSION);
  getMemberApprovalStatusMock.mockResolvedValue('pending_approval');
});

describe('checkMyMembershipApprovalAction', () => {
  it('pending_approval 상태를 반환한다', async () => {
    const r = await checkMyMembershipApprovalAction();
    expect(r).toEqual({ status: 'pending_approval' });
    expect(getMemberApprovalStatusMock).toHaveBeenCalledWith('u-1', 'ws-1');
  });

  it('approved 상태를 반환한다', async () => {
    getMemberApprovalStatusMock.mockResolvedValue('approved');
    expect(await checkMyMembershipApprovalAction()).toEqual({ status: 'approved' });
  });

  it('rejected 상태를 반환한다', async () => {
    getMemberApprovalStatusMock.mockResolvedValue('rejected');
    expect(await checkMyMembershipApprovalAction()).toEqual({ status: 'rejected' });
  });

  it('DB에 행 없음(undefined) → approved로 폴백', async () => {
    getMemberApprovalStatusMock.mockResolvedValue(undefined);
    expect(await checkMyMembershipApprovalAction()).toEqual({ status: 'approved' });
  });

  it('세션 없음 → unknown', async () => {
    authMock.mockResolvedValue(null);
    expect(await checkMyMembershipApprovalAction()).toEqual({ status: 'unknown' });
  });

  it('workspaceId 없음 → unknown', async () => {
    authMock.mockResolvedValue({ user: { id: 'u-1' } });
    expect(await checkMyMembershipApprovalAction()).toEqual({ status: 'unknown' });
  });
});
