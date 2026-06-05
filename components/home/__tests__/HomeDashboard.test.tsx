import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Mock the server-action barrel so the jsdom suite doesn't load next-auth
// (pulled transitively via the OpportunityRequestDialog in the discovery section).
vi.mock('@/lib/server/actions/rfp', () => ({ createPgRequestAction: vi.fn() }));

import { HomeDashboard } from '../HomeDashboard';
import type { Dashboard } from '@/lib/server/dashboard/buildDashboard';

afterEach(() => cleanup());

const withGroups: Dashboard = {
  kpis: [{ id: 'active', label: '진행중', value: 8, href: '/rfp?status=active' }],
  groups: [{ id: 'due', label: '마감 임박', items: [{ id: 'P-A', href: '/rfp/P-A', title: 'A', badge: 'D-3' }] }],
  onboardingActions: null,
};

const empty: Dashboard = {
  kpis: [{ id: 'active', label: '진행중', value: 0, href: '/rfp?status=active' }],
  groups: [],
  onboardingActions: null,
};

const withOnboarding: Dashboard = {
  kpis: [{ id: 'active', label: '진행중', value: 0, href: '/rfp?status=active' }],
  groups: [],
  onboardingActions: [
    { id: 'create-rfp',     href: '/rfp/new',          title: '첫 RFP를 작성해 보세요',  description: 'PG사를 초대하고 수수료 견적을 비교할 수 있어요' },
    { id: 'setup-profile',  href: '/settings/profile', title: '워크스페이스 프로필 설정', description: '' },
    { id: 'invite-members', href: '/settings/members', title: '팀원 초대하기',            description: '' },
  ],
};

describe('HomeDashboard', () => {
  it('renders KPI strip, action queue, and the chat panel', () => {
    render(<HomeDashboard dashboard={withGroups} workspaceType="buyer" />);
    // NOTE: don't getByText('마감 임박') — a KPI and an action group can share
    // that label; anchor on the unique action item instead.
    expect(screen.getByRole('link', { name: /진행중/ })).toBeInTheDocument();
    const item = screen.getByRole('link', { name: /A/ });
    expect(item).toHaveAttribute('href', '/rfp/P-A');
    expect(item).toHaveTextContent('D-3');
    expect(screen.getByLabelText('메시지')).toBeInTheDocument();
  });

  it('shows a workspace-specific empty state when there are no action groups', () => {
    render(<HomeDashboard dashboard={empty} workspaceType="pg" />);
    expect(screen.getByText('지금 처리할 일이 없습니다')).toBeInTheDocument();
    expect(screen.getByText('구매사가 초대한 견적 요청이 여기에 표시돼요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /진행중/ })).toBeInTheDocument();
  });

  it('shows OnboardingActionList when groups is empty and onboardingActions is set', () => {
    render(<HomeDashboard dashboard={withOnboarding} workspaceType="buyer" />);
    expect(screen.getByRole('link', { name: /첫 RFP를 작성해 보세요/ }))
      .toHaveAttribute('href', '/rfp/new');
    expect(screen.getByRole('link', { name: /워크스페이스 프로필 설정/ }))
      .toHaveAttribute('href', '/settings/profile');
    expect(screen.queryByText('지금 처리할 일이 없습니다')).not.toBeInTheDocument();
  });

  it('renders the open-RFP discovery section for a PG with openRfps', () => {
    const dash: Dashboard = {
      ...empty,
      openRfps: [
        {
          rfpCode: 'P-OPEN1',
          buyerName: '구매사A',
          title: '카드 PG 견적',
          websiteUrl: 'https://a.example.com',
          deadline: new Date(Date.now() + 5 * 86_400_000).toISOString(),
          requiredPaymentMethods: ['card'],
          customPaymentMethodLabels: [],
          mainProducts: null,
        },
      ],
    };
    render(<HomeDashboard dashboard={dash} workspaceType="pg" />);
    expect(screen.getByText('카드 PG 견적')).toBeInTheDocument();
    expect(screen.getByText('구매사A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '참여 요청' })).toBeInTheDocument();
  });

  it('does not render the discovery section for a buyer', () => {
    render(<HomeDashboard dashboard={withGroups} workspaceType="buyer" />);
    expect(screen.queryByRole('button', { name: '참여 요청' })).not.toBeInTheDocument();
  });
});
