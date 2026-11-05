/**
 * 비밀번호 재설정 — 막힌 제출 안내.
 *
 * 가입 1단계와 같은 규칙: [변경하기]는 흐린 채 누를 수 있고, 누르면 이유를
 * 필드 아래에 보여주며 첫 문제 필드로 포커스한다. 서버 요청은 보내지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('token=raw-token'),
}));
vi.mock('next-auth/react', () => ({ signIn: vi.fn().mockResolvedValue({}) }));

const mockPasswordReset = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  passwordResetAction: (...args: unknown[]) => mockPasswordReset(...args),
}));

import ResetPasswordPage from '@/app/(public)/password/reset/page';

const CHROME_SUGGESTED_PW = 'Xk7mQ2vLpR9nT4w';

describe('ResetPasswordPage — 막힌 [변경하기] 안내', () => {
  beforeEach(() => {
    mockPasswordReset.mockReset();
    mockPasswordReset.mockResolvedValue({ ok: false, error: 'INVALID_TOKEN' });
  });

  it('특수문자만 빠진 비밀번호는 재설정 문구로 안내하고 새 비밀번호 칸으로 포커스한다', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: CHROME_SUGGESTED_PW } });
    fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: CHROME_SUGGESTED_PW } });
    const submit = screen.getByRole('button', { name: '변경하기' });
    expect(submit).toBeEnabled();
    expect(submit).toHaveClass('opacity-38');

    await user.click(submit);

    const password = screen.getByLabelText('새 비밀번호');
    await waitFor(() => expect(password).toHaveFocus());
    expect(password).toHaveAccessibleDescription(
      '특수문자(! @ # 등)를 하나 넣으면 바꿀 수 있어요. 비밀번호 확인 칸도 똑같이 바꿔요.',
    );
    expect(screen.getByText('특수문자 포함').closest('li')).toHaveAttribute('data-state', 'error');
    expect(mockPasswordReset).not.toHaveBeenCalled();
  });

  it('빈 확인 칸은 확인 칸에서 안내하고, 토큰 오류는 확인 칸이 아닌 별도 알림으로 보여준다', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'Password123!' } });

    await user.click(screen.getByRole('button', { name: '변경하기' }));

    const confirm = screen.getByLabelText('비밀번호 확인');
    await waitFor(() => expect(confirm).toHaveFocus());
    expect(confirm).toHaveAccessibleDescription('비밀번호를 한 번 더 입력해요.');
    expect(mockPasswordReset).not.toHaveBeenCalled();

    fireEvent.change(confirm, { target: { value: 'Password123!' } });
    await user.click(screen.getByRole('button', { name: '변경하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('재설정 링크가 만료되었거나 유효하지 않습니다.');
    expect(confirm).not.toHaveAttribute('aria-invalid', 'true');
  });
});
