import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Suspense } from 'react';

// next/navigation 모킹 — useRouter와 useSearchParams 제어
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

// verifyEmailAction 모킹
const mockVerifyEmailAction = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  verifyEmailAction: (...args: unknown[]) => mockVerifyEmailAction(...args),
}));

// readSignupDraft 모킹 (token=null 분기에서 사용)
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => ({ email: '' }),
}));

// ResendCountdown 모킹
vi.mock('@/components/auth/ResendCountdown', () => ({
  ResendCountdown: () => null,
}));

// EnvelopeSvg 모킹
vi.mock('@/components/auth/EnvelopeSvg', () => ({
  EnvelopeSvg: () => null,
}));

// 동적 import
let AuthVerifyPage: React.ComponentType;

beforeEach(async () => {
  vi.resetModules();
  mockPush.mockReset();
  mockVerifyEmailAction.mockReset();
  // searchParams 초기화
  mockSearchParams.delete('token');
  mockSearchParams.delete('email');

  const mod = await import('../page');
  AuthVerifyPage = mod.default;
});

function renderPage() {
  return render(
    <Suspense fallback={null}>
      <AuthVerifyPage />
    </Suspense>,
  );
}

describe('AuthVerifyPage — token 있는 경우', () => {
  it('verifyEmailAction 성공 시 /pending-approval 로 이동', async () => {
    mockSearchParams.set('token', 'valid-token-abc');
    mockVerifyEmailAction.mockResolvedValue({ ok: true, email: 'test@example.com' });

    renderPage();

    await waitFor(() => {
      expect(mockVerifyEmailAction).toHaveBeenCalledWith('valid-token-abc');
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/pending-approval');
    });
  });

  it('verifyEmailAction 실패 시 만료 메시지를 보여주고 리다이렉트하지 않음', async () => {
    mockSearchParams.set('token', 'expired-token');
    mockVerifyEmailAction.mockResolvedValue({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/만료/)).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('verifyEmailAction 이 reject 되면(네트워크 오류) 오류 문구와 다시 시도 버튼을 보여준다', async () => {
    mockSearchParams.set('token', 'net-fail-token');
    mockVerifyEmailAction.mockRejectedValue(new TypeError('Failed to fetch'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/일시적인 오류/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('다시 시도 클릭 시 재검증하고, 성공하면 /pending-approval 로 이동', async () => {
    mockSearchParams.set('token', 'net-then-ok');
    mockVerifyEmailAction
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, email: 'test@example.com' });

    renderPage();

    const retryBtn = await screen.findByRole('button', { name: /다시 시도/ });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockVerifyEmailAction).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenCalledWith('/pending-approval');
    });
  });

  it('다시 시도가 또 실패해도(연속 reject) 오류 화면을 유지한다', async () => {
    mockSearchParams.set('token', 'net-then-net');
    mockVerifyEmailAction.mockRejectedValue(new TypeError('Failed to fetch'));

    renderPage();

    const retryBtn = await screen.findByRole('button', { name: /다시 시도/ });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockVerifyEmailAction).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText(/일시적인 오류/)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
