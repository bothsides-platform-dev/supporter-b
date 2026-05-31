import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/lib/server/actions/auth', () => ({
  loginAction: vi
    .fn()
    .mockResolvedValue({ ok: false, error: 'INVALID_CREDENTIALS' }),
}));

import LoginPage from '@/app/(public)/login/page';

describe('LoginPage — 이메일 프리필', () => {
  beforeEach(() => {
    mockSearchParams.delete('email');
    mockSearchParams.delete('next');
    if (typeof window !== 'undefined') window.localStorage.clear();
  });

  it('?email 파라미터가 없으면 이메일 필드가 비어있다', () => {
    render(<LoginPage />);
    const input = screen.getByLabelText('이메일') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('?email 파라미터가 있으면 이메일 필드에 값이 채워진다', () => {
    mockSearchParams.set('email', 'kim@example.com');
    render(<LoginPage />);
    const input = screen.getByLabelText('이메일') as HTMLInputElement;
    expect(input.value).toBe('kim@example.com');
  });
});

describe('LoginPage — 실패 카운트 / 락 mock', () => {
  beforeEach(() => {
    mockSearchParams.delete('email');
    mockSearchParams.delete('next');
    if (typeof window !== 'undefined') window.localStorage.clear();
  });

  async function failOnce(): Promise<void> {
    const submit = screen.getByRole('button', { name: '로그인' });
    fireEvent.click(submit);
    await waitFor(() => {
      const lockBox = screen.queryByTestId('login-lock');
      if (lockBox) return;
      const err = screen.queryByText(/확인해요|잠겼어요/);
      expect(err).not.toBeNull();
    });
  }

  it('10회 실패 전까지는 락 박스가 노출되지 않는다', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'kim@example.com' },
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'whatever' },
    });

    for (let i = 1; i <= 9; i++) {
      await failOnce();
    }
    expect(screen.queryByTestId('login-lock')).toBeNull();
  });

  it('10회 실패 시 락 박스가 노출되고 버튼이 disabled', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'kim@example.com' },
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'whatever' },
    });
    for (let i = 1; i <= 10; i++) {
      await failOnce();
    }
    expect(screen.getByTestId('login-lock')).toBeDefined();
    expect(
      (screen.getByRole('button', {
        name: '로그인',
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
