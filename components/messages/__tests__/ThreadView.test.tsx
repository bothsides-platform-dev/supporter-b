import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, act, fireEvent, within } from '@testing-library/react';
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

// http (ky) is used for the `/api/files/upload` POST. Mock it so the test can
// hold the upload promise open and assert the in-progress (uploading) UI.
const httpPost = vi.fn();
vi.mock('@/lib/http', () => ({
  http: { post: (...args: unknown[]) => httpPost(...args) },
}));

// toast — capture failure feedback calls.
const toast = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

afterEach(() => cleanup());
beforeEach(() => {
  sendChatMessageAction.mockReset();
  sendChatMessageAction.mockResolvedValue({ ok: true, conversationId: 'conv-1', messageId: 'm-new' });
  markConversationReadAction.mockReset();
  markConversationReadAction.mockResolvedValue({ ok: true });
  sendTyping.mockReset();
  httpPost.mockReset();
  toast.mockReset();
  // 초안 보존이 localStorage 를 쓰므로 테스트 간 격리를 위해 매번 비운다.
  window.localStorage.clear();
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

  it('첨부 업로드 중에는 "업로드 중" 스켈레톤 칩을 보여주고 전송을 잠그며, 완료되면 일반 칩으로 바뀐다', async () => {
    const user = userEvent.setup();
    // 업로드 응답을 테스트가 직접 resolve 하도록 promise 를 붙잡는다.
    let resolveUpload: ((v: unknown) => void) | null = null;
    httpPost.mockReturnValue({
      json: () => new Promise((res) => { resolveUpload = res; }),
    });

    const { container } = render(base());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], '제안서.pdf', { type: 'application/pdf' });
    await user.upload(input, file);

    // 업로드 중: 스켈레톤(업로드 중) 칩이 즉시 뜨고, 제거 버튼은 아직 없으며,
    // 전송 버튼은 잠긴다(완료 전 전송으로 첨부가 누락되지 않도록).
    expect(screen.getByLabelText('제안서.pdf 업로드 중')).toBeInTheDocument();
    expect(screen.queryByLabelText('제안서.pdf 첨부 제거')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();

    // 업로드 완료 → 일반 칩(제거 버튼 포함)으로 전환, 스켈레톤 사라짐.
    await act(async () => {
      resolveUpload?.({ id: 'att-1', name: '제안서.pdf', size: 1234, mimeType: 'application/pdf' });
    });
    await waitFor(() => {
      expect(screen.getByLabelText('제안서.pdf 첨부 제거')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('제안서.pdf 업로드 중')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보내기' })).not.toBeDisabled();
  });
});

describe('ThreadView 실패 피드백', () => {
  it('전송 실패 시 에러 토스트를 띄우고 입력을 유지한다', async () => {
    const user = userEvent.setup();
    sendChatMessageAction.mockResolvedValueOnce({ ok: false, error: 'NETWORK' });
    render(base());
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요…');
    await user.type(textarea, '실패할 메시지');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.any(String), { type: 'error' });
    });
    // 실패 시 입력은 보존(다시 보낼 수 있게).
    expect(textarea).toHaveValue('실패할 메시지');
  });

  it('전송 성공 시에는 에러 토스트를 띄우지 않는다', async () => {
    const user = userEvent.setup();
    render(base());
    await user.type(screen.getByPlaceholderText('메시지를 입력하세요…'), '성공 메시지');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await screen.findByText('성공 메시지');
    expect(toast).not.toHaveBeenCalled();
  });

  it('첨부 업로드 실패 시 에러 토스트를 띄운다', async () => {
    const user = userEvent.setup();
    httpPost.mockReturnValue({ json: () => Promise.reject(new Error('upload failed')) });
    const { container } = render(base());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], '실패.pdf', { type: 'application/pdf' });
    await user.upload(input, file);

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.any(String), { type: 'error' });
    });
  });
});

describe('ThreadView 초안 보존', () => {
  beforeEach(() => window.localStorage.clear());

  it('입력한 초안을 conversationId 키로 localStorage 에 저장한다', async () => {
    const user = userEvent.setup();
    render(base());
    await user.type(screen.getByPlaceholderText('메시지를 입력하세요…'), '저장될 초안');
    expect(window.localStorage.getItem('chat-draft:conv-1')).toBe('저장될 초안');
  });

  it('마운트 시 저장된 초안을 textarea 에 복원한다', () => {
    window.localStorage.setItem('chat-draft:conv-1', '복원될 초안');
    render(base());
    expect(screen.getByPlaceholderText('메시지를 입력하세요…')).toHaveValue('복원될 초안');
  });

  it('전송 성공 시 저장된 초안을 제거한다', async () => {
    const user = userEvent.setup();
    render(base());
    await user.type(screen.getByPlaceholderText('메시지를 입력하세요…'), '보낼 초안');
    expect(window.localStorage.getItem('chat-draft:conv-1')).toBe('보낼 초안');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await waitFor(() => {
      expect(window.localStorage.getItem('chat-draft:conv-1')).toBeNull();
    });
  });
});

describe('ThreadView 연속 메시지 그룹핑', () => {
  const other = (id: string, body: string, createdAt: string): ThreadMessage => ({
    id, sender: 'other', body, rfpId: null, createdAt, readByCounterparty: false, attachments: [],
  });
  const self = (id: string, body: string, createdAt: string): ThreadMessage => ({
    id, sender: 'self', body, rfpId: null, createdAt, readByCounterparty: false, attachments: [],
  });

  it('같은 상대가 5분 내 연속으로 보낸 메시지는 두 번째부터 이름·아바타 헤더를 생략한다', () => {
    render(base({ messages: [
      other('g1', '첫 번째', '2026-05-26T05:00:00.000Z'),
      other('g2', '두 번째', '2026-05-26T05:02:00.000Z'),
    ] }));
    const first = screen.getByText('첫 번째').closest('[data-message-row]') as HTMLElement;
    const second = screen.getByText('두 번째').closest('[data-message-row]') as HTMLElement;
    expect(within(first).getByText('OO페이')).toBeInTheDocument();
    expect(within(second).queryByText('OO페이')).not.toBeInTheDocument();
  });

  it('sender 가 바뀌면 헤더를 다시 표시한다', () => {
    render(base({ messages: [
      other('s1', '상대 첫 메시지', '2026-05-26T05:00:00.000Z'),
      self('s2', '내 답장', '2026-05-26T05:01:00.000Z'),
      other('s3', '상대 재개', '2026-05-26T05:02:00.000Z'),
    ] }));
    const third = screen.getByText('상대 재개').closest('[data-message-row]') as HTMLElement;
    expect(within(third).getByText('OO페이')).toBeInTheDocument();
  });

  it('같은 상대라도 5분을 넘기면 헤더를 다시 표시한다', () => {
    render(base({ messages: [
      other('t1', '이전 메시지', '2026-05-26T05:00:00.000Z'),
      other('t2', '한참 뒤 메시지', '2026-05-26T05:10:00.000Z'),
    ] }));
    const second = screen.getByText('한참 뒤 메시지').closest('[data-message-row]') as HTMLElement;
    expect(within(second).getByText('OO페이')).toBeInTheDocument();
  });

  it('날짜가 바뀌면(구분선) 같은 상대라도 헤더를 다시 표시한다', () => {
    render(base({ messages: [
      other('d1', '어제 메시지', '2026-05-26T05:00:00.000Z'),
      other('d2', '오늘 메시지', '2026-05-27T05:00:00.000Z'),
    ] }));
    const second = screen.getByText('오늘 메시지').closest('[data-message-row]') as HTMLElement;
    expect(within(second).getByText('OO페이')).toBeInTheDocument();
  });
});

describe('ThreadView 빈 스레드', () => {
  it('메시지가 없으면 첫 메시지를 유도하는 안내를 표시한다', () => {
    render(base({ messages: [] }));
    expect(screen.getByText('아직 주고받은 메시지가 없어요')).toBeInTheDocument();
  });

  it('메시지가 있으면 빈 스레드 안내를 표시하지 않는다', () => {
    render(base());
    expect(screen.queryByText('아직 주고받은 메시지가 없어요')).not.toBeInTheDocument();
  });
});

describe('ThreadView 전송 중 상태', () => {
  it('전송 중에는 "전송 중" 표식을 보이고, 성공하면 일반 상태로 바뀐다', async () => {
    const user = userEvent.setup();
    let resolveSend!: (v: unknown) => void;
    sendChatMessageAction.mockReturnValue(new Promise((res) => { resolveSend = res; }));
    render(base());
    await user.type(screen.getByPlaceholderText('메시지를 입력하세요…'), '전송 중 메시지');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    // 전송 중: 낙관적 말풍선이 "전송 중" 표식과 함께 즉시 보이고 입력은 비워진다.
    expect(await screen.findByText('전송 중 메시지')).toBeInTheDocument();
    expect(screen.getByLabelText('전송 중')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('메시지를 입력하세요…')).toHaveValue('');

    await act(async () => {
      resolveSend({ ok: true, conversationId: 'conv-1', messageId: 'm-new' });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('전송 중')).not.toBeInTheDocument();
    });
    expect(screen.getByText('전송 중 메시지')).toBeInTheDocument();
  });

  it('본인 메시지의 라이브 echo 가 도착해도 중복 말풍선을 만들지 않는다', async () => {
    const user = userEvent.setup();
    let resolveSend!: (v: unknown) => void;
    sendChatMessageAction.mockReturnValue(new Promise((res) => { resolveSend = res; }));
    render(base());
    await user.type(screen.getByPlaceholderText('메시지를 입력하세요…'), '내 메시지 echo');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    expect(screen.getAllByText('내 메시지 echo')).toHaveLength(1);

    // await 해소 전에 본인 작성(authorWsId ≠ 상대)인 echo 가 실제 id 로 도착.
    act(() => channelOptions.onMessage?.({
      type: 'message',
      id: 'm-echo-real',
      body: '내 메시지 echo',
      authorWsId: 'buyer-self',
      rfpId: null,
      createdAt: '2026-05-27T06:00:00.000Z',
    }));
    expect(screen.getAllByText('내 메시지 echo')).toHaveLength(1);

    await act(async () => {
      resolveSend({ ok: true, conversationId: 'conv-1', messageId: 'm-echo-real' });
    });
    expect(screen.getAllByText('내 메시지 echo')).toHaveLength(1);
  });

  it('전송 실패 시 낙관적 말풍선을 제거하고 입력을 복원한다', async () => {
    const user = userEvent.setup();
    let resolveSend!: (v: unknown) => void;
    sendChatMessageAction.mockReturnValue(new Promise((res) => { resolveSend = res; }));
    render(base());
    await user.type(screen.getByPlaceholderText('메시지를 입력하세요…'), '실패 복원 메시지');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    // 전송 중: 낙관적 말풍선이 목록에 보인다.
    const bubble = await screen.findByText('실패 복원 메시지');
    expect(bubble.closest('[data-message-row]')).not.toBeNull();

    // 실패로 종료 → 말풍선 제거 + 입력 복원.
    await act(async () => {
      resolveSend({ ok: false, error: 'NETWORK' });
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText('메시지를 입력하세요…')).toHaveValue('실패 복원 메시지');
    });
    const inBubble = screen
      .queryAllByText('실패 복원 메시지')
      .filter((el) => el.closest('[data-message-row]'));
    expect(inBubble).toHaveLength(0);
  });
});

describe('ThreadView 자동 스크롤', () => {
  // jsdom 은 레이아웃을 계산하지 않으므로 컨테이너의 scroll 메트릭을 직접 정의해
  // "하단 근처" 판정을 통제한다.
  function setScrolledUp(list: HTMLElement) {
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 300 });
    list.scrollTop = 0; // diff = 1000 - 0 - 300 = 700 > 임계값 → 하단 아님
  }

  const liveMsg = (id: string, body: string) => ({
    type: 'message',
    id,
    body,
    authorWsId: 'pg-1', // counterparty → 'other'
    rfpId: null,
    createdAt: '2026-05-27T06:00:00.000Z',
  });

  it('마운트 시 최신 메시지로 스크롤한다', () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    render(base());
    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it('하단에 있을 때 새 메시지를 받으면 최신으로 스크롤한다', async () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    render(base());
    scrollSpy.mockClear(); // 마운트 스크롤은 제외
    act(() => channelOptions.onMessage?.(liveMsg('live-bottom', '하단 새 메시지')));
    await screen.findByText('하단 새 메시지');
    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it('위로 스크롤한 상태에서 새 메시지가 오면 자동 스크롤하지 않고 "새 메시지" 버튼을 표시한다', async () => {
    const { container } = render(base());
    const list = container.querySelector('[data-message-list]') as HTMLElement;
    setScrolledUp(list);
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    act(() => channelOptions.onMessage?.(liveMsg('live-up', '안 보이는 새 메시지')));
    expect(await screen.findByRole('button', { name: /새 메시지/ })).toBeInTheDocument();
    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it('"새 메시지" 버튼을 누르면 최신으로 스크롤하고 버튼을 숨긴다', async () => {
    const user = userEvent.setup();
    const { container } = render(base());
    const list = container.querySelector('[data-message-list]') as HTMLElement;
    setScrolledUp(list);
    act(() => channelOptions.onMessage?.(liveMsg('live-pill', 'pill 트리거')));
    const pill = await screen.findByRole('button', { name: /새 메시지/ });
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    await user.click(pill);
    expect(scrollSpy).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /새 메시지/ })).not.toBeInTheDocument();
    scrollSpy.mockRestore();
  });

  it('위로 올려둔 상태여도 본인이 메시지를 보내면 최신으로 스크롤한다', async () => {
    const user = userEvent.setup();
    const { container } = render(base());
    const list = container.querySelector('[data-message-list]') as HTMLElement;
    setScrolledUp(list);
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
    await user.type(screen.getByPlaceholderText('메시지를 입력하세요…'), '내가 보낸 메시지');
    await user.click(screen.getByRole('button', { name: '보내기' }));
    await screen.findByText('내가 보낸 메시지');
    expect(scrollSpy).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /새 메시지/ })).not.toBeInTheDocument();
    scrollSpy.mockRestore();
  });

  it('"새 메시지" 표시 중 사용자가 하단으로 스크롤하면 버튼이 사라진다', async () => {
    const { container } = render(base());
    const list = container.querySelector('[data-message-list]') as HTMLElement;
    setScrolledUp(list);
    act(() => channelOptions.onMessage?.(liveMsg('live-scroll', '스크롤 복귀 테스트')));
    await screen.findByRole('button', { name: /새 메시지/ });
    list.scrollTop = 700; // diff = 1000 - 700 - 300 = 0 → 하단 근처
    fireEvent.scroll(list);
    expect(screen.queryByRole('button', { name: /새 메시지/ })).not.toBeInTheDocument();
  });
});
