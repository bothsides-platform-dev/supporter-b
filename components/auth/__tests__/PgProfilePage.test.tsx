/**
 * PG 가입 담당자 정보 단계 — ready 가드(초대/일반) + 제출 시 가입 완료.
 *
 * 새 흐름: 제출 = 가입 완료(미인증 유저 생성) + 자동 로그인.
 *   - 초대 경로(wsInviteToken): signupViaWorkspaceInviteAction → /home
 *   - 일반 경로: signupCompleteAction(pg) → redirectTo (가드가 /pending-approval 로)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockReplace = vi.fn();
const mockPush = vi.fn();
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

let mockDraftData: Record<string, unknown> = {};
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => mockDraftData,
  writeSignupDraft: (d: Record<string, unknown>) => { mockDraftData = d; },
  clearSignupDraft: vi.fn(),
}));

vi.mock('@/lib/stores/signup-draft', () => ({
  useSignupDraftStore: () => ({ setProfile: vi.fn() }),
}));

vi.mock('@/components/auth/PhoneVerificationField', () => ({
  PhoneVerificationField: ({ onVerified }: { onVerified: (phone: string, id: string) => void }) => (
    <button type="button" onClick={() => onVerified('01011112222', 'otp-id')}>인증 완료</button>
  ),
}));

import PgProfilePage from '@/app/(public)/signup/pg/profile/page';

describe('PgProfilePage', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockSignupComplete.mockReset();
    mockSignupInvite.mockReset();
    mockSignIn.mockReset().mockResolvedValue({ ok: true });
  });

  it('초대 경로: email + password만 있으면 wsName/bizNo 없어도 진입 허용', () => {
    mockDraftData = {
      email: 'newmember@toss.im',
      password: 'Password123!',
      wsInviteToken: 'invite-token-abc',
    };

    render(<PgProfilePage />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText('이름')).toBeInTheDocument();
  });

  it('초대 경로: stepper는 2/2를 표시한다 (verify 단계 제거)', () => {
    mockDraftData = {
      email: 'newmember@toss.im',
      password: 'Password123!',
      wsInviteToken: 'invite-token-abc',
    };

    render(<PgProfilePage />);

    const stepText = document.body.textContent ?? '';
    expect(stepText).toContain('2 / 2');
    expect(screen.queryByText('4')).not.toBeInTheDocument();
  });

  it('일반 경로: wsName/bizNo 없으면 /signup/pg로 redirect', () => {
    mockDraftData = {
      email: 'sales@toss.im',
      password: 'Password123!',
    };

    render(<PgProfilePage />);

    expect(mockReplace).toHaveBeenCalledWith('/signup/pg');
  });

  it('초대 경로 제출 → signupViaWorkspaceInviteAction + signIn + push(/home)', async () => {
    mockDraftData = {
      email: 'newmember@toss.im',
      password: 'Password123!',
      wsInviteToken: 'invite-token-abc',
    };
    mockSignupInvite.mockResolvedValue({
      ok: true,
      redirectTo: '/home',
      email: 'newmember@toss.im',
      password: 'Password123!',
    });

    const user = userEvent.setup();
    render(<PgProfilePage />);

    await user.type(screen.getByLabelText('이름'), '신규 영업');
    await user.click(screen.getByRole('button', { name: '인증 완료' }));
    await user.click(screen.getByRole('button', { name: '가입 완료' }));

    await waitFor(() => {
      expect(mockSignupInvite).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'newmember@toss.im',
          name: '신규 영업',
          wsInviteToken: 'invite-token-abc',
        }),
      );
    });
    expect(mockSignupComplete).not.toHaveBeenCalled();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/home'));
  });
});
