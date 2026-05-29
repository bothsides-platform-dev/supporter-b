import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User } from '@/lib/types/user';

const toast = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const inviteWorkspaceMemberAction = vi.fn();
vi.mock('@/lib/server/actions/workspace/inviteWorkspaceMemberAction', () => ({
  inviteWorkspaceMemberAction: (...a: unknown[]) =>
    inviteWorkspaceMemberAction(...a),
}));

const removeWorkspaceMemberAction = vi.fn();
vi.mock('@/lib/server/actions/workspace/removeWorkspaceMemberAction', () => ({
  removeWorkspaceMemberAction: (...a: unknown[]) =>
    removeWorkspaceMemberAction(...a),
}));

const changeWorkspaceMemberRoleAction = vi.fn();
vi.mock(
  '@/lib/server/actions/workspace/changeWorkspaceMemberRoleAction',
  () => ({
    changeWorkspaceMemberRoleAction: (...a: unknown[]) =>
      changeWorkspaceMemberRoleAction(...a),
  }),
);

import { MembersPanel } from '../MembersPanel';

const ADMIN: User = {
  id: 'u-admin',
  name: '관리자',
  email: 'admin@example.com',
  avatarColor: 'ink',
  role: 'admin',
  status: 'active',
  joinedAt: '2026-01-01T00:00:00.000Z',
};
const MEMBER: User = {
  id: 'u-member',
  name: '멤버',
  email: 'member@example.com',
  avatarColor: 'ink',
  role: 'member',
  status: 'active',
  joinedAt: '2026-01-01T00:00:00.000Z',
};

const baseProps = {
  workspaceName: '서포터 B 페이',
  initialMembers: [ADMIN, MEMBER],
  initialPendingInvites: [],
  currentUserId: ADMIN.id,
};

beforeEach(() => {
  toast.mockReset();
  inviteWorkspaceMemberAction.mockReset();
  removeWorkspaceMemberAction.mockReset();
  changeWorkspaceMemberRoleAction.mockReset();
});

describe('MembersPanel', () => {
  it('never renders the public share link section', () => {
    render(<MembersPanel {...baseProps} userRole="admin" />);
    expect(
      screen.queryByRole('button', { name: '재발급' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '복사' })).not.toBeInTheDocument();
  });

  it('admin: invite sends the selected role', async () => {
    inviteWorkspaceMemberAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    await user.type(
      screen.getByPlaceholderText('member@company.com'),
      'new@example.com',
    );
    await user.selectOptions(screen.getByLabelText('초대 역할'), 'admin');
    await user.click(screen.getByRole('button', { name: '초대 발송' }));

    await waitFor(() =>
      expect(inviteWorkspaceMemberAction).toHaveBeenCalledWith({
        email: 'new@example.com',
        role: 'admin',
      }),
    );
  });

  it('admin: kicks a member and drops the row', async () => {
    removeWorkspaceMemberAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    expect(screen.getByText('member@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '멤버 강퇴' }));

    await waitFor(() =>
      expect(removeWorkspaceMemberAction).toHaveBeenCalledWith({
        userId: MEMBER.id,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText('member@example.com')).not.toBeInTheDocument(),
    );
  });

  it('admin: cannot kick themselves (self kick button disabled)', () => {
    render(<MembersPanel {...baseProps} userRole="admin" />);
    expect(screen.getByRole('button', { name: '관리자 강퇴' })).toBeDisabled();
  });

  it('admin: changing a role calls the action', async () => {
    changeWorkspaceMemberRoleAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<MembersPanel {...baseProps} userRole="admin" />);

    await user.selectOptions(screen.getByLabelText('멤버 역할 변경'), 'admin');

    await waitFor(() =>
      expect(changeWorkspaceMemberRoleAction).toHaveBeenCalledWith({
        userId: MEMBER.id,
        role: 'admin',
      }),
    );
  });

  it('member: shows no kick buttons or role controls', () => {
    render(<MembersPanel {...baseProps} userRole="member" />);
    expect(screen.queryByRole('button', { name: /강퇴/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('멤버 역할 변경')).not.toBeInTheDocument();
  });
});
