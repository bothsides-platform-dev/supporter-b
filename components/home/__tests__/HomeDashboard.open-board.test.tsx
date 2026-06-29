import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// OpportunityRequestDialog 가 transitively 끌어오는 의존성 차단 (기존 테스트와 동일).
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/server/actions/rfp', () => ({ createPgRequestAction: vi.fn() }));

import { HomeDashboard } from '../HomeDashboard';
import type { Dashboard } from '@/lib/server/dashboard/buildDashboard';

const base: Dashboard = {
  kpis: [],
  groups: [],
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

describe('HomeDashboard — open board disabled (flag off)', () => {
  it('pg openRfps 가 있어도 탐색 섹션을 렌더하지 않는다', () => {
    render(<HomeDashboard dashboard={base} workspaceType="pg" items={[]} unreadCount={0} />);
    expect(screen.queryByText('참여 가능한 견적')).not.toBeInTheDocument();
    expect(screen.queryByText('카드 PG 견적')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '참여 요청' })).not.toBeInTheDocument();
  });
});
