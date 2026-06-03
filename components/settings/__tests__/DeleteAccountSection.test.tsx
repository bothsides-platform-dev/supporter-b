import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getDeleteAccountStatus = vi.fn();
vi.mock('@/lib/server/actions/auth/getDeleteAccountStatus', () => ({
  getDeleteAccountStatus: (...a: unknown[]) => getDeleteAccountStatus(...a),
}));

const deleteAccountAction = vi.fn();
vi.mock('@/lib/server/actions/auth/deleteAccountAction', () => ({
  deleteAccountAction: (...a: unknown[]) => deleteAccountAction(...a),
}));

const signOut = vi.fn();
vi.mock('next-auth/react', () => ({
  signOut: (...a: unknown[]) => signOut(...a),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>{children}</a>
  ),
}));

import React from 'react';
import { DeleteAccountSection } from '../DeleteAccountSection';

beforeEach(() => {
  getDeleteAccountStatus.mockReset();
  deleteAccountAction.mockReset();
  signOut.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('DeleteAccountSection', () => {
  it('renders 탈퇴하기 button', () => {
    render(<DeleteAccountSection />);
    expect(screen.getByRole('button', { name: '탈퇴하기' })).toBeDefined();
  });

  it('opens dialog and fetches status on button click', async () => {
    getDeleteAccountStatus.mockResolvedValue({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [],
    });
    const user = userEvent.setup();

    render(<DeleteAccountSection />);
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));

    await waitFor(() => expect(getDeleteAccountStatus).toHaveBeenCalledOnce());
  });

  it('shows blocking workspaces when user is last admin', async () => {
    getDeleteAccountStatus.mockResolvedValue({
      ok: true,
      blockingWorkspaces: [{ id: 'ws1', name: '구매사A' }],
      soloWorkspaces: [],
    });
    const user = userEvent.setup();

    render(<DeleteAccountSection />);
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));

    await waitFor(() =>
      expect(screen.getByText('구매사A')).toBeDefined(),
    );
    expect(screen.queryByLabelText('비밀번호')).toBeNull();
  });

  it('shows password field and solo workspace warning when clear', async () => {
    getDeleteAccountStatus.mockResolvedValue({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [{ id: 'ws2', name: '내 워크스페이스' }],
    });
    const user = userEvent.setup();

    render(<DeleteAccountSection />);
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));

    await waitFor(() => expect(screen.getByLabelText('비밀번호')).toBeDefined());
    expect(screen.getByText('내 워크스페이스')).toBeDefined();
  });

  it('calls deleteAccountAction and signOut on successful submit', async () => {
    getDeleteAccountStatus.mockResolvedValue({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [],
    });
    deleteAccountAction.mockResolvedValue({ ok: true });
    signOut.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<DeleteAccountSection />);
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));
    await waitFor(() => expect(screen.getByLabelText('비밀번호')).toBeDefined());

    await user.type(screen.getByLabelText('비밀번호'), 'my-password');
    await user.click(screen.getByRole('button', { name: '탈퇴 확인' }));

    await waitFor(() =>
      expect(deleteAccountAction).toHaveBeenCalledWith({ password: 'my-password' }),
    );
    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/login' }),
    );
  });

  it('shows inline error on INVALID_PASSWORD', async () => {
    getDeleteAccountStatus.mockResolvedValue({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [],
    });
    deleteAccountAction.mockResolvedValue({ ok: false, error: 'INVALID_PASSWORD' });
    const user = userEvent.setup();

    render(<DeleteAccountSection />);
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));
    await waitFor(() => expect(screen.getByLabelText('비밀번호')).toBeDefined());

    await user.type(screen.getByLabelText('비밀번호'), 'wrong');
    await user.click(screen.getByRole('button', { name: '탈퇴 확인' }));

    await waitFor(() =>
      expect(screen.getByText('비밀번호가 올바르지 않아요.')).toBeDefined(),
    );
    expect(signOut).not.toHaveBeenCalled();
  });
});
