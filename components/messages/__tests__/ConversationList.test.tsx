import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

afterEach(() => cleanup());

import { ConversationList } from '../ConversationList';
import type { ConversationListItem } from '../types';

function makeItem(over: Partial<ConversationListItem> = {}): ConversationListItem {
  return {
    conversationId: 'conv-1',
    counterparty: { workspaceId: 'pg-1', name: 'OO페이', type: 'pg', hasLogo: false },
    rfpId: null,
    preview: '제안 보냅니다.',
    lastMessageAt: '2026-06-02T01:00:00.000Z',
    unread: false,
    ...over,
  };
}

describe('ConversationList', () => {
  it('renders counterparty name and recent message preview', () => {
    render(
      <ConversationList
        conversations={[makeItem()]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('OO페이')).toBeInTheDocument();
    expect(screen.getByText('제안 보냅니다.')).toBeInTheDocument();
  });

  it('shows the unread dot when unread is true', () => {
    render(
      <ConversationList
        conversations={[makeItem({ unread: true })]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('읽지 않음')).toBeInTheDocument();
  });

  it('hides the unread dot when unread is false', () => {
    render(
      <ConversationList
        conversations={[makeItem({ unread: false })]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('읽지 않음')).not.toBeInTheDocument();
  });

  it('calls onSelect with the conversation id when a row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ConversationList
        conversations={[makeItem({ conversationId: 'conv-42' })]}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByRole('button', { name: /OO페이/ }));
    expect(onSelect).toHaveBeenCalledWith('conv-42');
  });

  it('marks the selected row with aria-current', () => {
    render(
      <ConversationList
        conversations={[makeItem({ conversationId: 'conv-7' })]}
        selectedId="conv-7"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /OO페이/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('renders nothing for an empty conversation list', () => {
    render(<ConversationList conversations={[]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the last message time in Seoul time (absolute, tz-stable)', () => {
    // toLocaleTimeString('ko-KR') output depends on ICU data in the runner (small-icu
    // builds return "AM 10:00" instead of "오전 10:00"). Stub to be deterministic while
    // still asserting the correct locale + timezone are forwarded.
    const spy = vi
      .spyOn(Date.prototype, 'toLocaleTimeString')
      .mockReturnValue('오전 10:00');
    render(
      <ConversationList
        conversations={[makeItem({ lastMessageAt: '2026-06-02T01:00:00.000Z' })]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('오전 10:00')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(
      'ko-KR',
      expect.objectContaining({ timeZone: 'Asia/Seoul' }),
    );
    spy.mockRestore();
  });

  it('renders no time when lastMessageAt is null', () => {
    render(
      <ConversationList
        conversations={[makeItem({ lastMessageAt: null })]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    // The row still renders; time slot is simply absent (no crash).
    expect(screen.getByText('OO페이')).toBeInTheDocument();
    expect(screen.queryByText(/오전|오후/)).not.toBeInTheDocument();
  });
});
