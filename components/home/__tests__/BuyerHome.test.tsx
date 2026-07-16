import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const { loadBuyerDashboardMock } = vi.hoisted(() => ({ loadBuyerDashboardMock: vi.fn() }));
vi.mock('@/lib/server/dashboard/loadDashboard', () => ({
  loadBuyerDashboard: loadBuyerDashboardMock,
}));

const { listInboxForViewerMock } = vi.hoisted(() => ({ listInboxForViewerMock: vi.fn() }));
vi.mock('@/lib/server/actions/chat/inboxLoader', () => ({
  listInboxForViewer: listInboxForViewerMock,
}));

const { getOnboardingMock } = vi.hoisted(() => ({ getOnboardingMock: vi.fn() }));
vi.mock('@/lib/server/repositories/factory', () => ({
  getUserRepo: async () => ({ getOnboarding: getOnboardingMock }),
}));

const { homeDashboardPropsSpy } = vi.hoisted(() => ({ homeDashboardPropsSpy: vi.fn() }));
vi.mock('@/components/home/HomeDashboard', () => ({
  HomeDashboard: (props: Record<string, unknown>) => {
    homeDashboardPropsSpy(props);
    return <div>HomeDashboard</div>;
  },
}));

import { BuyerHome } from '../BuyerHome';

beforeEach(() => {
  loadBuyerDashboardMock.mockResolvedValue({ kpis: [], groups: [] });
  listInboxForViewerMock.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BuyerHome', () => {
  it('buyerFirstRfp 무스탬프 + hasAnyRfp=false면 showFirstRfpCoachmark=true를 전달한다', async () => {
    getOnboardingMock.mockResolvedValue({ _v: 1 });
    loadBuyerDashboardMock.mockResolvedValue({ kpis: [], groups: [], hasAnyRfp: false });
    render(await BuyerHome({ workspaceId: 'ws-1', userId: 'u-1' }));
    expect(screen.getByText('HomeDashboard')).toBeInTheDocument();
    expect(getOnboardingMock).toHaveBeenCalledWith('u-1');
    expect(homeDashboardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ showFirstRfpCoachmark: true, workspaceType: 'buyer' }),
    );
  });

  it('hasAnyRfp=true면 showFirstRfpCoachmark=false를 전달한다', async () => {
    getOnboardingMock.mockResolvedValue({ _v: 1 });
    loadBuyerDashboardMock.mockResolvedValue({ kpis: [], groups: [], hasAnyRfp: true });
    render(await BuyerHome({ workspaceId: 'ws-1', userId: 'u-1' }));
    expect(homeDashboardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ showFirstRfpCoachmark: false }),
    );
  });

  it('buyerFirstRfp가 dismissed면 hasAnyRfp=false여도 showFirstRfpCoachmark=false를 전달한다', async () => {
    getOnboardingMock.mockResolvedValue({
      _v: 1,
      buyerFirstRfp: { dismissedAt: '2026-01-01T00:00:00Z' },
    });
    loadBuyerDashboardMock.mockResolvedValue({ kpis: [], groups: [], hasAnyRfp: false });
    render(await BuyerHome({ workspaceId: 'ws-1', userId: 'u-1' }));
    expect(homeDashboardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ showFirstRfpCoachmark: false }),
    );
  });

  it('buyerFirstRfp가 completed면 hasAnyRfp=false여도 showFirstRfpCoachmark=false를 전달한다', async () => {
    getOnboardingMock.mockResolvedValue({
      _v: 1,
      buyerFirstRfp: { completedAt: '2026-01-01T00:00:00Z' },
    });
    loadBuyerDashboardMock.mockResolvedValue({ kpis: [], groups: [], hasAnyRfp: false });
    render(await BuyerHome({ workspaceId: 'ws-1', userId: 'u-1' }));
    expect(homeDashboardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ showFirstRfpCoachmark: false }),
    );
  });
});
