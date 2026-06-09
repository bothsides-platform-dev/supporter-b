import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const createWorkspaceAction = vi.fn();
const switchWorkspaceAction = vi.fn();
const lookupBizNoAction = vi.fn();
const assign = vi.fn();

vi.mock('@/lib/server/actions/workspace/createWorkspaceAction', () => ({
  createWorkspaceAction: (input: unknown) => createWorkspaceAction(input),
}));
vi.mock('@/lib/server/actions/workspace/switchWorkspaceAction', () => ({
  switchWorkspaceAction: (id: string, path?: string) => switchWorkspaceAction(id, path),
}));
vi.mock('@/lib/server/actions/rfp', () => ({
  lookupBizNoAction: (bizNo: string) => lookupBizNoAction(bizNo),
}));

import { CreateWorkspaceForm } from '../CreateWorkspaceForm';

beforeEach(() => {
  createWorkspaceAction.mockReset();
  switchWorkspaceAction.mockReset();
  lookupBizNoAction.mockReset();
  assign.mockReset();
  // jsdom's window.location.assign throws "not implemented"; replace with a stub.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign },
  });
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

  it('creates a pg workspace, switches into it, and hard-navigates to redirectTo', async () => {
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
    await waitFor(() => expect(switchWorkspaceAction).toHaveBeenCalledWith('ws-new', undefined));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/home'));
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
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('CreateWorkspaceForm — buyer', () => {
  it('조회 없이는 제출 버튼이 비활성', async () => {
    render(<CreateWorkspaceForm />); // buyer is the default type
    const submit = screen.getByRole('button', { name: '워크스페이스 만들기' });
    expect(submit).toBeDisabled();
  });

  it('조회된 bizProfile을 createWorkspaceAction에 전달한다', async () => {
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
    await user.type(screen.getByLabelText('사업자 등록번호'), '1248100998');
    await user.click(screen.getByRole('button', { name: '조회' }));
    // GradeConfirmPanel은 가입 폼에서 제거됨 — 등급은 admin 승인 시 지정
    await user.type(screen.getByPlaceholderText('(주)샘플테크'), 'BuyerCo');
    await user.click(await screen.findByRole('button', { name: '워크스페이스 만들기' }));

    await waitFor(() =>
      expect(createWorkspaceAction).toHaveBeenCalledWith({
        type: 'buyer',
        name: 'BuyerCo',
        bizProfile: {
          bizNo: '124-81-00998', // BizLookupField가 하이픈 포맷으로 변환
          taxType: 'general',
          status: 'active',
        },
      }),
    );
    await waitFor(() => expect(switchWorkspaceAction).toHaveBeenCalledWith('ws-b2', undefined));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/home'));
  });
});
