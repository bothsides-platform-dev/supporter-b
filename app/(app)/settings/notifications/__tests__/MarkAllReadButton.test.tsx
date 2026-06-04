import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockMarkAllRead = vi.fn();
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    markAllRead: mockMarkAllRead,
    markRead: vi.fn(),
    notifications: [],
    unreadCount: 0,
    status: 'live',
    retryEmail: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// stub server actions to avoid transitive next-auth/next server imports
vi.mock('@/lib/server/actions/notifications/markAllReadAction', () => ({
  markAllReadAction: vi.fn().mockResolvedValue({ ok: true }),
}));

// MarkAllReadButton should call useNotifications().markAllRead() on click
// so the Zustand store gets the optimistic update and the sidebar badge drops to 0 immediately.
// Previously the button called markAllReadAction() directly (bypassing the store) → badge stayed stale.

import { MarkAllReadButton } from '../MarkAllReadButton';

describe('MarkAllReadButton', () => {
  beforeEach(() => {
    mockMarkAllRead.mockReset().mockResolvedValue(undefined);
  });

  it('calls markAllRead from useNotifications when clicked', async () => {
    const user = userEvent.setup();
    render(<MarkAllReadButton />);
    await user.click(screen.getByRole('button', { name: '모두 읽음' }));
    expect(mockMarkAllRead).toHaveBeenCalledOnce();
  });
});
