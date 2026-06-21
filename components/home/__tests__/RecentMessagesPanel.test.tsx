import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ConversationListItem } from '@/components/messages/types';
import type { InboxListItem } from '@/lib/server/actions/chat/inboxLoader';
import type { PresenceState } from '@/components/presence/WorkspacePresenceProvider';

// next/link renders as <a> in jsdom
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...(rest as object)}>
      {children}
    </a>
  ),
}));

// WorkspaceAvatar makes no assertions here; stub to keep render fast and pure.
vi.mock('@/components/primitives/WorkspaceAvatar', () => ({
  WorkspaceAvatar: ({ name }: { name: string }) => <span data-testid="avatar">{name}</span>,
}));

// useWorkspacePresence drives the online dot.
let workspacePresenceResult: PresenceState = { online: false, activity: 'offline' };
vi.mock('@/components/presence/WorkspacePresenceProvider', () => ({
  useWorkspacePresence: () => workspacePresenceResult,
}));

afterEach(() => {
  cleanup();
  workspacePresenceResult = { online: false, activity: 'offline' };
});

import { RecentMessagesPanel } from '../RecentMessagesPanel';

function makeConv(overrides?: Partial<ConversationListItem>): InboxListItem {
  const c: ConversationListItem = {
    conversationId: 'conv-abc',
    counterparty: { workspaceId: 'ws-pg', name: 'NICE페이', type: 'pg', hasLogo: false },
    rfpId: null,
    rfpCode: null,
    rfpTitle: null,
    rfpStatus: null,
    rfpDeadline: null,
    preview: '검토 부탁드립니다.',
    lastMessageAt: '2026-06-06T01:00:00.000Z',
    unread: false,
    ...overrides,
  };
  return { kind: 'counterparty', key: `c:${c.conversationId}`, ...c };
}

describe('RecentMessagesPanel', () => {
  it('renders a conversation row with a deep-link to /messages?c=<id>', () => {
    render(<RecentMessagesPanel items={[makeConv({ conversationId: 'conv-xyz' })]} unreadCount={0} />);
    const link = screen.getByRole('link', { name: /NICE페이/ });
    expect(link).toHaveAttribute('href', '/messages?c=conv-xyz');
  });

  it('renders a team thread row deep-linking to /messages?t=<rfpId>', () => {
    render(
      <RecentMessagesPanel
        items={[
          {
            kind: 'team',
            key: 't:r1',
            rfpId: 'r1',
            rfpCode: 'P-1',
            rfpTitle: '제목',
            preview: '메모',
            lastMessageAt: '2026-06-14T01:00:00Z',
            unread: true,
          },
        ]}
        unreadCount={1}
      />,
    );
    const link = screen.getByRole('link', { name: /제목|메모|팀|P-1/ });
    expect(link).toHaveAttribute('href', '/messages?t=r1');
  });

  it('shows at most 4 rows (HOME_RECENT_MESSAGES cap)', () => {
    const convs = Array.from({ length: 5 }, (_, i) =>
      makeConv({
        conversationId: `conv-${i}`,
        counterparty: { workspaceId: `ws-${i}`, name: `회사 ${i}`, type: 'pg', hasLogo: false },
      }),
    );
    render(<RecentMessagesPanel items={convs} unreadCount={0} />);
    const links = screen
      .getAllByRole('link')
      .filter((l) => l.getAttribute('href')?.startsWith('/messages?c='));
    expect(links).toHaveLength(4);
  });

  it('shows an unread badge when unreadCount > 0', () => {
    render(<RecentMessagesPanel items={[makeConv()]} unreadCount={3} />);
    expect(screen.getByLabelText('읽지 않은 메시지 3개')).toBeInTheDocument();
  });

  it('does not show an unread badge when unreadCount is 0', () => {
    render(<RecentMessagesPanel items={[makeConv()]} unreadCount={0} />);
    expect(screen.queryByLabelText(/읽지 않은 메시지/)).not.toBeInTheDocument();
  });

  it('renders the empty state when items is empty', () => {
    render(<RecentMessagesPanel items={[]} unreadCount={0} />);
    expect(screen.getByText('아직 주고받은 메시지가 없어요')).toBeInTheDocument();
  });

  it('renders a "메시지 전체 보기" link to /messages', () => {
    render(<RecentMessagesPanel items={[]} unreadCount={0} />);
    expect(screen.getByRole('link', { name: '메시지 전체 보기' })).toHaveAttribute(
      'href',
      '/messages',
    );
  });

  it('shows an unread dot on a row when item.unread is true', () => {
    render(
      <RecentMessagesPanel
        items={[makeConv({ unread: true })]}
        unreadCount={1}
      />,
    );
    expect(screen.getByLabelText('읽지 않음')).toBeInTheDocument();
  });

  it('counterparty 항목에서 상대방이 온라인이면 프레즌스 점을 렌더한다', () => {
    workspacePresenceResult = { online: true, activity: 'active' };
    render(<RecentMessagesPanel items={[makeConv()]} unreadCount={0} />);
    expect(screen.getByLabelText('온라인')).toBeInTheDocument();
  });

  it('counterparty 항목에서 상대방이 오프라인이면 프레즌스 점을 렌더하지 않는다', () => {
    workspacePresenceResult = { online: false, activity: 'offline' };
    render(<RecentMessagesPanel items={[makeConv()]} unreadCount={0} />);
    expect(screen.queryByLabelText('온라인')).not.toBeInTheDocument();
  });
});
