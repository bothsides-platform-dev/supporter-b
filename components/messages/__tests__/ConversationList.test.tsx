import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

afterEach(() => cleanup());

import { ConversationList } from '../ConversationList';
import type { InboxListItem } from '../types';

function makeCounterparty(over: Partial<Extract<InboxListItem, { kind: 'counterparty' }>> = {}): InboxListItem {
  return {
    kind: 'counterparty',
    key: 'c:conv-1',
    conversationId: 'conv-1',
    counterparty: { workspaceId: 'pg-1', name: 'OO페이', type: 'pg', hasLogo: false },
    rfpId: null,
    preview: '제안 보냅니다.',
    lastMessageAt: '2026-06-02T01:00:00.000Z',
    unread: false,
    ...over,
  };
}

function makeTeam(over: Partial<Extract<InboxListItem, { kind: 'team' }>> = {}): InboxListItem {
  return {
    kind: 'team',
    key: 't:rfp-1',
    rfpId: 'rfp-1',
    rfpCode: 'P-2605-0042',
    rfpTitle: '결제대행 견적',
    preview: '내부 메모입니다.',
    lastMessageAt: '2026-06-02T01:00:00.000Z',
    unread: false,
    ...over,
  };
}

describe('ConversationList', () => {
  it('renders counterparty name and recent message preview', () => {
    render(
      <ConversationList
        items={[makeCounterparty()]}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('OO페이')).toBeInTheDocument();
    expect(screen.getByText('제안 보냅니다.')).toBeInTheDocument();
  });

  it('renders a team thread row with 팀 label, rfp code and title', () => {
    render(
      <ConversationList
        items={[makeTeam()]}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    // 코드는 .md-numeric, 제목은 평문. 둘 다 노출.
    expect(screen.getByText('P-2605-0042')).toBeInTheDocument();
    expect(screen.getByText(/결제대행 견적/)).toBeInTheDocument();
    expect(screen.getByText('내부 메모입니다.')).toBeInTheDocument();
  });

  it('shows the unread dot when unread is true', () => {
    render(
      <ConversationList
        items={[makeCounterparty({ unread: true })]}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('읽지 않음')).toBeInTheDocument();
  });

  it('hides the unread dot when unread is false', () => {
    render(
      <ConversationList
        items={[makeCounterparty({ unread: false })]}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('읽지 않음')).not.toBeInTheDocument();
  });

  it('calls onSelect with the item key when a counterparty row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ConversationList
        items={[makeCounterparty({ key: 'c:conv-42', conversationId: 'conv-42' })]}
        selectedKey={null}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByRole('button', { name: /OO페이/ }));
    expect(onSelect).toHaveBeenCalledWith('c:conv-42');
  });

  it('calls onSelect with the team key when a team row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ConversationList
        items={[makeTeam({ key: 't:rfp-9', rfpId: 'rfp-9' })]}
        selectedKey={null}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByRole('button', { name: /결제대행 견적/ }));
    expect(onSelect).toHaveBeenCalledWith('t:rfp-9');
  });

  it('marks the selected row with aria-current', () => {
    render(
      <ConversationList
        items={[makeCounterparty({ key: 'c:conv-7', conversationId: 'conv-7' })]}
        selectedKey="c:conv-7"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /OO페이/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('renders nothing for an empty list', () => {
    render(<ConversationList items={[]} selectedKey={null} onSelect={vi.fn()} />);
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
        items={[makeCounterparty({ lastMessageAt: '2026-06-02T01:00:00.000Z' })]}
        selectedKey={null}
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
        items={[makeCounterparty({ lastMessageAt: null })]}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    // The row still renders; time slot is simply absent (no crash).
    expect(screen.getByText('OO페이')).toBeInTheDocument();
    expect(screen.queryByText(/오전|오후/)).not.toBeInTheDocument();
  });
});
