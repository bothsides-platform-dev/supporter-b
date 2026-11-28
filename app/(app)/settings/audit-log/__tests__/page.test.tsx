import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetMembership = vi.hoisted(() => vi.fn());
const mockListForWorkspace = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/auth/active-workspace', () => ({
  getMembership: mockGetMembership,
  isApprovedAdmin: (membership: { role: string; approvalStatus: string } | null) =>
    membership?.role === 'admin' && membership.approvalStatus === 'approved',
}));
vi.mock('@/lib/server/repositories/factory', () => ({
  getAuditLogRepo: async () => ({ listForWorkspace: mockListForWorkspace }),
}));
vi.mock('@/components/primitives/PageEnter', () => ({
  PageEnter: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/settings/AuditLogPanel', () => ({
  AuditLogPanel: ({ initialLogs }: { initialLogs: unknown[] }) => (
    <div data-testid="audit-log-panel">{JSON.stringify(initialLogs)}</div>
  ),
}));

import AuditLogPage from '../page';

const originalMasterEmails = process.env.MASTER_ACCOUNT_EMAILS;

describe('AuditLogPage', () => {
  beforeEach(() => {
    process.env.MASTER_ACCOUNT_EMAILS = 'ops@support-b.com';
    mockAuth.mockReset();
    mockGetMembership.mockReset();
    mockListForWorkspace.mockReset();
    mockAuth.mockResolvedValue({
      user: {
        id: 'master-1',
        email: 'ops@support-b.com',
        workspaceId: 'workspace-1',
        workspaceType: 'buyer',
      },
    });
    mockGetMembership.mockResolvedValue(null);
    mockListForWorkspace.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalMasterEmails === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
    else process.env.MASTER_ACCOUNT_EMAILS = originalMasterEmails;
  });

  it('운영계정은 멤버십 행 없이 현재 워크스페이스의 활동 기록 화면을 본다', async () => {
    render(await AuditLogPage());

    expect(screen.getByTestId('audit-log-panel')).toBeInTheDocument();
    expect(mockListForWorkspace).toHaveBeenCalledWith('workspace-1', { limit: 50 });
  });

  it('첫 페이지의 클라이언트 props에서 지정 계정의 이름과 원시 메타데이터를 가린다', async () => {
    vi.stubEnv('AUDIT_LOG_MASKED_ACTOR_IDS', 'actor-private');
    mockListForWorkspace.mockResolvedValue([{
      id: 'log-1', actorUserId: 'actor-private', actorName: '테스트 담당자', viaMaster: true,
      action: 'bid.submit', entityType: 'rfp', entityId: 'P-2610-0001',
      createdAt: '2026-10-01T00:00:00Z', metadata: { round: 2, note: '테스트 담당자' },
    }]);

    render(await AuditLogPage());

    const props = JSON.parse(screen.getByTestId('audit-log-panel').textContent!);
    expect(props).toEqual([{
      id: 'log-1', actorName: '이름 비공개', viaMaster: true,
      action: 'bid.submit', entityType: 'rfp', entityId: 'P-2610-0001',
      createdAt: '2026-10-01T00:00:00Z', metadata: { round: 2 },
    }]);
  });

  it('승인된 admin은 기존처럼 활동 기록 화면을 본다', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'admin-1',
        email: 'admin@buyer.com',
        workspaceId: 'workspace-1',
        workspaceType: 'buyer',
      },
    });
    mockGetMembership.mockResolvedValue({ role: 'admin', approvalStatus: 'approved' });

    render(await AuditLogPage());

    expect(screen.getByTestId('audit-log-panel')).toBeInTheDocument();
    expect(mockGetMembership).toHaveBeenCalledWith('admin-1', 'workspace-1');
    expect(mockListForWorkspace).toHaveBeenCalledWith('workspace-1', { limit: 50 });
  });

  it('운영계정이 아닌 member에게는 안내 문구만 보여준다', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'member-1',
        email: 'member@buyer.com',
        workspaceId: 'workspace-1',
        workspaceType: 'buyer',
      },
    });
    mockGetMembership.mockResolvedValue({ role: 'member', approvalStatus: 'approved' });

    render(await AuditLogPage());

    expect(screen.getByText('활동 기록은 관리자만 볼 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByTestId('audit-log-panel')).not.toBeInTheDocument();
    expect(mockListForWorkspace).not.toHaveBeenCalled();
  });
});
