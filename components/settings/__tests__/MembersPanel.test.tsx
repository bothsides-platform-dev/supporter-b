import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const inviteWorkspaceMemberAction = vi.fn();
vi.mock('@/lib/server/actions/workspace/inviteWorkspaceMemberAction', () => ({
  inviteWorkspaceMemberAction: (...a: unknown[]) =>
    inviteWorkspaceMemberAction(...a),
}));

const regenerateWorkspaceShareTokenAction = vi.fn();
vi.mock(
  '@/lib/server/actions/workspace/regenerateWorkspaceShareTokenAction',
  () => ({
    regenerateWorkspaceShareTokenAction: () =>
      regenerateWorkspaceShareTokenAction(),
  }),
);

import { MembersPanel } from '../MembersPanel';

const SHARE_URL = 'http://localhost:3000/share/workspace/tok-abc';

const baseProps = {
  workspaceName: '서포터 B 페이',
  initialMembers: [],
  initialPendingInvites: [],
  shareUrl: SHARE_URL,
};

beforeEach(() => {
  toast.mockReset();
  regenerateWorkspaceShareTokenAction.mockReset();
});

describe('MembersPanel share link', () => {
  it('admin: shows the share URL and copies it to clipboard', async () => {
    // setup() installs its own navigator.clipboard stub, so override it AFTER.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<MembersPanel {...baseProps} userRole="admin" />);

    expect(screen.getByDisplayValue(SHARE_URL)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '복사' }));
    expect(writeText).toHaveBeenCalledWith(SHARE_URL);
  });

  it('admin: 재발급 swaps in the regenerated URL', async () => {
    const NEW = 'http://localhost:3000/share/workspace/tok-new';
    regenerateWorkspaceShareTokenAction.mockResolvedValue({
      ok: true,
      shareUrl: NEW,
    });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    await user.click(screen.getByRole('button', { name: '재발급' }));

    await waitFor(() =>
      expect(screen.getByDisplayValue(NEW)).toBeInTheDocument(),
    );
  });

  it('member: hides the share link section', () => {
    render(<MembersPanel {...baseProps} userRole="member" />);
    expect(screen.queryByDisplayValue(SHARE_URL)).not.toBeInTheDocument();
  });
});
