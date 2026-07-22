import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/**
 * 비밀번호 입력은 `userEvent.type` 대신 change 이벤트를 직접 쏜다.
 *
 * `userEvent.type` 은 대상에 포커스를 준 뒤 키 이벤트를 `document.activeElement`
 * 로 보내는데, 이 입력은 Base-UI 다이얼로그의 포커스 트랩 안에 있다. 트랩이
 * 비동기로 포커스를 팝업으로 되가져가는 경쟁에서 이기면 키 입력이 조용히
 * 유실되고(값이 `''` 로 남고 예외도 안 난다) 제출 버튼이 `!password` 로 계속
 * disabled 라 액션이 아예 호출되지 않는다. 2026-07-20 에 P0 로 기록됐던
 * `INVALID_PASSWORD` 실패(1000ms waitFor 타임아웃)가 이 유실이었고, 실측으로
 * `expect(input).toHaveFocus()` 가 떨어지는 것까지 확인했다.
 *
 * change 이벤트는 포커스와 무관하게 대상 엘리먼트로 직접 가므로 경쟁이 없다.
 * 이 컴포넌트의 onChange 는 상태 세팅뿐이라 키 단위 재현이 필요 없다.
 */
function typePassword(value: string) {
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value } });
}

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

    typePassword('my-password');
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

    typePassword('wrong');
    await user.click(screen.getByRole('button', { name: '탈퇴 확인' }));

    // 제출이 실제로 접수됐는지 먼저 확정한다. 이 단언이 있으면 재발 시
    // "입력이 안 먹었다" 와 "에러 렌더가 안 됐다" 를 구분할 수 있다 — 원래는
    // 아래 에러 단언 하나뿐이라 1000ms waitFor 타임아웃만 남았다.
    await waitFor(() =>
      expect(deleteAccountAction).toHaveBeenCalledWith({ password: 'wrong' }),
    );
    // 에러는 role 로 조회한다 — 텍스트 노드 분할에 영향받지 않고,
    // 접근성 계약(role="alert")까지 함께 고정한다.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '비밀번호가 올바르지 않아요.',
    );
    expect(signOut).not.toHaveBeenCalled();
  });
});
