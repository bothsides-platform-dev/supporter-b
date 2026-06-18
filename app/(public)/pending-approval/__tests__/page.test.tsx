import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('@/auth', () => ({ auth: authMock }));

const { findByIdMock } = vi.hoisted(() => ({ findByIdMock: vi.fn() }));
const { getMemberApprovalStatusMock } = vi.hoisted(() => ({
  getMemberApprovalStatusMock: vi.fn(),
}));
vi.mock('@/lib/server/repositories/factory', () => ({
  getUserRepo: async () => ({ findById: findByIdMock }),
  getWorkspaceRepo: async () => ({
    getMemberApprovalStatus: getMemberApprovalStatusMock,
  }),
}));

vi.mock('@/components/pending-approval/email-verify-screen', () => ({
  EmailVerifyScreen: ({ email }: { email: string }) => <div>EmailVerifyScreen:{email}</div>,
}));
vi.mock('@/components/pending-approval/membership-approval-waiting-screen', () => ({
  MembershipApprovalWaitingScreen: () => <div>MembershipApprovalWaitingScreen</div>,
}));
vi.mock('@/components/pending-approval/approval-waiting-screen', () => ({
  ApprovalWaitingScreen: () => <div>ApprovalWaitingScreen</div>,
}));

import PendingApprovalPage from '../page';

const SESSION = {
  user: { id: 'u-1', workspaceId: 'ws-1', email: 'a@example.com' },
};

beforeEach(() => {
  authMock.mockResolvedValue(SESSION);
  findByIdMock.mockResolvedValue({ id: 'u-1', emailVerified: true });
  getMemberApprovalStatusMock.mockResolvedValue('approved');
});
afterEach(cleanup);

describe('PendingApprovalPage 분기', () => {
  it('emailVerified=false → EmailVerifyScreen 렌더', async () => {
    findByIdMock.mockResolvedValue({ id: 'u-1', emailVerified: false });
    render(await PendingApprovalPage());
    expect(screen.getByText('EmailVerifyScreen:a@example.com')).toBeInTheDocument();
  });

  it('emailVerified=true + memberApprovalStatus=pending_approval → MembershipApprovalWaitingScreen 렌더', async () => {
    getMemberApprovalStatusMock.mockResolvedValue('pending_approval');
    render(await PendingApprovalPage());
    expect(screen.getByText('MembershipApprovalWaitingScreen')).toBeInTheDocument();
  });

  it('emailVerified=true + memberApprovalStatus=approved → ApprovalWaitingScreen 렌더', async () => {
    render(await PendingApprovalPage());
    expect(screen.getByText('ApprovalWaitingScreen')).toBeInTheDocument();
  });
});
