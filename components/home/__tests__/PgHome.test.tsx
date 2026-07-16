import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const { loadPgDashboardMock } = vi.hoisted(() => ({ loadPgDashboardMock: vi.fn() }));
vi.mock('@/lib/server/dashboard/loadDashboard', () => ({
  loadPgDashboard: loadPgDashboardMock,
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

import { PgHome } from '../PgHome';

beforeEach(() => {
  loadPgDashboardMock.mockResolvedValue({ kpis: [], groups: [] });
  listInboxForViewerMock.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PgHome', () => {
  it('getOnboarding을 호출하지 않고 코치마크 prop을 전달하지 않는다', async () => {
    render(await PgHome({ workspaceId: 'ws-1', userId: 'u-1' }));
    expect(screen.getByText('HomeDashboard')).toBeInTheDocument();
    expect(getOnboardingMock).not.toHaveBeenCalled();
    const props = homeDashboardPropsSpy.mock.calls[0][0];
    expect(props.workspaceType).toBe('pg');
    expect(props.showFirstRfpCoachmark).toBeUndefined();
    expect(props.welcomeState).toBeUndefined();
  });
});
