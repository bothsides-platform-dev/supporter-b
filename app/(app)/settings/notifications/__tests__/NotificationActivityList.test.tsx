import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Notification } from '@/lib/types/notification';

const mockMarkRead = vi.fn();
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    markRead: mockMarkRead,
    markAllRead: vi.fn(),
    notifications: [],
    unreadCount: 0,
    status: 'live',
    retryEmail: vi.fn(),
  }),
}));

const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, refresh: vi.fn() }),
}));

// stub server actions to avoid transitive next-auth/next server imports
vi.mock('@/lib/server/actions/notifications/markNotificationReadAction', () => ({
  markNotificationReadAction: vi.fn().mockResolvedValue({ ok: true }),
}));

// NotificationActivityList rows should call useNotifications().markRead(id) on interaction
// so the Zustand store gets the optimistic patch and the sidebar badge updates immediately.
// Previously the rows called markNotificationReadAction() directly → badge stayed stale.

import { NotificationActivityList } from '../NotificationActivityList';

const NOTIF_UNREAD: Notification = {
  id: 'notif-1',
  userId: 'user-1',
  workspaceId: 'ws-1',
  type: 'bid_submitted',
  title: '테스트 알림',
  body: '내용',
  status: 'sent',
  channel: 'inapp',
  createdAt: new Date().toISOString(),
};

const NOTIF_WITH_LINK: Notification = {
  ...NOTIF_UNREAD,
  id: 'notif-2',
  linkUrl: '/inbox/rfp-123',
};

describe('NotificationActivityList', () => {
  beforeEach(() => {
    mockMarkRead.mockReset().mockResolvedValue(undefined);
    mockRouterPush.mockReset();
  });

  it('clicking "읽음 처리" calls markRead from useNotifications', async () => {
    const user = userEvent.setup();
    render(<NotificationActivityList items={[NOTIF_UNREAD]} />);
    await user.click(screen.getByRole('button', { name: '읽음 처리' }));
    expect(mockMarkRead).toHaveBeenCalledWith(NOTIF_UNREAD.id);
  });

  it('clicking a row with a link calls markRead then navigates', async () => {
    const user = userEvent.setup();
    render(<NotificationActivityList items={[NOTIF_WITH_LINK]} />);
    await user.click(screen.getByRole('button', { name: /테스트 알림/ }));
    expect(mockMarkRead).toHaveBeenCalledWith(NOTIF_WITH_LINK.id);
    expect(mockRouterPush).toHaveBeenCalledWith(NOTIF_WITH_LINK.linkUrl);
  });
});
