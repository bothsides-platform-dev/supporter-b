/**
 * 가입 4단계 (이메일 인증) — step 4 검증.
 * - mount 시 signupEmailAction 호출
 * - 6자리 코드 입력 → verifyEmailCodeAction → signupCompleteAction → signIn → 이동
 * - emailVerified=true draft → 자동 완료
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const mockSignupEmailAction = vi.fn();
const mockSignupCompleteAction = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  signupEmailAction: (...a: unknown[]) => mockSignupEmailAction(...a),
  signupCompleteAction: (...a: unknown[]) => mockSignupCompleteAction(...a),
}));

const mockVerifyEmailCode = vi.fn();
vi.mock('@/lib/server/actions/auth/verifyEmailCodeAction', () => ({
  verifyEmailCodeAction: (...a: unknown[]) => mockVerifyEmailCode(...a),
}));

const mockSignIn = vi.fn();
vi.mock('next-auth/react', () => ({
  signIn: (...a: unknown[]) => mockSignIn(...a),
}));

let mockDraft: Record<string, unknown> = {};
const mockWriteDraft = vi.fn((d: Record<string, unknown>) => { mockDraft = d; });
const mockClearDraft = vi.fn();
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => mockDraft,
  writeSignupDraft: (...a: unknown[]) => mockWriteDraft(a[0] as Record<string, unknown>),
  clearSignupDraft: () => mockClearDraft(),
}));

const FULL_DRAFT = {
  email: 'kim@example.com',
  password: 'Password123!',
  name: '김구매',
  phone: '01099999999',
  phoneVerificationId: 'otp-uuid',
  wsName: '(주)테스트',
  bizProfile: { bizNo: '1248100998', taxType: 'general', status: 'active' },
  workspaceType: 'buyer',
};

import BuyerVerifyPage from '@/app/(public)/signup/buyer/verify/page';

describe('BuyerVerifyPage — 이메일 인증 step 4', () => {
  beforeEach(() => {
    mockDraft = { ...FULL_DRAFT };
    mockPush.mockReset();
    mockSignupEmailAction.mockReset().mockResolvedValue({ ok: true, email: 'kim@example.com' });
    mockSignupCompleteAction.mockReset();
    mockVerifyEmailCode.mockReset();
    mockSignIn.mockReset().mockResolvedValue({ ok: true });
  });

  it('mount 시 signupEmailAction 을 호출한다', async () => {
    render(<BuyerVerifyPage />);
    await waitFor(() => {
      expect(mockSignupEmailAction).toHaveBeenCalledWith({
        email: 'kim@example.com',
        workspaceType: 'buyer',
      });
    });
  });

  it('6자리 코드 입력 후 제출 → verifyEmailCodeAction → signupCompleteAction 호출', async () => {
    mockVerifyEmailCode.mockResolvedValue({ ok: true, email: 'kim@example.com' });
    mockSignupCompleteAction.mockResolvedValue({
      ok: true,
      redirectTo: '/rfp',
      email: 'kim@example.com',
      password: 'Password123!',
    });

    const user = userEvent.setup();
    render(<BuyerVerifyPage />);
    await waitFor(() => expect(mockSignupEmailAction).toHaveBeenCalled());

    await user.type(screen.getByLabelText('인증 코드 (6자리)'), '123456');
    await user.click(screen.getByRole('button', { name: /코드로 인증하기/i }));

    await waitFor(() => {
      expect(mockVerifyEmailCode).toHaveBeenCalledWith({
        email: 'kim@example.com',
        code: '123456',
      });
    });
    await waitFor(() => {
      expect(mockSignupCompleteAction).toHaveBeenCalled();
    });
  });

  it('코드가 틀리면 에러 메시지를 표시한다', async () => {
    mockVerifyEmailCode.mockResolvedValue({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });

    const user = userEvent.setup();
    render(<BuyerVerifyPage />);
    await waitFor(() => expect(mockSignupEmailAction).toHaveBeenCalled());

    await user.type(screen.getByLabelText('인증 코드 (6자리)'), '000000');
    await user.click(screen.getByRole('button', { name: /코드로 인증하기/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockSignupCompleteAction).not.toHaveBeenCalled();
  });

  it('signupCompleteAction 성공 후 router.push 를 호출한다', async () => {
    mockVerifyEmailCode.mockResolvedValue({ ok: true, email: 'kim@example.com' });
    mockSignupCompleteAction.mockResolvedValue({
      ok: true,
      redirectTo: '/rfp',
      email: 'kim@example.com',
      password: 'Password123!',
    });

    const user = userEvent.setup();
    render(<BuyerVerifyPage />);
    await waitFor(() => expect(mockSignupEmailAction).toHaveBeenCalled());

    await user.type(screen.getByLabelText('인증 코드 (6자리)'), '123456');
    await user.click(screen.getByRole('button', { name: /코드로 인증하기/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/rfp');
    });
  });

  it('mount 시 signupEmailAction이 EMAIL_TAKEN을 반환하면 전용 안내문과 로그인 링크를 표시한다', async () => {
    mockSignupEmailAction.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });

    render(<BuyerVerifyPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('이미 가입된 이메일입니다');
    });
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
  });
});
