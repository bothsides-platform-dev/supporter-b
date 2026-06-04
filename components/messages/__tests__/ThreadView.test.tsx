import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseChatChannelResult } from '@/lib/hooks/useChatChannel';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// sendChatMessageAction is a 'use server' action — it imports centrifugo/db
// (server-only) and would break jsdom. Mock it so the composer can call it.
const sendChatMessageAction = vi.fn();
vi.mock('@/lib/server/actions/chat/sendChatMessageAction', () => ({
  sendChatMessageAction: (...args: unknown[]) => sendChatMessageAction(...args),
}));

// listConversationAttachments is a 'use server' action used by AttachmentGalleryPanel.
vi.mock('@/lib/server/actions/chat/listConversationAttachments', () => ({
  listConversationAttachments: vi.fn().mockResolvedValue([]),
}));

// markConversationReadAction is likewise a server action (jsdom-unsafe) — mock
// it for EVERY test, and capture calls for the mark-read-on-open assertion.
const markConversationReadAction = vi.fn();
vi.mock('@/lib/server/actions/chat/markConversationReadAction', () => ({
  markConversationReadAction: (...args: unknown[]) => markConversationReadAction(...args),
}));

// useChatChannel pulls in the real `centrifuge` SDK — mock it so jsdom stays
// clean, and so we can control online/typing and capture the onMessage/onRead
// callbacks the component registers.
type ChatPayload = { type?: string; userId?: string; [k: string]: unknown };
let channelOptions: { onMessage?: (d: ChatPayload) => void; onRead?: (d: ChatPayload) => void } = {};
const sendTyping = vi.fn();
let channelResult: UseChatChannelResult = { online: false, typingUserIds: [], sendTyping, connected: null };
vi.mock('@/lib/hooks/useChatChannel', () => ({
  useChatChannel: (_conversationId: string, opts: typeof channelOptions): UseChatChannelResult => {
    channelOptions = opts;
    return channelResult;
  },
}));

afterEach(() => cleanup());
beforeEach(() => {
  sendChatMessageAction.mockReset();
  sendChatMessageAction.mockResolvedValue({ ok: true, conversationId: 'conv-1', messageId: 'm-new' });
  markConversationReadAction.mockReset();
  markConversationReadAction.mockResolvedValue({ ok: true });
  sendTyping.mockReset();
  channelOptions = {};
  channelResult = { online: false, typingUserIds: [], sendTyping, connected: null };
});

import { ThreadView } from '../ThreadView';
import type { ThreadMessage } from '../types';

const counterparty = { workspaceId: 'pg-1', name: 'OO페이', type: 'pg' as const };

// Timestamps in the T03:00Z–T14:00Z window so UTC and KST agree on the
// calendar day (avoids a TZ-dependent date-divider flake).
const messages: ThreadMessage[] = [
  {
    id: 'm1',
    sender: 'other',
    body: '안녕하세요, 제안 드립니다.',
    rfpId: null,
    createdAt: '2026-05-26T05:00:00.000Z',
    readByCounterparty: false,
    attachments: [],
  },
  {
    id: 'm2',
    sender: 'self',
    body: '확인했습니다. 감사합니다.',
    rfpId: null,
    createdAt: '2026-05-27T05:00:00.000Z',
    readByCounterparty: false,
    attachments: [],
  },
];

function base(overrides: Partial<React.ComponentProps<typeof ThreadView>> = {}) {
  return (
    <ThreadView
      conversationId="conv-1"
      counterparty={counterparty}
      messages={messages}
      {...overrides}
    />
  );
}

describe('ThreadView', () => {
  it('받은 메시지는 좌측, 보낸 메시지는 우측으로 정렬한다', () => {
    render(base());

    const received = screen.getByText('안녕하세요, 제안 드립니다.').closest('[data-message-row]');
    const sent = screen.getByText('확인했습니다. 감사합니다.').closest('[data-message-row]');

    expect(received).toHaveAttribute('data-sender', 'other');
    expect(sent).toHaveAttribute('data-sender', 'self');
  });

  it('마운트 시 markConversationReadAction 을 conversationId 로 1회 호출한다(읽음 처리)', async () => {
    render(base());
    await waitFor(() => {
      expect(markConversationReadAction).toHaveBeenCalledWith({ conversationId: 'conv-1' });
    });
    expect(markConversationReadAction).toHaveBeenCalledTimes(1);
  });

  it('마지막 보낸 메시지의 readByCounterparty 가 true 면 하단에 "읽음" 영수증을 표시한다', () => {
    const read: ThreadMessage[] = [
      messages[0],
      { ...messages[1], readByCounterparty: true },
    ];
    render(base({ messages: read }));
    expect(screen.getByText('읽음')).toBeInTheDocument();
  });

  it('읽음 영수증은 readByCounterparty 가 모두 false 면 표시하지 않는다', () => {
    render(base());
    expect(screen.queryByText('읽음')).not.toBeInTheDocument();
  });

  it('부분 읽음: 앞선 보낸 메시지만 read 면 그 메시지에 "읽음"을 붙인다(마지막 보낸 메시지는 미읽음)', () => {
    // 상대가 A를 읽은 뒤 내가 B를 더 보낸 케이스 — 로더가 메시지별로 계산한다.
    const partial: ThreadMessage[] = [
      {
        id: 'a',
        sender: 'self',
        body: '먼저 보낸 메시지 A',
        rfpId: null,
        createdAt: '2026-05-27T05:00:00.000Z',
        readByCounterparty: true,
        attachments: [],
      },
      {
        id: 'b',
        sender: 'self',
        body: '나중에 보낸 메시지 B',
        rfpId: null,
        createdAt: '2026-05-27T06:00:00.000Z',
        readByCounterparty: false,
        attachments: [],
      },
    ];
    render(base({ messages: partial }));
    // "읽음"은 한 번, 그리고 A의 말풍선 행에 붙어야 한다(B에는 없음).
    const receipt = screen.getByText('읽음');
    const row = receipt.closest('[data-message-row]');
    expect(row).toContainElement(screen.getByText('먼저 보낸 메시지 A'));
    expect(row).not.toContainElement(screen.getByText('나중에 보낸 메시지 B'));
  });

  it('라이브 read 이벤트(onRead)를 받으면 마지막 보낸 메시지에 "읽음"을 갱신한다', async () => {
    render(base());
    expect(screen.queryByText('읽음')).not.toBeInTheDocument();

    act(() => {
      channelOptions.onRead?.({ type: 'read', userId: 'pg-user-1' });
    });

    expect(await screen.findByText('읽음')).toBeInTheDocument();
  });

  it('onRead 페이로드의 readAt(ISO) 이 있으면 Date.now() 대신 서버 시간을 워터마크로 사용한다', async () => {
    render(base());
    expect(screen.queryByText('읽음')).not.toBeInTheDocument();

    act(() => {
      // 2026-05-26T04:00:00Z = m2 createdAt(2026-05-27T05:00:00Z) 보다 이전
      channelOptions.onRead?.({ type: 'read', userId: 'pg-1', readAt: '2026-05-26T04:00:00.000Z' });
    });

    // readAt < m2.createdAt이므로 읽음 미표시
    expect(screen.queryByText('읽음')).not.toBeInTheDocument();
  });

  it('onRead readAt 이 m2 이후 시각이면 "읽음" 표시', async () => {
    render(base());

    act(() => {
      channelOptions.onRead?.({ type: 'read', userId: 'pg-1', readAt: '2026-05-28T05:00:00.000Z' });
    });

    expect(await screen.findByText('읽음')).toBeInTheDocument();
  });

  it('useChatChannel.online 이 true 면 프레즌스 점을 렌더한다', () => {
    channelResult = { online: true, typingUserIds: [], sendTyping, connected: null };
    render(base());
    expect(screen.getByLabelText('온라인')).toBeInTheDocument();
  });

  it('online 이 false 면 프레즌스 점을 렌더하지 않는다', () => {
    render(base());
    expect(screen.queryByLabelText('온라인')).not.toBeInTheDocument();
  });

  it('typingUserIds 가 있으면 "입력 중…" 인디케이터를 렌더한다', () => {
    channelResult = { online: false, typingUserIds: ['pg-user-1'], sendTyping, connected: null };
    render(base());
    expect(screen.getByText('입력 중…')).toBeInTheDocument();
  });

  it('typingUserIds 가 비어 있으면 "입력 중…"을 렌더하지 않는다', () => {
    render(base());
    expect(screen.queryByText('입력 중…')).not.toBeInTheDocument();
  });

  it('onMessage 콜백으로 새 메시지를 받으면 목록에 append 한다(상대 메시지)', async () => {
    render(base());
    expect(screen.queryByText('실시간 새 메시지')).not.toBeInTheDocument();

    act(() => {
      channelOptions.onMessage?.({
        type: 'message',
        id: 'live-1',
        body: '실시간 새 메시지',
        authorWsId: 'pg-1', // counterparty → 'other'
        rfpId: null,
        createdAt: '2026-05-27T06:00:00.000Z',
      });
    });

    const appended = await screen.findByText('실시간 새 메시지');
    expect(appended.closest('[data-message-row]')).toHaveAttribute('data-sender', 'other');
  });

  it('onMessage 로 같은 id 메시지가 다시 와도 중복 append 하지 않는다', async () => {
    render(base());
    const evt = {
      type: 'message',
      id: 'live-dup',
      body: '중복 방지 대상',
      authorWsId: 'pg-1',
      rfpId: null,
      createdAt: '2026-05-27T06:00:00.000Z',
    };
    act(() => channelOptions.onMessage?.(evt));
    await screen.findByText('중복 방지 대상');
    act(() => channelOptions.onMessage?.(evt));
    expect(screen.getAllByText('중복 방지 대상')).toHaveLength(1);
  });

  it('서로 다른 날짜 사이에 날짜 구분선을 표시한다', () => {
    render(base());
    const dividers = screen.getAllByRole('separator');
    expect(dividers.length).toBe(2);
    expect(screen.getByText(/5월 26일/)).toBeInTheDocument();
    expect(screen.getByText(/5월 27일/)).toBeInTheDocument();
  });

  it('메시지에 rfpId 가 있고 컨텍스트가 주어지면 RFP 코드 칩을 표시한다(uuid 원문은 표시 안 함)', () => {
    const withRfp: ThreadMessage[] = [
      {
        id: 'm3',
        sender: 'other',
        body: '입찰표 보냅니다.',
        rfpId: 'rfp-uuid-123',
        createdAt: '2026-05-26T05:00:00.000Z',
        readByCounterparty: false,
        attachments: [],
      },
    ];
    render(
      base({
        messages: withRfp,
        rfpById: { 'rfp-uuid-123': { code: 'P-2605-0042', title: '결제대행 선정' } },
      }),
    );
    expect(screen.getByText(/P-2605-0042/)).toBeInTheDocument();
    expect(screen.queryByText(/rfp-uuid-123/)).not.toBeInTheDocument();
  });

  it('본문의 URL 을 링크로 자동 변환한다(여러 개 모두)', () => {
    render(
      base({
        messages: [
          {
            id: 'm4',
            sender: 'other',
            body: '여기 https://example.com/rfp 와 https://example.com/bid 보세요',
            rfpId: null,
            createdAt: '2026-05-26T05:00:00.000Z',
            readByCounterparty: false,
            attachments: [],
          },
        ],
      }),
    );
    const first = screen.getByRole('link', { name: 'https://example.com/rfp' });
    const second = screen.getByRole('link', { name: 'https://example.com/bid' });
    expect(first).toHaveAttribute('href', 'https://example.com/rfp');
    expect(first).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(second).toHaveAttribute('href', 'https://example.com/bid');
  });

  it('보내기를 누르면 conversationId 와 본문으로 sendChatMessageAction 을 호출하고 입력을 비운다', async () => {
    const user = userEvent.setup();
    render(base());

    const textarea = screen.getByPlaceholderText('메시지를 입력하세요…');
    await user.type(textarea, '새 메시지');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => {
      expect(sendChatMessageAction).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        body: '새 메시지',
        attachmentIds: [],
      });
    });
    expect(textarea).toHaveValue('');
  });

  it('전송 성공 시 보낸 메시지를 낙관적으로 목록에 추가한다(no-op 환경에서도 즉시 보임)', async () => {
    const user = userEvent.setup();
    render(base());
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요…');
    await user.type(textarea, '낙관적 추가 메시지');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    const sent = await screen.findByText('낙관적 추가 메시지');
    expect(sent.closest('[data-message-row]')).toHaveAttribute('data-sender', 'self');
  });

  it('컴포저 입력 시 sendTyping 을 호출한다', async () => {
    const user = userEvent.setup();
    render(base());
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요…');
    await user.type(textarea, 'a');
    expect(sendTyping).toHaveBeenCalled();
  });

  it('빈 본문이면 전송하지 않는다', async () => {
    const user = userEvent.setup();
    render(base());
    await user.click(screen.getByRole('button', { name: '보내기' }));
    expect(sendChatMessageAction).not.toHaveBeenCalled();
  });

  it('Shift+Enter 는 줄바꿈, Enter 는 전송', async () => {
    const user = userEvent.setup();
    render(base());
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요…');

    await user.type(textarea, '첫줄{Shift>}{Enter}{/Shift}둘째줄');
    expect(textarea).toHaveValue('첫줄\n둘째줄');
    expect(sendChatMessageAction).not.toHaveBeenCalled();

    await user.type(textarea, '{Enter}');
    await waitFor(() => {
      expect(sendChatMessageAction).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        body: '첫줄\n둘째줄',
        attachmentIds: [],
      });
    });
  });

  it('disabled 클립/ComingSoon 잔재가 없다(첨부 버튼은 활성)', () => {
    render(base());
    const clip = screen.getByRole('button', { name: '파일 첨부' });
    expect(clip).not.toBeDisabled();
  });

  it('connected 가 false 면 "재연결 중" 배너를 렌더한다', () => {
    channelResult = { online: false, typingUserIds: [], sendTyping, connected: false };
    render(base());
    expect(screen.getByRole('status')).toHaveTextContent('재연결 중');
  });

  it('connected 가 null 이면 배너를 렌더하지 않는다', () => {
    channelResult = { online: false, typingUserIds: [], sendTyping, connected: null };
    render(base());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('connected 가 true 면 배너를 렌더하지 않는다', () => {
    channelResult = { online: false, typingUserIds: [], sendTyping, connected: true };
    render(base());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
