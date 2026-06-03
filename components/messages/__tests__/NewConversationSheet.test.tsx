import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// base-ui Dialog/Sheet needs these in jsdom.
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// next/navigation — the component refreshes the route after a successful send.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}));

// sendChatMessageAction is a 'use server' action — mock it so the cold-contact
// email path can be exercised without a DB.
const sendChatMessageAction = vi.fn();
vi.mock('@/lib/server/actions/chat/sendChatMessageAction', () => ({
  sendChatMessageAction: (...args: unknown[]) => sendChatMessageAction(...args),
}));

afterEach(() => cleanup());
beforeEach(() => {
  sendChatMessageAction.mockReset();
  refresh.mockReset();
});

import { NewConversationSheet } from '../NewConversationSheet';

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '새 대화' }));
}

describe('NewConversationSheet', () => {
  it('이메일 입력(콜드 컨택) → 첫 메시지 전송 시 counterpartyEmail로 액션 호출', async () => {
    const user = userEvent.setup();
    sendChatMessageAction.mockResolvedValue({ ok: true, conversationId: 'c1', messageId: 'm1' });
    render(<NewConversationSheet />);

    await openSheet(user);

    await user.type(screen.getByLabelText('상대 이메일'), 'pg@example.com');
    await user.type(screen.getByLabelText('메시지'), '안녕하세요, 제안 요청 드려요.');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    expect(sendChatMessageAction).toHaveBeenCalledWith({
      counterpartyEmail: 'pg@example.com',
      body: '안녕하세요, 제안 요청 드려요.',
    });
  });

  it('유효하지 않은 이메일이면 전송하지 않는다', async () => {
    const user = userEvent.setup();
    render(<NewConversationSheet />);

    await openSheet(user);

    await user.type(screen.getByLabelText('상대 이메일'), 'not-an-email');
    await user.type(screen.getByLabelText('메시지'), '본문입니다.');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    expect(sendChatMessageAction).not.toHaveBeenCalled();
    expect(screen.getByText('올바른 이메일 주소를 입력하세요.')).toBeInTheDocument();
  });

  it('본문이 비어 있으면 전송하지 않는다', async () => {
    const user = userEvent.setup();
    render(<NewConversationSheet />);

    await openSheet(user);

    await user.type(screen.getByLabelText('상대 이메일'), 'pg@example.com');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    expect(sendChatMessageAction).not.toHaveBeenCalled();
  });

  it('액션이 COUNTERPARTY_NOT_FOUND를 반환하면 인라인 에러를 표시한다', async () => {
    const user = userEvent.setup();
    sendChatMessageAction.mockResolvedValue({ ok: false, error: 'COUNTERPARTY_NOT_FOUND' });
    render(<NewConversationSheet />);

    await openSheet(user);

    await user.type(screen.getByLabelText('상대 이메일'), 'unknown@example.com');
    await user.type(screen.getByLabelText('메시지'), '본문입니다.');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    expect(sendChatMessageAction).toHaveBeenCalled();
    expect(
      await screen.findByText('해당 이메일로 연결된 상대를 찾지 못했어요.'),
    ).toBeInTheDocument();
  });
});
