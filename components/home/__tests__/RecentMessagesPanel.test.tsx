import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ConversationListItem } from '@/components/messages/types';

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

afterEach(() => cleanup());

import { RecentMessagesPanel } from '../RecentMessagesPanel';

function makeConv(overrides?: Partial<ConversationListItem>): ConversationListItem {
  return {
    conversationId: 'conv-abc',
    counterparty: { workspaceId: 'ws-pg', name: 'NICE페이', type: 'pg', hasLogo: false },
    rfpId: null,
    preview: '검토 부탁드립니다.',
    lastMessageAt: '2026-06-06T01:00:00.000Z',
    unread: false,
    ...overrides,
  };
}

describe('RecentMessagesPanel', () => {
  it('renders a conversation row with a deep-link to /messages?c=<id>', () => {
    render(<RecentMessagesPanel conversations={[makeConv({ conversationId: 'conv-xyz' })]} unreadCount={0} />);
    const link = screen.getByRole('link', { name: /NICE페이/ });
    expect(link).toHaveAttribute('href', '/messages?c=conv-xyz');
  });

  it('shows at most 4 conversation rows (HOME_RECENT_MESSAGES cap)', () => {
    const convs = Array.from({ length: 5 }, (_, i) =>
      makeConv({
        conversationId: `conv-${i}`,
        counterparty: { workspaceId: `ws-${i}`, name: `회사 ${i}`, type: 'pg', hasLogo: false },
      }),
    );
    render(<RecentMessagesPanel conversations={convs} unreadCount={0} />);
    const links = screen
      .getAllByRole('link')
      .filter((l) => l.getAttribute('href')?.startsWith('/messages?c='));
    expect(links).toHaveLength(4);
  });

  it('shows an unread badge when unreadCount > 0', () => {
    render(<RecentMessagesPanel conversations={[makeConv()]} unreadCount={3} />);
    expect(screen.getByLabelText('읽지 않은 메시지 3개')).toBeInTheDocument();
  });

  it('does not show an unread badge when unreadCount is 0', () => {
    render(<RecentMessagesPanel conversations={[makeConv()]} unreadCount={0} />);
    expect(screen.queryByLabelText(/읽지 않은 메시지/)).not.toBeInTheDocument();
  });

  it('renders the empty state when conversations is empty', () => {
    render(<RecentMessagesPanel conversations={[]} unreadCount={0} />);
    expect(screen.getByText('아직 주고받은 메시지가 없어요')).toBeInTheDocument();
  });

  it('renders a "메시지 전체 보기" link to /messages', () => {
    render(<RecentMessagesPanel conversations={[]} unreadCount={0} />);
    expect(screen.getByRole('link', { name: '메시지 전체 보기' })).toHaveAttribute(
      'href',
      '/messages',
    );
  });

  it('shows an unread dot on a conversation row when c.unread is true', () => {
    render(
      <RecentMessagesPanel
        conversations={[makeConv({ unread: true })]}
        unreadCount={1}
      />,
    );
    expect(screen.getByLabelText('읽지 않음')).toBeInTheDocument();
  });
});
