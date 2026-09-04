// /messages 헤더 칩이 "안 읽은 수"라는 것을 배선까지 못박는다.
//
// PageHeader 단위 테스트는 컴포넌트가 `countKind` 를 지킨다는 것만 증명한다.
// 이 페이지가 그 prop 을 실제로 넘기는지는 아무 테스트도 보지 않아서, prop 을
// 지우면 /messages 칩이 조용히 "목록 길이" 문법으로 돌아가고(회색 + 접근 이름
// 소실) 스위트는 초록이었다. /notifications 는 페이지 테스트를 받았는데 여기만
// 없어 비대칭이기도 했다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { unreadCountLabel } from '@/lib/types/notification';

const mockListInbox = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/actions/chat/inboxLoader', () => ({
  listInboxForViewer: mockListInbox,
}));
vi.mock('@/components/messages/MessageInbox', () => ({
  MessageInbox: () => null,
}));

import MessagesPage from '../page';

const item = (id: string, unread: boolean) => ({
  key: `c:${id}`,
  kind: 'conversation' as const,
  conversationId: id,
  unread,
  counterparty: { name: '상대', workspaceId: 'ws-2' },
  lastMessageAt: '2026-09-04T00:00:00.000Z',
  preview: '미리보기',
});

const searchParams = (v: Record<string, string> = {}) => Promise.resolve(v);

describe('MessagesPage 헤더 칩', () => {
  beforeEach(() => {
    mockListInbox.mockReset();
  });

  it('안 읽은 수를 미읽음 톤(primary)으로 보여준다', async () => {
    mockListInbox.mockResolvedValue([item('c-1', true), item('c-2', true), item('c-3', false)]);

    render(await MessagesPage({ searchParams: searchParams() }));

    const pill = screen.getByTestId('page-header-count');
    expect(pill).toHaveTextContent(unreadCountLabel(2));
    expect(pill.className).toMatch(/--md-sys-color-primary\)/);
  });

  // 0 은 "다 읽었다"는 유효한 정보라 감추지 않되, 강조할 것이 없으니 중립톤이다.
  it('다 읽었으면 0 을 중립톤으로 남긴다', async () => {
    mockListInbox.mockResolvedValue([item('c-1', false)]);

    render(await MessagesPage({ searchParams: searchParams() }));

    const pill = screen.getByTestId('page-header-count');
    expect(pill).toHaveTextContent(unreadCountLabel(0));
    expect(pill.className).not.toMatch(/--md-sys-color-primary\)/);
  });
});
