// /notifications 헤더 개수 — 전체가 아니라 "안 읽은" 개수를 센다.
//
// 회귀의 내용: 헤더 칩이 `notifications.length`(전체)를 띄우는 동안, 바로 옆
// 사이드바의 `알림` 배지는 미읽음 개수를 띄웠다. 같은 단어 옆 두 숫자가 다른
// 것을 세고 있어 사용자가 어느 쪽을 믿을지 알 수 없었다.
//
// 판정식은 `lib/types/notification.ts` 의 `isUnread` 단일 출처를 쓴다 —
// `failed` 는 미읽음이 아니다(행 상태 칩이 `실패` 로 따로 말한다).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { Notification } from '@/lib/types/notification';

const mockRequireSession = vi.hoisted(() => vi.fn());
const mockFindRecentForUser = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({ requireSession: mockRequireSession }));
vi.mock('@/lib/server/repositories/factory', () => ({
  getNotificationRepo: async () => ({ findRecentForUser: mockFindRecentForUser }),
}));
vi.mock('@/app/(app)/settings/notifications/MarkAllReadButton', () => ({
  MarkAllReadButton: () => <button type="button">모두 읽음</button>,
}));
vi.mock('@/app/(app)/settings/notifications/NotificationActivityList', () => ({
  NotificationActivityList: () => null,
}));

import NotificationsPage from '../page';

const notif = (id: string, status: Notification['status']): Notification => ({
  id,
  userId: 'u-1',
  workspaceId: 'ws-1',
  type: 'rfp.awarded',
  title: `알림 ${id}`,
  body: '본문',
  channel: 'inapp',
  status,
  createdAt: '2026-09-04T00:00:00.000Z',
});

// 전체 4건 중 미읽음은 sent·pending 둘뿐. failed 와 read 는 세지 않는다.
const FOUR_ITEMS_TWO_UNREAD = [
  notif('n-1', 'sent'),
  notif('n-2', 'pending'),
  notif('n-3', 'failed'),
  notif('n-4', 'read'),
];

describe('NotificationsPage 헤더 개수', () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockFindRecentForUser.mockReset();
    mockRequireSession.mockResolvedValue({
      user: { id: 'u-1', workspaceId: 'ws-1' },
    });
  });

  it('전체 개수가 아니라 안 읽은 개수를 띄운다', async () => {
    mockFindRecentForUser.mockResolvedValue(FOUR_ITEMS_TWO_UNREAD);

    render(await NotificationsPage());

    const pill = screen.getByTestId('page-header-count');
    // 눈에 보이는 숫자가 2 여야 한다(칩에 스크린리더용 텍스트가 붙어도 무관).
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(pill).toHaveTextContent('2');
    // 전체 4건이 새어 나오면 안 된다 — 이게 원래 버그다.
    expect(pill).not.toHaveTextContent('4');
  });

  // 숫자만 바꾸면 절반이다 — 중립 회색 칩은 여전히 "목록 개수" 문법으로 읽힌다.
  // 사이드바 알림 배지와 같은 primary 여야 두 숫자가 같은 것을 센다고 읽힌다.
  it('미읽음이 있으면 사이드바 배지와 같은 primary 로 칠한다', async () => {
    mockFindRecentForUser.mockResolvedValue(FOUR_ITEMS_TWO_UNREAD);

    render(await NotificationsPage());

    const pill = screen.getByTestId('page-header-count');
    expect(pill.className).toMatch(/--md-sys-color-primary\)/);
    expect(pill.className).not.toMatch(/--md-sys-color-(warning|error)\)/);
    expect(pill).toHaveTextContent('미읽음 2건');
  });

  it('전달 실패는 안 읽음으로 세지 않는다', async () => {
    mockFindRecentForUser.mockResolvedValue([
      notif('n-1', 'failed'),
      notif('n-2', 'read'),
    ]);

    render(await NotificationsPage());

    expect(screen.getByTestId('page-header-count')).toHaveTextContent('0');
  });

  it('다 읽었으면 0 을 감추지 않고 그대로 보여준다', async () => {
    mockFindRecentForUser.mockResolvedValue([notif('n-1', 'read')]);

    render(await NotificationsPage());

    // 0 은 "다 읽었다"는 유효한 정보다 — 목록 길이 칩과 달리 숨기지 않는다.
    expect(screen.getByTestId('page-header-count')).toBeInTheDocument();
    expect(screen.getByTestId('page-header-count')).toHaveTextContent('0');
  });
});
