import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

afterEach(() => cleanup());
beforeEach(() => {
  sendChatMessageAction.mockReset();
  sendChatMessageAction.mockResolvedValue({ ok: true, conversationId: 'conv-1', messageId: 'm-new' });
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
  },
  {
    id: 'm2',
    sender: 'self',
    body: '확인했습니다. 감사합니다.',
    rfpId: null,
    createdAt: '2026-05-27T05:00:00.000Z',
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

  it('readByCounterparty 가 true 면 마지막 보낸 메시지 하단에 "읽음" 영수증을 표시한다', () => {
    const { rerender } = render(base({ readByCounterparty: false }));
    expect(screen.queryByText('읽음')).not.toBeInTheDocument();

    rerender(base({ readByCounterparty: true }));
    expect(screen.getByText('읽음')).toBeInTheDocument();
  });

  it('서로 다른 날짜 사이에 날짜 구분선을 표시한다', () => {
    render(base());
    // 5월 26일, 5월 27일 두 개의 구분선.
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

  it('online 이면 프레즌스 점, typing 이면 "입력 중…" 인디케이터를 렌더한다', () => {
    const { rerender } = render(base({ online: false, typing: false }));
    expect(screen.queryByLabelText('온라인')).not.toBeInTheDocument();
    expect(screen.queryByText('입력 중…')).not.toBeInTheDocument();

    rerender(base({ online: true, typing: true }));
    expect(screen.getByLabelText('온라인')).toBeInTheDocument();
    expect(screen.getByText('입력 중…')).toBeInTheDocument();
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
});
