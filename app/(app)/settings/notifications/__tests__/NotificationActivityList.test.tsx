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

  // ⚠️ 이 화면에서 실제로 렌더되는 안 읽음 상태는 `pending` 하나다.
  // 인앱 알림 row 는 pending→read 만 전이한다(notify.ts:99 가 pending 으로 INSERT,
  // notification.ts:121/129 가 read 로 UPDATE — sent/failed 를 쓰는 경로가 없다).
  // 그래서 이 테스트가 하드룰을 실제로 지키는 유일한 테스트다. `sent` 를 쓰는
  // 아래 테스트는 도달 불가능한 분기를 재는 것이라 초록이어도 화면을 보장하지 않는다.
  it('실제로 보이는 안 읽음 칩(pending)이 primary 다 — warning 아님', () => {
    render(<NotificationActivityList items={[{ ...NOTIF_UNREAD, id: 'n-p', status: 'pending' }]} />);
    const chip = screen.getByText('안 읽음').parentElement!;
    expect(chip.className).toMatch(/--md-sys-color-primary-container\)/);
    expect(chip.className).not.toMatch(/--md-sys-color-(warning|error)-container\)/);
    // `대기` 는 DB enum(`queued`) 이름이 샌 것이다. 인앱 알림에는 발송 대기
    // 단계가 없다 — 행이 목록에 있다는 건 이미 도착했다는 뜻이다.
    expect(screen.queryByText('대기')).not.toBeInTheDocument();
  });

  // DESIGN.md §7.3 하드룰: "읽지 않음"은 항상 primary. 이 칩이 error 이던 동안
  // 한 화면에 미읽음 색이 셋이었다 — 사이드바 배지 파랑, 헤더 칩 중립, 이 칩 빨강.
  // error 는 실제 오류(=전달 실패) 전용이다.
  it('미읽음 칩은 primary 다 (error 아님 — 오류가 아니라 안 읽은 것이다)', () => {
    render(<NotificationActivityList items={[NOTIF_UNREAD]} />);
    // Chip 은 라벨을 내부 span 에 넣고 색은 루트에 건다.
    const chip = screen.getByText('안 읽음').parentElement!;
    expect(chip.className).toMatch(/--md-sys-color-primary-container\)/);
    expect(chip.className).not.toMatch(/--md-sys-color-(warning|error)-container\)/);
  });

  // 전달 실패는 진짜 오류라 error 그대로다 — 위 규칙이 여기까지 번지면 안 된다.
  it('전달 실패 칩은 error 로 남는다', () => {
    render(
      <NotificationActivityList
        items={[{ ...NOTIF_UNREAD, id: 'notif-3', status: 'failed' }]}
      />,
    );
    const chip = screen.getByText('실패').parentElement!;
    expect(chip.className).toMatch(/--md-sys-color-error-container\)/);
  });
});
