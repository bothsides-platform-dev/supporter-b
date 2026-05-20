import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const createWorkspaceAction = vi.fn();
const switchWorkspaceAction = vi.fn();
const lookupBizNoAction = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock('@/lib/server/actions/workspace/createWorkspaceAction', () => ({
  createWorkspaceAction: (input: unknown) => createWorkspaceAction(input),
}));
vi.mock('@/lib/server/actions/workspace/switchWorkspaceAction', () => ({
  switchWorkspaceAction: (id: string) => switchWorkspaceAction(id),
}));
vi.mock('@/lib/server/actions/rfp', () => ({
  lookupBizNoAction: (bizNo: string) => lookupBizNoAction(bizNo),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

import { CreateWorkspaceForm } from '../CreateWorkspaceForm';

beforeEach(() => {
  createWorkspaceAction.mockReset();
  switchWorkspaceAction.mockReset();
  lookupBizNoAction.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe('CreateWorkspaceForm — PG', () => {
  it('disables submit until a name is entered', async () => {
    const user = userEvent.setup();
    render(<CreateWorkspaceForm />);
    await user.click(screen.getByLabelText('PG'));
    const submit = screen.getByRole('button', { name: '워크스페이스 만들기' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('워크스페이스 이름'), 'My PG');
    expect(submit).toBeEnabled();
  });

  it('creates a pg workspace, switches into it, and navigates home', async () => {
    const user = userEvent.setup();
    createWorkspaceAction.mockResolvedValue({ ok: true, workspaceId: 'ws-new' });
    switchWorkspaceAction.mockResolvedValue({ ok: true, redirectTo: '/home' });

    render(<CreateWorkspaceForm />);
    await user.click(screen.getByLabelText('PG'));
    await user.type(screen.getByLabelText('워크스페이스 이름'), 'My PG');
    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));

    await waitFor(() =>
      expect(createWorkspaceAction).toHaveBeenCalledWith({ type: 'pg', name: 'My PG' }),
    );
    await waitFor(() => expect(switchWorkspaceAction).toHaveBeenCalledWith('ws-new'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/home'));
  });

  it('shows the error and does not navigate on failure', async () => {
    const user = userEvent.setup();
    createWorkspaceAction.mockResolvedValue({ ok: false, error: 'INVALID_INPUT' });

    render(<CreateWorkspaceForm />);
    await user.click(screen.getByLabelText('PG'));
    await user.type(screen.getByLabelText('워크스페이스 이름'), 'X');
    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(switchWorkspaceAction).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('CreateWorkspaceForm — buyer', () => {
  it('creates a buyer workspace with no bizProfile when skipped', async () => {
    const user = userEvent.setup();
    createWorkspaceAction.mockResolvedValue({ ok: true, workspaceId: 'ws-b' });
    switchWorkspaceAction.mockResolvedValue({ ok: true, redirectTo: '/home' });

    render(<CreateWorkspaceForm />); // buyer is the default type
    await user.click(screen.getByLabelText(/나중에 입력/));
    await user.type(screen.getByPlaceholderText('(주)샘플테크'), 'BuyerCo');
    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));

    await waitFor(() =>
      expect(createWorkspaceAction).toHaveBeenCalledWith({
        type: 'buyer',
        name: 'BuyerCo',
      }),
    );
    await waitFor(() => expect(switchWorkspaceAction).toHaveBeenCalledWith('ws-b'));
  });

  it('passes the looked-up bizProfile + grade through to createWorkspaceAction', async () => {
    const user = userEvent.setup();
    lookupBizNoAction.mockResolvedValue({
      ok: true,
      valid: true,
      taxType: 'general',
      status: 'active',
    });
    createWorkspaceAction.mockResolvedValue({ ok: true, workspaceId: 'ws-b2' });
    switchWorkspaceAction.mockResolvedValue({ ok: true, redirectTo: '/home' });

    render(<CreateWorkspaceForm />);
    await user.type(screen.getByLabelText('사업자 등록번호'), '1112223334');
    await user.click(screen.getByRole('button', { name: '조회' }));
    await user.click(await screen.findByRole('button', { name: '확인' }));
    await user.type(screen.getByPlaceholderText('(주)샘플테크'), 'BuyerCo');
    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));

    await waitFor(() =>
      expect(createWorkspaceAction).toHaveBeenCalledWith({
        type: 'buyer',
        name: 'BuyerCo',
        bizProfile: {
          bizNo: '111-22-23334',
          taxType: 'general',
          status: 'active',
          grade: 'sme1',
          gradeSource: 'user_confirmed',
        },
      }),
    );
    await waitFor(() => expect(switchWorkspaceAction).toHaveBeenCalledWith('ws-b2'));
  });
});
