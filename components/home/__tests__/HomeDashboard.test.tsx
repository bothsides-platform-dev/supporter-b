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
};

const empty: Dashboard = {
  kpis: [{ id: 'active', label: '진행중', value: 0, href: '/rfp?status=active' }],
  groups: [],
};

describe('HomeDashboard', () => {
  it('renders KPI strip, action queue, and the chat panel', () => {
    render(<HomeDashboard dashboard={withGroups} workspaceType="buyer" items={[]} unreadCount={0} />);
    // NOTE: don't getByText('마감 임박') — a KPI and an action group can share
    // that label; anchor on the unique action item instead.
    expect(screen.getByRole('link', { name: /진행중/ })).toBeInTheDocument();
    const item = screen.getByRole('link', { name: /A/ });
    expect(item).toHaveAttribute('href', '/rfp/P-A');
    expect(item).toHaveTextContent('D-3');
    expect(screen.getByLabelText('메시지')).toBeInTheDocument();
  });

  it('shows a workspace-specific empty state when there are no action groups', () => {
    render(<HomeDashboard dashboard={empty} workspaceType="pg" items={[]} unreadCount={0} />);
    expect(screen.getByText('지금 처리할 일이 없습니다')).toBeInTheDocument();
    expect(screen.getByText('구매사가 초대한 견적 요청이 여기에 표시돼요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /진행중/ })).toBeInTheDocument();
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
    render(<HomeDashboard dashboard={dash} workspaceType="pg" items={[]} unreadCount={0} />);
    expect(screen.getByText('카드 PG 견적')).toBeInTheDocument();
    expect(screen.getByText('구매사A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '참여 요청' })).toBeInTheDocument();
  });

  it('does not render the discovery section for a buyer', () => {
    render(<HomeDashboard dashboard={withGroups} workspaceType="buyer" items={[]} unreadCount={0} />);
    expect(screen.queryByRole('button', { name: '참여 요청' })).not.toBeInTheDocument();
  });

  // 샘플 견적(액션 큐에 잡힘)이 있어도 구매사 홈에 "새 견적 만들기" 동선이 남아야 한다.
  // 기존 /rfp 헤더의 "견적 요청하기"(→ /rfp-create) CTA를 그대로 재사용.
  it('shows the 견적 요청하기 CTA (→ /rfp-create) for a buyer with an action queue (e.g. a sample RFP)', () => {
    render(<HomeDashboard dashboard={withGroups} workspaceType="buyer" items={[]} unreadCount={0} />);
    expect(screen.getByRole('link', { name: /견적 요청하기/ })).toHaveAttribute('href', '/rfp-create');
  });

  it('shows the 견적 요청하기 CTA for a buyer in the "no work" empty state too', () => {
    render(<HomeDashboard dashboard={empty} workspaceType="buyer" items={[]} unreadCount={0} />);
    expect(screen.getByRole('link', { name: /견적 요청하기/ })).toHaveAttribute('href', '/rfp-create');
  });

  it('does not show the buyer create CTA for a PG', () => {
    render(<HomeDashboard dashboard={withGroups} workspaceType="pg" items={[]} unreadCount={0} />);
    expect(screen.queryByRole('link', { name: /견적 요청하기/ })).not.toBeInTheDocument();
  });
});
