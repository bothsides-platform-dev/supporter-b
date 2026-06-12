// ChatRail — 상세 화면(구매사 RFP 상세 / PG 인박스 상세) 우측 고정 채팅 레일.
//
// 탭 [상대방 채팅 | 팀 채팅]. 상대는 zustand chat-rail 스토어에서 읽는다
// (구매사: FocusComparison 이 포커스 PG publish / PG: fixedCounterparty 를
// 마운트 시 스토어에 시드). 상대방 탭은 wsId→conversationId 를
// getOrCreateConversationAction 으로 lazy 해소(상대당 1회) 후 ThreadPane
// (variant='rail', defaultRfpId)을 띄운다.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getOrCreateConversationAction = vi.fn();
vi.mock('@/lib/server/actions/chat/getOrCreateConversationAction', () => ({
  getOrCreateConversationAction: (...args: unknown[]) =>
    getOrCreateConversationAction(...args),
}));

// 레일의 표시 해소는 읽기 전용 — 생성은 첫 전송(sendChatMessageAction)만 한다.
const lookupConversationAction = vi.fn();
vi.mock('@/lib/server/actions/chat/lookupConversationAction', () => ({
  lookupConversationAction: (...args: unknown[]) =>
    lookupConversationAction(...args),
}));

const sendChatMessageAction = vi.fn();
vi.mock('@/lib/server/actions/chat/sendChatMessageAction', () => ({
  sendChatMessageAction: (...args: unknown[]) => sendChatMessageAction(...args),
}));

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

// ThreadPane/TeamThreadView 는 자체 테스트가 있으므로 props 계약만 검증한다.
const threadPaneProps = vi.fn();
vi.mock('../ThreadPane', () => ({
  ThreadPane: (props: Record<string, unknown>) => {
    threadPaneProps(props);
    return <div data-testid="thread-pane" />;
  },
}));

const teamThreadViewProps = vi.fn();
vi.mock('../TeamThreadView', () => ({
  TeamThreadView: (props: Record<string, unknown>) => {
    teamThreadViewProps(props);
    return <div data-testid="team-thread-view" />;
  },
}));

// 테스트별로 결과를 갈아끼울 수 있게 mutable ref — 기본은 성공 빈 스레드.
let teamThreadResult: Record<string, unknown> = {
  ok: true,
  rfpId: 'rfp-1',
  workspaceId: 'ws-self',
  viewerUserId: 'u-me',
  messages: [],
};
// 지역 spy — vi.mock 팩토리에서 프록시해 mock.calls 를 테스트에서 직접 접근.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getTeamThreadPromise = vi.fn((_rfpId: string) => Promise.resolve(teamThreadResult));
const invalidateTeamThread = vi.fn();
vi.mock('../team-thread-cache', () => ({
  getTeamThreadPromise: (rfpId: string) => getTeamThreadPromise(rfpId),
  invalidateTeamThread: (...args: unknown[]) => invalidateTeamThread(...args),
}));

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

import { ChatRail } from '../ChatRail';
import { ChatRailToggle } from '../ChatRailToggle';
import { useChatRailStore } from '@/lib/stores/chat-rail';

afterEach(() => cleanup());
beforeEach(() => {
  useChatRailStore.getState().reset();
  getOrCreateConversationAction.mockReset();
  getOrCreateConversationAction.mockResolvedValue({
    ok: true,
    conversationId: 'conv-9',
  });
  lookupConversationAction.mockReset();
  lookupConversationAction.mockResolvedValue({
    ok: true,
    conversationId: 'conv-9',
  });
  sendChatMessageAction.mockReset();
  sendChatMessageAction.mockResolvedValue({
    ok: true,
    conversationId: 'conv-new',
    messageId: 'm-new',
  });
  threadPaneProps.mockReset();
  teamThreadViewProps.mockReset();
  toast.mockReset();
  getTeamThreadPromise.mockReset();
  getTeamThreadPromise.mockImplementation(() => Promise.resolve(teamThreadResult));
  invalidateTeamThread.mockReset();
  teamThreadResult = {
    ok: true,
    rfpId: 'rfp-1',
    workspaceId: 'ws-self',
    viewerUserId: 'u-me',
    messages: [],
  };
});

const baseProps = {
  rfpId: 'rfp-1',
  rfpCode: 'P-2606-0001',
  rfpTitle: '결제 견적 요청',
};

function openWithCounterparty() {
  act(() => {
    useChatRailStore.getState().setOpen(true);
    useChatRailStore
      .getState()
      .setCounterparty({ workspaceId: 'pg-ws-1', name: 'OO페이', type: 'pg' });
  });
}

describe('ChatRail — 프레임', () => {
  it('닫혀 있으면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<ChatRail {...baseProps} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('열리면 [상대방 채팅|팀 채팅] 탭과 닫기 버튼을 렌더한다', () => {
    openWithCounterparty();
    render(<ChatRail {...baseProps} />);

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '상대방 채팅' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '팀 채팅' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '채팅 패널 닫기' })).toBeInTheDocument();
  });

  it('닫기 버튼 클릭 시 레일이 닫힌다', async () => {
    const user = userEvent.setup();
    openWithCounterparty();
    const { container } = render(<ChatRail {...baseProps} />);

    await user.click(screen.getByRole('button', { name: '채팅 패널 닫기' }));
    expect(container).toBeEmptyDOMElement();
    expect(useChatRailStore.getState().open).toBe(false);
  });

  it('unmount 시 스토어를 reset 한다 (다른 상세 페이지로의 상태 누수 방지)', () => {
    openWithCounterparty();
    const { unmount } = render(<ChatRail {...baseProps} />);
    unmount();
    expect(useChatRailStore.getState().open).toBe(false);
    expect(useChatRailStore.getState().counterparty).toBeNull();
  });
});

describe('ChatRail — 상대방 채팅 탭', () => {
  it('상대를 읽기 전용으로 1회 해소하고 ThreadPane(variant=rail, defaultRfpId, rfpById)을 렌더한다', async () => {
    openWithCounterparty();
    render(<ChatRail {...baseProps} />);

    await screen.findByTestId('thread-pane');
    expect(lookupConversationAction).toHaveBeenCalledTimes(1);
    expect(lookupConversationAction).toHaveBeenCalledWith('pg-ws-1');
    // 표시 해소는 절대 대화를 생성하지 않는다 (sealed-bid 신호 누출 방지).
    expect(getOrCreateConversationAction).not.toHaveBeenCalled();
    expect(threadPaneProps).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-9',
        variant: 'rail',
        defaultRfpId: 'rfp-1',
        rfpById: { 'rfp-1': { code: 'P-2606-0001', title: '결제 견적 요청' } },
      }),
    );
  });

  it('대화가 없으면(null) 생성하지 않고 새 대화 컴포저를 보여준다', async () => {
    lookupConversationAction.mockResolvedValue({ ok: true, conversationId: null });
    openWithCounterparty();
    render(<ChatRail {...baseProps} />);

    expect(
      await screen.findByPlaceholderText('메시지를 입력하세요…'),
    ).toBeInTheDocument();
    expect(screen.getByText('메시지를 보내면 대화가 시작돼요')).toBeInTheDocument();
    expect(screen.queryByTestId('thread-pane')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /메시지함에서 열기/ })).not.toBeInTheDocument();
    expect(getOrCreateConversationAction).not.toHaveBeenCalled();
  });

  it('새 대화 컴포저에서 첫 전송 시에만 대화가 생성되고 스레드로 전환된다', async () => {
    const user = userEvent.setup();
    lookupConversationAction.mockResolvedValue({ ok: true, conversationId: null });
    openWithCounterparty();
    render(<ChatRail {...baseProps} />);

    const textarea = await screen.findByPlaceholderText('메시지를 입력하세요…');
    await user.type(textarea, '첫 문의 드립니다');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => {
      expect(sendChatMessageAction).toHaveBeenCalledWith({
        counterpartyWorkspaceId: 'pg-ws-1',
        body: '첫 문의 드립니다',
        rfpId: 'rfp-1',
        attachmentIds: [],
      });
    });
    // 전송 성공 → 생성된 대화의 스레드로 전환.
    await screen.findByTestId('thread-pane');
    expect(threadPaneProps).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-new' }),
    );
  });

  it('첫 전송이 실패하면 토스트를 띄우고 입력을 복원한다', async () => {
    const user = userEvent.setup();
    lookupConversationAction.mockResolvedValue({ ok: true, conversationId: null });
    sendChatMessageAction.mockResolvedValue({ ok: false, error: 'FORBIDDEN' });
    openWithCounterparty();
    render(<ChatRail {...baseProps} />);

    const textarea = await screen.findByPlaceholderText('메시지를 입력하세요…');
    await user.type(textarea, '실패할 문의');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(textarea).toHaveValue('실패할 문의');
    expect(screen.queryByTestId('thread-pane')).not.toBeInTheDocument();
  });

  it('해소된 대화로 가는 "메시지함에서 열기" 링크를 노출한다', async () => {
    openWithCounterparty();
    render(<ChatRail {...baseProps} />);

    const link = await screen.findByRole('link', { name: /메시지함에서 열기/ });
    expect(link).toHaveAttribute('href', '/messages?c=conv-9');
  });

  it('상대가 바뀌면 새 상대로 다시 해소한다 (포커스 PG 추종)', async () => {
    openWithCounterparty();
    render(<ChatRail {...baseProps} />);
    await screen.findByTestId('thread-pane');

    lookupConversationAction.mockResolvedValue({
      ok: true,
      conversationId: 'conv-10',
    });
    act(() => {
      useChatRailStore
        .getState()
        .setCounterparty({ workspaceId: 'pg-ws-2', name: 'XX페이', type: 'pg' });
    });

    await waitFor(() => {
      expect(lookupConversationAction).toHaveBeenCalledWith('pg-ws-2');
    });
  });

  it('상대가 없으면 빈 상태를 보여준다', () => {
    act(() => useChatRailStore.getState().setOpen(true));
    render(<ChatRail {...baseProps} />);
    expect(screen.getByText('대화할 상대를 선택해 주세요')).toBeInTheDocument();
  });

  it('fixedCounterparty 가 주어지면 스토어에 시드되어 그 상대로 해소한다 (PG 측)', async () => {
    act(() => useChatRailStore.getState().setOpen(true));
    render(
      <ChatRail
        {...baseProps}
        fixedCounterparty={{ workspaceId: 'buyer-ws-1', name: '구매사', type: 'buyer' }}
      />,
    );

    await screen.findByTestId('thread-pane');
    expect(lookupConversationAction).toHaveBeenCalledWith('buyer-ws-1');
  });

  it('대화 해소 실패 시 무한 스켈레톤 대신 에러 빈 상태 + 다시 시도를 보여준다', async () => {
    const user = userEvent.setup();
    lookupConversationAction.mockResolvedValue({ ok: false, error: 'FORBIDDEN' });
    openWithCounterparty();
    render(<ChatRail {...baseProps} />);

    expect(
      await screen.findByText('대화를 불러오지 못했어요'),
    ).toBeInTheDocument();

    // 다시 시도 → 이번엔 성공 → 스레드 렌더.
    lookupConversationAction.mockResolvedValue({ ok: true, conversationId: 'conv-9' });
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByTestId('thread-pane');
  });

  it('해소 액션이 throw 해도 에러 빈 상태로 수렴한다 (네트워크 오류)', async () => {
    lookupConversationAction.mockRejectedValue(new Error('network'));
    openWithCounterparty();
    render(<ChatRail {...baseProps} />);

    expect(
      await screen.findByText('대화를 불러오지 못했어요'),
    ).toBeInTheDocument();
  });
});

describe('ChatRail — 팀 채팅 탭', () => {
  it('로더가 실패(ok:false)하면 에러 빈 상태 + 다시 시도를 보여주고, 재시도로 복구한다', async () => {
    const user = userEvent.setup();
    teamThreadResult = { ok: false, error: 'FORBIDDEN' };
    openWithCounterparty();
    render(<ChatRail {...baseProps} />);

    await act(async () => {
      await user.click(screen.getByRole('tab', { name: '팀 채팅' }));
    });

    expect(
      await screen.findByText('팀 채팅을 불러오지 못했어요'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('team-thread-view')).not.toBeInTheDocument();

    // 다시 시도 → 캐시 무효화 + 재로드(이번엔 성공).
    teamThreadResult = {
      ok: true,
      rfpId: 'rfp-1',
      workspaceId: 'ws-self',
      viewerUserId: 'u-me',
      messages: [],
    };
    await act(async () => {
      await user.click(screen.getByRole('button', { name: '다시 시도' }));
    });
    expect(invalidateTeamThread).toHaveBeenCalledWith('rfp-1');
    await screen.findByTestId('team-thread-view');
  });

  it('팀 채팅 탭이 unmount 되면 캐시를 무효화한다 — 재진입 시 항상 신선한 스레드', async () => {
    const user = userEvent.setup();
    openWithCounterparty();
    render(<ChatRail {...baseProps} />);

    await act(async () => {
      await user.click(screen.getByRole('tab', { name: '팀 채팅' }));
    });
    await screen.findByTestId('team-thread-view');
    expect(invalidateTeamThread).not.toHaveBeenCalled();

    // 상대방 채팅 탭으로 전환 → TeamThreadPane unmount → 무효화.
    await user.click(screen.getByRole('tab', { name: '상대방 채팅' }));
    expect(invalidateTeamThread).toHaveBeenCalledWith('rfp-1');
  });

  it('팀 채팅 탭 클릭 시 TeamThreadView 를 로더 결과로 렌더한다', async () => {
    const user = userEvent.setup();
    openWithCounterparty();
    render(<ChatRail {...baseProps} />);

    await act(async () => {
      await user.click(screen.getByRole('tab', { name: '팀 채팅' }));
    });

    await screen.findByTestId('team-thread-view');
    expect(teamThreadViewProps).toHaveBeenCalledWith(
      expect.objectContaining({
        rfpId: 'rfp-1',
        workspaceId: 'ws-self',
        viewerUserId: 'u-me',
        messages: [],
      }),
    );
  });

  it('팀 채팅 활성 중 rfpId 무관한 재렌더 시 getTeamThreadPromise를 재호출하지 않는다 (effect-only 보장)', async () => {
    // use(Promise) 패턴은 렌더마다 getTeamThreadPromise를 호출하지만
    // useEffect 패턴은 의존성(rfpId, retryCount)이 변할 때만 호출한다.
    const user = userEvent.setup();
    openWithCounterparty();
    render(<ChatRail {...baseProps} />);

    await act(async () => {
      await user.click(screen.getByRole('tab', { name: '팀 채팅' }));
    });
    await screen.findByTestId('team-thread-view');

    const callsAfterLoad = getTeamThreadPromise.mock.calls.length;
    expect(callsAfterLoad).toBeGreaterThan(0);

    // counterparty 변경 → ChatRail 재렌더 → TeamThreadPane 재렌더.
    // rfpId는 그대로이므로 getTeamThreadPromise가 재호출되어선 안 된다.
    act(() => {
      useChatRailStore
        .getState()
        .setCounterparty({ workspaceId: 'pg-ws-1', name: 'OO페이 Updated', type: 'pg' });
    });

    await waitFor(() => {
      expect(getTeamThreadPromise.mock.calls.length).toBe(callsAfterLoad);
    });
  });
});

describe('ChatRailToggle', () => {
  beforeEach(() => {
    routerPush.mockReset();
  });

  it('클릭 시 레일을 토글하고 aria-pressed 를 반영한다', async () => {
    const user = userEvent.setup();
    render(<ChatRailToggle />);

    const btn = screen.getByRole('button', { name: '메시지' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');

    await user.click(btn);
    expect(useChatRailStore.getState().open).toBe(true);
    expect(btn).toHaveAttribute('aria-pressed', 'true');

    await user.click(btn);
    expect(useChatRailStore.getState().open).toBe(false);
  });

  it('모바일 폴백 버튼은 상대를 해소해 /messages?c= 로 이동한다 (lg 미만 노출)', async () => {
    const user = userEvent.setup();
    act(() => {
      useChatRailStore
        .getState()
        .setCounterparty({ workspaceId: 'pg-ws-1', name: 'OO페이', type: 'pg' });
    });
    render(<ChatRailToggle />);

    await user.click(screen.getByRole('button', { name: '메시지함에서 보기' }));

    await waitFor(() => {
      expect(getOrCreateConversationAction).toHaveBeenCalledWith('pg-ws-1');
      expect(routerPush).toHaveBeenCalledWith('/messages?c=conv-9');
    });
  });

  it('모바일 폴백 버튼은 상대가 없으면 비활성화된다', () => {
    render(<ChatRailToggle />);
    expect(screen.getByRole('button', { name: '메시지함에서 보기' })).toBeDisabled();
  });

  it('모바일 폴백 해소 실패 시 토스트를 띄우고 버튼이 다시 활성화된다', async () => {
    const user = userEvent.setup();
    getOrCreateConversationAction.mockResolvedValue({ ok: false, error: 'FORBIDDEN' });
    act(() => {
      useChatRailStore
        .getState()
        .setCounterparty({ workspaceId: 'pg-ws-1', name: 'OO페이', type: 'pg' });
    });
    render(<ChatRailToggle />);

    const btn = screen.getByRole('button', { name: '메시지함에서 보기' });
    await user.click(btn);

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(routerPush).not.toHaveBeenCalled();
    expect(btn).toBeEnabled(); // 재시도 가능해야 한다
  });
});
