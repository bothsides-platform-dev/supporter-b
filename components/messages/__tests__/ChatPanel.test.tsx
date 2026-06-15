// ChatPanel — 레이아웃 비종속 채팅 패널(탭 + 상대방/팀 페인 + lazy 해소).
// ChatRail(sticky aside, open-gate, fixedCounterparty 시드, reset)이 감싸 쓰고,
// 딜룸 모달은 ChatPanel 을 우측 칼럼에 직접 마운트한다(open-gate 없음).
// 여기서는 "open 게이트 없이 렌더", "onClose 옵션", "lazy 해소 read-only" 등
// ChatRail 래퍼와 구분되는 ChatPanel 고유 계약을 잠근다. 전체 행동(팀 탭·재시도
// 등)은 ChatRail.test 가 래퍼를 통해 계속 커버한다.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getOrCreateConversationAction = vi.fn();
vi.mock('@/lib/server/actions/chat/getOrCreateConversationAction', () => ({
  getOrCreateConversationAction: (...args: unknown[]) =>
    getOrCreateConversationAction(...args),
}));
const lookupConversationAction = vi.fn();
vi.mock('@/lib/server/actions/chat/lookupConversationAction', () => ({
  lookupConversationAction: (...args: unknown[]) =>
    lookupConversationAction(...args),
}));
const sendChatMessageAction = vi.fn();
vi.mock('@/lib/server/actions/chat/sendChatMessageAction', () => ({
  sendChatMessageAction: (...args: unknown[]) => sendChatMessageAction(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

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
const TEAM_ROSTER = [{ userId: 'u-mate', name: '이동료', joinedAt: '2026-03-14T00:00:00.000Z' }];
vi.mock('../team-thread-cache', () => ({
  getTeamThreadPromise: () =>
    Promise.resolve({
      ok: true,
      rfpId: 'rfp-1',
      workspaceId: 'ws-self',
      viewerUserId: 'u-me',
      teamMembers: TEAM_ROSTER,
      messages: [],
    }),
  invalidateTeamThread: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

import { ChatPanel } from '../ChatPanel';
import { useChatRailStore } from '@/lib/stores/chat-rail';

afterEach(() => cleanup());
beforeEach(() => {
  useChatRailStore.getState().reset();
  getOrCreateConversationAction.mockReset();
  lookupConversationAction.mockReset();
  lookupConversationAction.mockResolvedValue({ ok: true, conversationId: 'conv-9' });
  threadPaneProps.mockReset();
  teamThreadViewProps.mockReset();
});

const baseProps = { rfpId: 'rfp-1', rfpCode: 'P-2606-0001', rfpTitle: '결제 견적 요청' };

function setCounterparty() {
  act(() => {
    useChatRailStore
      .getState()
      .setCounterparty({ workspaceId: 'pg-ws-1', name: 'OO페이', type: 'pg' });
  });
}

describe('ChatPanel', () => {
  it('store.open 없이도 탭을 렌더한다 (open-gate 없음)', () => {
    // ChatRail 과 달리 open 을 켜지 않아도 마운트되면 바로 보인다.
    render(<ChatPanel {...baseProps} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '상대방 채팅' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '팀 채팅' })).toBeInTheDocument();
  });

  it('onClose 가 있으면 닫기 버튼을 렌더하고 클릭 시 호출한다', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ChatPanel {...baseProps} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: '채팅 패널 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('onClose 가 없으면 닫기 버튼을 렌더하지 않는다 (모달 컨텍스트)', () => {
    render(<ChatPanel {...baseProps} />);
    expect(
      screen.queryByRole('button', { name: '채팅 패널 닫기' }),
    ).not.toBeInTheDocument();
  });

  it('상대를 read-only 로 해소하고 ThreadPane(variant=rail)을 렌더한다 — 생성 안 함', async () => {
    setCounterparty();
    render(<ChatPanel {...baseProps} />);
    await screen.findByTestId('thread-pane');
    expect(lookupConversationAction).toHaveBeenCalledWith('pg-ws-1');
    expect(getOrCreateConversationAction).not.toHaveBeenCalled();
    expect(threadPaneProps).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-9', variant: 'rail', defaultRfpId: 'rfp-1' }),
    );
  });

  it('isSample 면 ThreadPane 에 sendDisabled=true 를 넘긴다', async () => {
    setCounterparty();
    render(<ChatPanel {...baseProps} isSample />);
    await screen.findByTestId('thread-pane');
    expect(threadPaneProps).toHaveBeenCalledWith(
      expect.objectContaining({ sendDisabled: true }),
    );
  });

  it('팀 탭은 메시지함 딥링크(/messages?t=<rfpId>)를 렌더한다', async () => {
    const user = userEvent.setup();
    render(<ChatPanel {...baseProps} />);
    await user.click(screen.getByRole('tab', { name: '팀 채팅' }));
    await screen.findByTestId('team-thread-view');
    expect(
      screen.getByRole('link', { name: /메시지함에서 열기/ }),
    ).toHaveAttribute('href', '/messages?t=rfp-1');
  });

  it('팀 탭의 TeamThreadView 에 teamMembers 로스터를 전달한다 (멘션 자동완성/렌더용)', async () => {
    // 딜룸 ChatPanel 도 통합 인박스와 동일하게 멘션이 동작해야 한다 —
    // teamMembers 가 빠지면 @ 드롭다운이 죽고 기존 멘션이 '@(알 수 없음)'으로 렌더된다.
    const user = userEvent.setup();
    render(<ChatPanel {...baseProps} />);
    await user.click(screen.getByRole('tab', { name: '팀 채팅' }));
    await screen.findByTestId('team-thread-view');
    expect(teamThreadViewProps).toHaveBeenCalledWith(
      expect.objectContaining({ teamMembers: TEAM_ROSTER }),
    );
  });
});
