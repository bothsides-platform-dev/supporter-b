// ChatPanel — 레이아웃 비종속 채팅 패널(탭 + 상대방/팀 페인 + lazy 해소).
// DealRoomProvider 안에서 상대방·탭 상태를 받는다(전역 스토어 대체). 여기서는
// "탭 렌더", "onClose 옵션", "lazy 해소 read-only" 등 ChatPanel 고유 계약을 잠근다.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';

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
      viewerAvatarUpdatedAt: null,
      teamMembers: TEAM_ROSTER,
      messages: [],
    }),
  invalidateTeamThread: vi.fn(),
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

import { ChatPanel } from '../ChatPanel';
import {
  DealRoomProvider,
  useDealRoom,
  type DealRoomCounterparty,
} from '@/components/deal-room/DealRoomContext';

afterEach(() => cleanup());
beforeEach(() => {
  getOrCreateConversationAction.mockReset();
  lookupConversationAction.mockReset();
  lookupConversationAction.mockResolvedValue({ ok: true, conversationId: 'conv-9' });
  threadPaneProps.mockReset();
  teamThreadViewProps.mockReset();
});

const baseProps = { rfpId: 'rfp-1', rfpCode: 'P-2606-0001', rfpTitle: '결제 견적 요청' };
const PG: DealRoomCounterparty = { workspaceId: 'pg-ws-1', name: 'OO페이', type: 'pg', logoUpdatedAt: null };

// 컨텍스트에 상대방을 시드(딜룸 가운데 FocusComparison 이 publish 하는 것과 동일 효과).
function Seed({ counterparty }: { counterparty: DealRoomCounterparty }) {
  const { setCounterparty } = useDealRoom();
  useEffect(() => setCounterparty(counterparty), [counterparty, setCounterparty]);
  return null;
}

function renderPanel(
  props: Partial<typeof baseProps> & {
    onClose?: () => void;
    closedCounterpartyIds?: string[];
  } = {},
  counterparty?: DealRoomCounterparty,
) {
  return render(
    <DealRoomProvider>
      {counterparty ? <Seed counterparty={counterparty} /> : null}
      <ChatPanel {...baseProps} {...props} />
    </DealRoomProvider>,
  );
}

describe('ChatPanel', () => {
  it('탭을 렌더한다 (open-gate 없음)', () => {
    renderPanel();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '상대방 채팅' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '팀 채팅' })).toBeInTheDocument();
  });

  it('onClose 가 있으면 닫기 버튼을 렌더하고 클릭 시 호출한다', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onClose });
    await user.click(screen.getByRole('button', { name: '채팅 패널 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('onClose 가 없으면 닫기 버튼을 렌더하지 않는다 (모달 컨텍스트)', () => {
    renderPanel();
    expect(
      screen.queryByRole('button', { name: '채팅 패널 닫기' }),
    ).not.toBeInTheDocument();
  });

  it('상대를 read-only 로 해소하고 ThreadPane(variant=rail)을 렌더한다 — 생성 안 함', async () => {
    renderPanel({}, PG);
    await screen.findByTestId('thread-pane');
    expect(lookupConversationAction).toHaveBeenCalledWith('pg-ws-1');
    expect(getOrCreateConversationAction).not.toHaveBeenCalled();
    expect(threadPaneProps).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-9', variant: 'rail', defaultRfpId: 'rfp-1' }),
    );
  });

  it('counterpartyFallback에 logoUpdatedAt을 그대로 전달한다 (null 강제 오버라이드 없음)', async () => {
    const PG_WITH_LOGO: DealRoomCounterparty = {
      workspaceId: 'pg-ws-1',
      name: 'OO페이',
      type: 'pg',
      logoUpdatedAt: '2026-01-01T00:00:00.000Z',
    };
    renderPanel({}, PG_WITH_LOGO);
    await screen.findByTestId('thread-pane');
    expect(threadPaneProps).toHaveBeenCalledWith(
      expect.objectContaining({
        counterpartyFallback: expect.objectContaining({ logoUpdatedAt: '2026-01-01T00:00:00.000Z' }),
      }),
    );
  });

  it('포커스 상대가 closedCounterpartyIds 에 있으면 sendDisabledReason="closed"', async () => {
    renderPanel({ closedCounterpartyIds: ['pg-ws-1'] }, PG);
    await screen.findByTestId('thread-pane');
    expect(threadPaneProps).toHaveBeenCalledWith(
      expect.objectContaining({ sendDisabledReason: 'closed' }),
    );
  });

  it('포커스 상대가 닫힘 목록에 없으면(승자) 정상 입력(sendDisabledReason=null)', async () => {
    renderPanel({ closedCounterpartyIds: ['pg-ws-other'] }, PG);
    await screen.findByTestId('thread-pane');
    expect(threadPaneProps).toHaveBeenCalledWith(
      expect.objectContaining({ sendDisabledReason: null }),
    );
  });

  it('팀 탭은 메시지함 딥링크(/messages?t=<rfpId>)를 렌더한다', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('tab', { name: '팀 채팅' }));
    await screen.findByTestId('team-thread-view');
    expect(
      screen.getByRole('link', { name: /메시지함에서 열기/ }),
    ).toHaveAttribute('href', '/messages?t=rfp-1');
  });

  it('팀 탭의 TeamThreadView 에 teamMembers 로스터를 전달한다 (멘션 자동완성/렌더용)', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('tab', { name: '팀 채팅' }));
    await screen.findByTestId('team-thread-view');
    expect(teamThreadViewProps).toHaveBeenCalledWith(
      expect.objectContaining({ teamMembers: TEAM_ROSTER }),
    );
  });
});
