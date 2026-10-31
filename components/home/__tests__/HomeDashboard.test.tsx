import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Mock the server-action barrel so the jsdom suite doesn't load next-auth
// (pulled transitively via the OpportunityRequestDialog in the discovery section).
vi.mock('@/lib/server/actions/rfp', () => ({ createPgRequestAction: vi.fn() }));
vi.mock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: true }));
vi.mock('@/components/onboarding/WelcomeModal', () => ({
  WelcomeModal: ({ variant }: { variant: string }) => <div>WelcomeModal:{variant}</div>,
}));
vi.mock('@/components/onboarding/TutorialNudge', () => ({
  TutorialNudge: () => <div>TutorialNudge</div>,
}));

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
  it('구매사 홈에서는 다음 행동 → 새 요청 → 통계 순서이며 메시지를 유지한다', () => {
    render(<HomeDashboard dashboard={{ ...withGroups, buyerTasks: { hasRequests: true }, groups: [
      { id: 'agreement', label: '합의서를 이어서 진행해요', items: [{ id: 'P-A', title: 'A', href: '/rfp/P-A?tab=contract', badge: '선정 완료 · 서명 요청 전', actionLabel: '합의서 작성하기' }] },
    ] }} workspaceType="buyer" items={[]} unreadCount={0} />);
    const task = screen.getByRole('link', { name: 'A · 합의서 작성하기' });
    const create = screen.getByRole('link', { name: '새 견적 요청하기' });
    const stats = screen.getByRole('region', { name: '진행 현황' });
    expect(task).toHaveAttribute('href', '/rfp/P-A?tab=contract');
    expect(task.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(create.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText('메시지')).toBeInTheDocument();
  });

  it('첫 이용자에게는 첫 요청을, 완료된 요청만 있는 이용자에게는 새 요청을 표시한다', () => {
    const { rerender } = render(<HomeDashboard dashboard={{ ...empty, buyerTasks: { hasRequests: false } }} workspaceType="buyer" items={[]} unreadCount={0} />);
    expect(screen.getByRole('link', { name: '첫 견적 요청하기' })).toHaveAttribute('href', '/rfp-create');
    expect(screen.queryByRole('heading', { name: '이어서 진행해요' })).not.toBeInTheDocument();
    rerender(<HomeDashboard dashboard={{ ...empty, buyerTasks: { hasRequests: true } }} workspaceType="buyer" items={[]} unreadCount={0} />);
    expect(screen.getByRole('link', { name: '새 견적 요청하기' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '첫 견적 요청하기' })).not.toBeInTheDocument();
  });

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

  // CTA는 KPI strip(진행중·…·선정 완료) 바로 아래에 와야 한다 — 큰 풀-width 버튼.
  it('places the 견적 요청하기 CTA after the KPI strip in DOM order', () => {
    render(<HomeDashboard dashboard={empty} workspaceType="buyer" items={[]} unreadCount={0} />);
    const kpi = screen.getByRole('link', { name: /진행중/ });
    const cta = screen.getByRole('link', { name: /견적 요청하기/ });
    // CTA must FOLLOW the KPI link in document order (it currently precedes it → RED).
    expect(kpi.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('welcomeState="welcome"이면 variant=workspaceType의 WelcomeModal을 렌더한다', () => {
    render(
      <HomeDashboard
        dashboard={withGroups}
        workspaceType="buyer"
        items={[]}
        unreadCount={0}
        welcomeState="welcome"
      />,
    );
    expect(screen.getByText('WelcomeModal:buyer')).toBeInTheDocument();
    expect(screen.queryByText('TutorialNudge')).not.toBeInTheDocument();
  });

  it('welcomeState="nudge"이면 TutorialNudge를 렌더한다', () => {
    render(
      <HomeDashboard
        dashboard={withGroups}
        workspaceType="pg"
        items={[]}
        unreadCount={0}
        welcomeState="nudge"
      />,
    );
    expect(screen.getByText('TutorialNudge')).toBeInTheDocument();
    expect(screen.queryByText(/WelcomeModal/)).not.toBeInTheDocument();
  });

  it('welcomeState="none"/미지정이면 둘 다 렌더하지 않는다', () => {
    render(<HomeDashboard dashboard={withGroups} workspaceType="buyer" items={[]} unreadCount={0} />);
    expect(screen.queryByText(/WelcomeModal/)).not.toBeInTheDocument();
    expect(screen.queryByText('TutorialNudge')).not.toBeInTheDocument();
  });
});


it('PG 홈은 응답 필요 요약 카드를 한 번 표시한다', () => {
  render(<HomeDashboard dashboard={{ ...withGroups, requests: [{ invitationId: 'i', stage: 'received', rfpId: 'P-1', rfpTitle: '교육 결제', buyerName: '배움 회사', industryName: '교육', grade: '영세', rfpDeadline: '2099-11-01T09:00:00Z' }] }} workspaceType="pg" items={[]} unreadCount={0} />);
  expect(screen.getByRole('heading', { name: '응답이 필요한 요청' })).toBeInTheDocument();
  expect(screen.getAllByText('배움 회사')).toHaveLength(1);
  expect(screen.getByRole('link', { name: '견적 작성' })).toHaveAttribute('href', '/inbox/P-1?tab=write');
});

it('shows the five earliest response deadlines with the total and full-list link', () => {
  const requests = [6, 3, 1, 5, 2, 4].map(day => ({
    invitationId: `i-${day}`, stage: 'received' as const,
    rfpId: `P-${day}`, rfpTitle: `요청 ${day}`, grade: '영세',
    rfpDeadline: `2099-11-0${day}T09:00:00Z`,
  }));
  render(<HomeDashboard dashboard={{ ...empty, requests }} workspaceType="pg" items={[]} unreadCount={0} />);
  const list = screen.getByRole('list', { name: '받은 견적 요청' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  expect(within(list).getAllByRole('button').map(el => el.textContent)).toEqual(['요청 1', '요청 2', '요청 3', '요청 4', '요청 5']);
  expect(screen.getByRole('link', { name: '응답 필요 6건' })).toHaveAttribute('href', '/inbox?status=response');
  expect(screen.getByRole('link', { name: '전체 보기' })).toHaveAttribute('href', '/inbox?status=response');
});
