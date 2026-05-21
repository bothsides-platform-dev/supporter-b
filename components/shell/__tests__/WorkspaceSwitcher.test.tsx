import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const switchWorkspaceAction = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock('@/lib/server/actions/workspace/switchWorkspaceAction', () => ({
  switchWorkspaceAction: (id: string) => switchWorkspaceAction(id),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

import { WorkspaceSwitcher } from '../WorkspaceSwitcher';

const workspaces = [
  { id: 'ws1', name: '구매사A', type: 'buyer' as const, role: 'admin' as const },
  { id: 'ws2', name: '서포터 B 페이', type: 'pg' as const, role: 'member' as const },
];
const current = { id: 'ws1', name: '구매사A', type: 'buyer' as const };

beforeEach(() => {
  switchWorkspaceAction.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe('WorkspaceSwitcher', () => {
  it('shows the current workspace name and type label in the trigger', () => {
    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    expect(screen.getByText('구매사A')).toBeInTheDocument();
    expect(screen.getByText('구매사')).toBeInTheDocument();
  });

  it('switches to a selected workspace and navigates home', async () => {
    const user = userEvent.setup();
    switchWorkspaceAction.mockResolvedValue({ ok: true, redirectTo: '/home' });

    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    await user.click(screen.getByRole('button')); // only the trigger exists pre-open
    await user.click(await screen.findByText('서포터 B 페이'));

    await waitFor(() => expect(switchWorkspaceAction).toHaveBeenCalledWith('ws2'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/home'));
  });

  it('does not switch when selecting the already-active workspace', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    await user.click(screen.getByRole('button'));
    // '구매사A' now appears in both the trigger and the list — click the list one.
    const matches = await screen.findAllByText('구매사A');
    await user.click(matches[matches.length - 1]);
    expect(switchWorkspaceAction).not.toHaveBeenCalled();
  });

  it('successful switch calls only router.push, not router.refresh — avoids Next 16 useTransition hang', async () => {
    const user = userEvent.setup();
    switchWorkspaceAction.mockResolvedValue({ ok: true, redirectTo: '/home' });

    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    await user.click(screen.getByRole('button'));
    await user.click(await screen.findByText('서포터 B 페이'));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/home'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('footer "워크스페이스 만들기" navigates to /workspace/new', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    await user.click(screen.getByRole('button'));
    await user.click(await screen.findByText('워크스페이스 만들기'));
    expect(push).toHaveBeenCalledWith('/workspace/new');
  });
});
