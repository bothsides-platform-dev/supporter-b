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
  it('buyerTutorial 태스크가 미완료면 welcomeState="welcome"을 HomeDashboard에 전달한다', async () => {
    getOnboardingMock.mockResolvedValue({ _v: 1 });
    render(await BuyerHome({ workspaceId: 'ws-1', userId: 'u-1' }));
    expect(screen.getByText('HomeDashboard')).toBeInTheDocument();
    expect(getOnboardingMock).toHaveBeenCalledWith('u-1');
    expect(homeDashboardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ welcomeState: 'welcome', workspaceType: 'buyer' }),
    );
  });

  it('buyerTutorial 태스크가 dismissed면 welcomeState="nudge"를 전달한다', async () => {
    getOnboardingMock.mockResolvedValue({ _v: 1, buyerTutorial: { dismissedAt: '2026-01-01T00:00:00Z' } });
    render(await BuyerHome({ workspaceId: 'ws-1', userId: 'u-1' }));
    expect(homeDashboardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ welcomeState: 'nudge' }),
    );
  });

  it('buyerTutorial 태스크가 completed면 welcomeState="none"을 전달한다', async () => {
    getOnboardingMock.mockResolvedValue({ _v: 1, buyerTutorial: { completedAt: '2026-01-01T00:00:00Z' } });
    render(await BuyerHome({ workspaceId: 'ws-1', userId: 'u-1' }));
    expect(homeDashboardPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ welcomeState: 'none' }),
    );
  });
});
