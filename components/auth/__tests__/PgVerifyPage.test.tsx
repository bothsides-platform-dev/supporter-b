/**
 * PG 가입 4단계 (이메일 인증) — step 4 검증.
 * Buyer 변형과 동일한 구조이나 workspaceType='pg', bizNo 필드를 사용.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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

vi.mock('@/lib/server/actions/auth/verifyEmailCodeAction', () => ({
  verifyEmailCodeAction: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}));

let mockDraft: Record<string, unknown> = {};
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => mockDraft,
  writeSignupDraft: vi.fn(),
  clearSignupDraft: vi.fn(),
}));

const PG_DRAFT = {
  email: 'sales@toss.im',
  password: 'Password123!',
  name: '김영업',
  phone: '01011112222',
  phoneVerificationId: 'otp-uuid',
  wsName: '(주)토스페이먼츠',
  bizNo: '1248100998',
  workspaceType: 'pg',
};

import PgVerifyPage from '@/app/(public)/signup/pg/verify/page';

describe('PgVerifyPage — 이메일 인증 step 4', () => {
  beforeEach(() => {
    mockDraft = { ...PG_DRAFT };
    mockPush.mockReset();
    mockSignupEmailAction.mockReset().mockResolvedValue({ ok: true, email: 'sales@toss.im' });
    mockSignupCompleteAction.mockReset();
  });

  it('mount 시 signupEmailAction 을 호출한다 (workspaceType=pg)', async () => {
    render(<PgVerifyPage />);
    await waitFor(() => {
      expect(mockSignupEmailAction).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'sales@toss.im', workspaceType: 'pg' }),
      );
    });
  });

  it('mount 시 signupEmailAction이 EMAIL_TAKEN을 반환하면 전용 안내문과 로그인 링크를 표시한다', async () => {
    mockSignupEmailAction.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });

    render(<PgVerifyPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('이미 가입된 이메일입니다');
    });
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
  });

  it('일반 실패 시 기존 에러 문구를 표시한다', async () => {
    mockSignupEmailAction.mockResolvedValue({ ok: false, error: 'SOME_ERROR' });

    render(<PgVerifyPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('인증 메일을 보내지 못했습니다');
    });
  });
});
