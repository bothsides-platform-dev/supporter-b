import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PresenceState } from '@/components/presence/WorkspacePresenceProvider';

// useWorkspacePresence drives the online dot.
let workspacePresenceResult: PresenceState = { online: false, activity: 'offline' };
vi.mock('@/components/presence/WorkspacePresenceProvider', () => ({
  useWorkspacePresence: () => workspacePresenceResult,
}));

afterEach(() => {
  cleanup();
  workspacePresenceResult = { online: false, activity: 'offline' };
});

import { ConversationList } from '../ConversationList';
import type { InboxListItem } from '../types';

function makeCounterparty(over: Partial<Extract<InboxListItem, { kind: 'counterparty' }>> = {}): InboxListItem {
  return {
    kind: 'counterparty',
    key: 'c:conv-1',
    conversationId: 'conv-1',
    counterparty: { workspaceId: 'pg-1', name: 'OO페이', type: 'pg', logoUpdatedAt: null },
    rfpId: null,
    rfpCode: null,
    rfpTitle: null,
    rfpStatus: null,
    rfpDeadline: null,
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

  it('안읽음이면 sr-only "읽지 않음" 라벨을 표시하고 시각적 점은 없다', () => {
    render(
      <ConversationList items={[makeCounterparty({ unread: true })]} selectedKey={null} onSelect={vi.fn()} />,
    );
    const label = screen.getByText('읽지 않음');
    expect(label).toBeInTheDocument();
    expect(label).toHaveClass('sr-only');
  });

  it('읽음이면 "읽지 않음" 라벨을 표시하지 않는다', () => {
    render(
      <ConversationList items={[makeCounterparty({ unread: false })]} selectedKey={null} onSelect={vi.fn()} />,
    );
    expect(screen.queryByText('읽지 않음')).not.toBeInTheDocument();
  });

  it('안읽음이면 이름을 굵게(font-semibold) 표시한다', () => {
    render(
      <ConversationList items={[makeCounterparty({ unread: true, counterparty: { workspaceId: 'pg-1', name: '굵은이름', type: 'pg', logoUpdatedAt: null } })]} selectedKey={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('굵은이름')).toHaveClass('font-semibold');
  });

  it('팀 항목 이름줄은 "팀 채팅" 으로 표시한다', () => {
    render(<ConversationList items={[makeTeam()]} selectedKey={null} onSelect={vi.fn()} />);
    expect(screen.getByText('팀 채팅')).toBeInTheDocument();
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

  it('lastMessageAt이 오늘이면 시각(오전/오후 형식)을 표시한다', () => {
    const todayIso = new Date().toISOString();
    render(
      <ConversationList
        items={[makeCounterparty({ lastMessageAt: todayIso })]}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/^오[전후] \d{1,2}:\d{2}$/)).toBeInTheDocument();
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

  it('오늘이 아닌 메시지는 날짜/요일을 표시하고 toLocaleTimeString을 호출하지 않는다', () => {
    const spy = vi.spyOn(Date.prototype, 'toLocaleTimeString');
    render(
      <ConversationList
        items={[makeCounterparty({ lastMessageAt: '2026-01-15T06:00:00.000Z' })]}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('1/15')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('counterparty 항목에 rfpCode가 있으면 RFP 칩을 표시한다', () => {
    render(
      <ConversationList
        items={[makeCounterparty({ rfpCode: 'P-2605-0042', rfpTitle: '결제대행 견적' })]}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('P-2605-0042')).toBeInTheDocument();
    expect(screen.getByText('결제대행 견적')).toBeInTheDocument();
  });

  it('counterparty 항목에 rfpCode가 null이면 RFP 칩을 숨긴다', () => {
    render(
      <ConversationList
        items={[makeCounterparty({ rfpCode: null, rfpTitle: null })]}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByText(/P-\d/)).not.toBeInTheDocument();
  });

  it('팀 스레드 항목에 rfpCode 칩과 미리보기를 렌더한다', () => {
    render(
      <ConversationList items={[makeTeam()]} selectedKey={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText('P-2605-0042')).toBeInTheDocument();
    expect(screen.getByText(/결제대행 견적/)).toBeInTheDocument();
    expect(screen.getByText('내부 메모입니다.')).toBeInTheDocument();
  });

  it('counterparty 항목에서 상대방이 온라인이면 프레즌스 점을 렌더한다', () => {
    workspacePresenceResult = { online: true, activity: 'active' };
    render(
      <ConversationList
        items={[makeCounterparty()]}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('온라인')).toBeInTheDocument();
  });

  it('counterparty 항목에서 상대방이 오프라인이면 프레즌스 점을 렌더하지 않는다', () => {
    workspacePresenceResult = { online: false, activity: 'offline' };
    render(
      <ConversationList
        items={[makeCounterparty()]}
        selectedKey={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('온라인')).not.toBeInTheDocument();
  });
});
