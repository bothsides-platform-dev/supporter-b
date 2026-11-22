import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error('REDIRECT:' + to); } }));

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('@/auth', () => ({ auth: authMock }));

const { findByIdMock } = vi.hoisted(() => ({ findByIdMock: vi.fn() }));
const { getMemberApprovalStatusMock, hasActiveBusinessMembershipMock } = vi.hoisted(() => ({
  getMemberApprovalStatusMock: vi.fn(),
  hasActiveBusinessMembershipMock: vi.fn(),
}));
vi.mock('@/lib/server/repositories/factory', () => ({
  getUserRepo: async () => ({ findById: findByIdMock }),
  getWorkspaceRepo: async () => ({
    getMemberApprovalStatus: getMemberApprovalStatusMock,
    hasActiveBusinessMembership: hasActiveBusinessMembershipMock,
  }),
}));

vi.mock('@/components/pending-approval/EmailVerifyScreen', () => ({
  EmailVerifyScreen: ({ email }: { email: string }) => <div>EmailVerifyScreen:{email}</div>,
}));
vi.mock('@/components/pending-approval/MembershipApprovalWaitingScreen', () => ({
  MembershipApprovalWaitingScreen: ({ initialRejected }: { initialRejected?: boolean }) => (
    <div>MembershipApprovalWaitingScreen{initialRejected ? ':rejected' : ''}</div>
  ),
}));
vi.mock('@/components/pending-approval/ApprovalWaitingScreen', () => ({
  ApprovalWaitingScreen: () => <div>ApprovalWaitingScreen</div>,
}));

const { showEntryMock } = vi.hoisted(() => ({ showEntryMock: vi.fn(async () => false) }));
vi.mock('@/lib/server/services/instant-intake', () => ({ showInstantEntry: showEntryMock }));
vi.mock('@/lib/analytics/use-funnel', () => ({ FunnelView: () => null }));

import PendingApprovalPage from '../page';

const SESSION = {
  user: { id: 'u-1', workspaceId: 'ws-1', email: 'a@example.com' },
};

beforeEach(() => {
  authMock.mockResolvedValue(SESSION);
  findByIdMock.mockResolvedValue({ id: 'u-1', emailVerified: true });
  getMemberApprovalStatusMock.mockResolvedValue('approved');
  hasActiveBusinessMembershipMock.mockResolvedValue(false);
});
afterEach(cleanup);

describe('PendingApprovalPage 분기', () => {
  it('현재 DB 승인 상태를 이메일 인증 안내에 전달한다', async () => {
    findByIdMock.mockResolvedValue({ id: 'u-1', emailVerified: false });
    hasActiveBusinessMembershipMock.mockResolvedValue(true);
    const page = await PendingApprovalPage();
    expect(page.props).toMatchObject({ email: 'a@example.com', workspaceApproved: true });
    expect(hasActiveBusinessMembershipMock).toHaveBeenCalledWith('u-1', 'ws-1');
  });
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

  it('emailVerified=true + memberApprovalStatus=rejected → MembershipApprovalWaitingScreen(initialRejected) 렌더', async () => {
    getMemberApprovalStatusMock.mockResolvedValue('rejected');
    render(await PendingApprovalPage());
    expect(screen.getByText('MembershipApprovalWaitingScreen:rejected')).toBeInTheDocument();
  });

  it('emailVerified=true + memberApprovalStatus=approved → ApprovalWaitingScreen 렌더', async () => {
    render(await PendingApprovalPage());
    expect(screen.getByText('ApprovalWaitingScreen')).toBeInTheDocument();
  });
});

it('이미 승인된 회원은 심사 대기를 렌더하지 않고 즉시 앱으로 이동한다', async () => {
  hasActiveBusinessMembershipMock.mockResolvedValue(true);
  await expect(PendingApprovalPage()).rejects.toThrow('REDIRECT:/home');
});

it('즉시 견적 신청 확인 링크는 접수가 열렸거나 신청이 있는 구매사에게만 보인다', async () => {
  authMock.mockResolvedValue({ user: { ...SESSION.user, workspaceType: 'buyer' } });
  render(await PendingApprovalPage());
  expect(screen.queryByRole('link', { name: '내 PG 가입 신청 확인' })).not.toBeInTheDocument();
  cleanup();
  showEntryMock.mockResolvedValueOnce(true);
  render(await PendingApprovalPage());
  expect(screen.getByRole('link', { name: '내 PG 가입 신청 확인' })).toBeInTheDocument();
});
