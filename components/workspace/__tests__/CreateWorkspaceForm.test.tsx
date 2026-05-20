import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const createWorkspaceAction = vi.fn();
const switchWorkspaceAction = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock('@/lib/server/actions/workspace/createWorkspaceAction', () => ({
  createWorkspaceAction: (input: unknown) => createWorkspaceAction(input),
}));
vi.mock('@/lib/server/actions/workspace/switchWorkspaceAction', () => ({
  switchWorkspaceAction: (id: string) => switchWorkspaceAction(id),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

import { CreateWorkspaceForm } from '../CreateWorkspaceForm';

beforeEach(() => {
  createWorkspaceAction.mockReset();
  switchWorkspaceAction.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe('CreateWorkspaceForm', () => {
  it('disables submit until a name is entered', async () => {
    const user = userEvent.setup();
    render(<CreateWorkspaceForm />);
    const submit = screen.getByRole('button', { name: '워크스페이스 만들기' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('워크스페이스 이름'), 'My PG');
    expect(submit).toBeEnabled();
  });

  it('creates, switches into the new workspace, and navigates home', async () => {
    const user = userEvent.setup();
    createWorkspaceAction.mockResolvedValue({ ok: true, workspaceId: 'ws-new' });
    switchWorkspaceAction.mockResolvedValue({ ok: true, redirectTo: '/home' });

    render(<CreateWorkspaceForm />);
    await user.click(screen.getByLabelText('PG'));
    await user.type(screen.getByLabelText('워크스페이스 이름'), 'My PG');
    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));

    await waitFor(() =>
      expect(createWorkspaceAction).toHaveBeenCalledWith({
        type: 'pg',
        name: 'My PG',
      }),
    );
    await waitFor(() =>
      expect(switchWorkspaceAction).toHaveBeenCalledWith('ws-new'),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/home'));
  });

  it('shows the error and does not navigate on failure', async () => {
    const user = userEvent.setup();
    createWorkspaceAction.mockResolvedValue({ ok: false, error: 'INVALID_INPUT' });

    render(<CreateWorkspaceForm />);
    await user.type(screen.getByLabelText('워크스페이스 이름'), 'X');
    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(switchWorkspaceAction).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
