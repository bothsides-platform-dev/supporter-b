/**
 * 새 흐름: 담당자 정보(step 3) 제출 = 가입 완료(미인증 유저 생성) + 자동 로그인.
 * 이메일 인증은 가입 후 /pending-approval 에서 진행하므로 verify 페이지로 가지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const mockSignupComplete = vi.fn();
const mockSignupInvite = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  signupCompleteAction: (...a: unknown[]) => mockSignupComplete(...a),
  signupViaWorkspaceInviteAction: (...a: unknown[]) => mockSignupInvite(...a),
}));

const mockSignIn = vi.fn();
vi.mock('next-auth/react', () => ({ signIn: (...a: unknown[]) => mockSignIn(...a) }));

let mockDraft: Record<string, unknown> = {};
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => mockDraft,
  writeSignupDraft: (d: Record<string, unknown>) => { mockDraft = d; },
  clearSignupDraft: vi.fn(),
}));

vi.mock('@/lib/stores/signup-draft', () => ({
  useSignupDraftStore: () => ({ setProfile: vi.fn() }),
}));

vi.mock('@/components/auth/PhoneVerificationField', () => ({
  PhoneVerificationField: ({ onVerified }: { onVerified: (p: string, v: string) => void }) => (
    <button type="button" onClick={() => onVerified('01099999999', 'otp-uuid')}>verify-phone</button>
  ),
}));

const BASE_DRAFT = {
  email: 'kim@example.com',
  password: 'Password123!',
  wsName: '(주)테스트',
  bizProfile: { bizNo: '1248100998', taxType: 'general', status: 'active' },
  workspaceType: 'buyer',
};

import BuyerProfilePage from '@/app/(public)/signup/buyer/profile/page';

describe('BuyerProfilePage — 제출 시 가입 완료(미인증 유저 생성)', () => {
  beforeEach(() => {
    mockDraft = { ...BASE_DRAFT };
    mockPush.mockReset();
    mockSignupComplete.mockReset().mockResolvedValue({
      ok: true,
      redirectTo: '/rfp',
      email: 'kim@example.com',
      password: 'Password123!',
    });
    mockSignIn.mockReset().mockResolvedValue({ ok: true });
  });

  it('이름+전화 인증 후 제출 → signupCompleteAction(buyer) + signIn + push(redirectTo)', async () => {
    const user = userEvent.setup();
    render(<BuyerProfilePage />);

    await user.type(screen.getByLabelText('이름'), '김구매');
    await user.click(screen.getByRole('button', { name: 'verify-phone' }));
    await user.click(screen.getByRole('button', { name: '가입 완료' }));

    await waitFor(() => {
      expect(mockSignupComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'kim@example.com',
          name: '김구매',
          wsKind: 'buyer',
          wsName: '(주)테스트',
        }),
      );
    });
    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/rfp'));
  });
});
