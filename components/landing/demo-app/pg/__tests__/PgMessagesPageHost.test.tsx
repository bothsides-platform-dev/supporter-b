import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/messages',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
// 대화 스레드 로더는 서버 액션 — 데모는 캐시 시딩으로 대체하므로 호출되면 안 된다.
const loadThread = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/actions/chat/conversationLoaders', () => ({
  loadConversationThread: loadThread,
}));
const markRead = vi.hoisted(() => vi.fn(async () => ({ ok: true, readAt: '' })));
vi.mock('@/lib/server/actions/chat/markConversationReadAction', () => ({
  markConversationReadAction: markRead,
}));
vi.mock('@/lib/server/actions/chat/sendChatMessageAction', () => ({
  sendChatMessageAction: vi.fn(),
}));

import { PgMessagesPageHost } from '../PgMessagesPageHost';

// jsdom 에는 scrollIntoView 가 없다 — 실제 스레드 뷰의 stick-to-bottom 이 쓴다.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

// 데모 메시지 화면은 실제 /messages 와 같은 구성을 써야 한다:
// PageHeader(미읽음 칩) + MessageInbox(검색 · 전체/상대방/팀 필터 · 스레드 페인).
// 손으로 만든 정적 마크업은 실제 화면과 가장 멀어진 지점이었다.
describe('PgMessagesPageHost — 실제 메시지 화면 정렬', () => {
  it('PageHeader(미읽음 칩)와 실제 MessageInbox 를 렌더한다', () => {
    render(<PgMessagesPageHost />);
    expect(screen.getByRole('heading', { name: '메시지' })).toBeInTheDocument();
    expect(screen.getByTestId('page-header-count')).toHaveTextContent('1');
    expect(screen.getByRole('searchbox', { name: '대화 검색' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '상대방' })).toBeInTheDocument();
  });

  it('대화가 열린 상태로 시작하고 고정 메시지를 보여준다 (서버 호출 없음)', async () => {
    render(<PgMessagesPageHost />);
    await waitFor(() =>
      expect(screen.getByText(/정산주기 D\+2도 가능할까요/)).toBeInTheDocument(),
    );
    expect(loadThread).not.toHaveBeenCalled();
    // 비로그인이라 읽음 기록 서버 액션도 나가지 않는다.
    expect(markRead).not.toHaveBeenCalled();
  });

  it('비로그인 데모라 입력창은 잠기고 가입 안내를 보여준다', async () => {
    render(<PgMessagesPageHost />);
    await waitFor(() => expect(screen.getByRole('textbox')).toBeDisabled());
    expect(screen.getByText(/가입하면/)).toBeInTheDocument();
  });
});
