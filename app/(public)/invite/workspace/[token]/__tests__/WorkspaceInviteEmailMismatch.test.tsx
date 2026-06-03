import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const signOut = vi.fn();
vi.mock('next-auth/react', () => ({
  signOut: (...a: unknown[]) => signOut(...a),
}));

import { WorkspaceInviteEmailMismatch } from '../WorkspaceInviteEmailMismatch';

beforeEach(() => {
  signOut.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('WorkspaceInviteEmailMismatch', () => {
  const token = 'test-token-abc';
  const inviteEmail = 'invited@example.com';

  it('초대 이메일을 안내 문구에 표시한다', () => {
    render(<WorkspaceInviteEmailMismatch inviteEmail={inviteEmail} token={token} />);
    expect(screen.getByText(inviteEmail)).toBeDefined();
  });

  it('"로그아웃하고 계속하기" 버튼을 렌더링한다', () => {
    render(<WorkspaceInviteEmailMismatch inviteEmail={inviteEmail} token={token} />);
    expect(screen.getByRole('button', { name: /로그아웃하고 계속하기/ })).toBeDefined();
  });

  it('버튼 클릭 시 올바른 callbackUrl로 signOut을 호출한다', async () => {
    signOut.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<WorkspaceInviteEmailMismatch inviteEmail={inviteEmail} token={token} />);
    await user.click(screen.getByRole('button', { name: /로그아웃하고 계속하기/ }));

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({
        redirect: true,
        callbackUrl: `/invite/workspace/${token}`,
      }),
    );
  });

  it('버튼 클릭 후 로딩 상태로 비활성화된다', async () => {
    signOut.mockImplementation(() => new Promise(() => {})); // never resolves
    const user = userEvent.setup();

    render(<WorkspaceInviteEmailMismatch inviteEmail={inviteEmail} token={token} />);
    await user.click(screen.getByRole('button', { name: /로그아웃하고 계속하기/ }));

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /로그아웃하고 계속하기|LOADING/ }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
  });

  it('signOut 실패 시 로딩 상태가 해제되어 버튼이 다시 활성화된다', async () => {
    signOut.mockRejectedValue(new Error('network error'));
    const user = userEvent.setup();

    render(<WorkspaceInviteEmailMismatch inviteEmail={inviteEmail} token={token} />);
    await user.click(screen.getByRole('button', { name: /로그아웃하고 계속하기/ }));

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /로그아웃하고 계속하기/ }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });
});
