/**
 * 비밀번호 찾기 — [재발송]이 실제로 메일을 다시 요청하는지.
 *
 * 예전에는 `onResend={() => {}}` 라 60초를 기다려 눌러도 숫자만 다시 셌다.
 * 발송 여부·한도 판정은 서버(passwordForgotAction)가 하므로 화면은 같은 이메일로
 * 같은 액션을 다시 부르기만 한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const mockPasswordForgot = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  passwordForgotAction: (...args: unknown[]) => mockPasswordForgot(...args),
}));

import ForgotPasswordPage from '@/app/(public)/password/forgot/page';

async function submitEmail(email: string) {
  render(<ForgotPasswordPage />);
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: email } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '재설정 링크 받기' }));
  });
}

async function waitOutCountdown() {
  // ResendCountdown 은 1초마다 다음 타이머를 건다 — 한 번에 60초를 넘기면 첫 타이머만 돈다.
  for (let i = 0; i < 60; i++) {
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  }
}

describe('ForgotPasswordPage — 재발송', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPasswordForgot.mockReset();
    mockPasswordForgot.mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('대기 시간이 끝난 뒤 [재발송]을 누르면 같은 이메일로 다시 요청한다', async () => {
    await submitEmail('kim@example.com');
    expect(mockPasswordForgot).toHaveBeenCalledTimes(1);

    await waitOutCountdown();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '재발송' }));
    });

    expect(mockPasswordForgot).toHaveBeenCalledTimes(2);
    expect(mockPasswordForgot).toHaveBeenLastCalledWith({ email: 'kim@example.com' });
  });

  it('재발송 요청이 실패해도 확인 화면을 유지한다', async () => {
    await submitEmail('kim@example.com');
    mockPasswordForgot.mockRejectedValueOnce(new Error('network'));

    await waitOutCountdown();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '재발송' }));
    });

    expect(screen.getByText('재설정 링크를 보냈습니다')).toBeInTheDocument();
  });
});
