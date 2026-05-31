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
const mockSignupViaWorkspaceInviteAction = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  signupEmailAction: (...a: unknown[]) => mockSignupEmailAction(...a),
  signupCompleteAction: (...a: unknown[]) => mockSignupCompleteAction(...a),
  signupViaWorkspaceInviteAction: (...a: unknown[]) => mockSignupViaWorkspaceInviteAction(...a),
}));

vi.mock('@/lib/server/actions/auth/verifyEmailCodeAction', () => ({
  verifyEmailCodeAction: vi.fn(),
}));

const mockSignIn = vi.fn();
vi.mock('next-auth/react', () => ({
  signIn: (...a: unknown[]) => mockSignIn(...a),
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

const INVITE_DRAFT = {
  email: 'newmember@toss.im',
  password: 'Password123!',
  name: '신규영업',
  phone: '01099998888',
  phoneVerificationId: 'otp-invite-uuid',
  wsInviteToken: 'ws-invite-token-abc',
  workspaceType: 'pg',
  // wsName, bizNo 없음 — 초대 경로
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

describe('PgVerifyPage — 워크스페이스 초대 경로 (step 3/3)', () => {
  beforeEach(() => {
    mockDraft = { ...INVITE_DRAFT };
    mockPush.mockReset();
    mockReplace.mockReset();
    mockSignupEmailAction.mockReset().mockResolvedValue({ ok: true, email: 'newmember@toss.im' });
    mockSignupViaWorkspaceInviteAction.mockReset();
    mockSignIn.mockReset().mockResolvedValue({ ok: true, error: null });
  });

  it('이메일 인증 완료 후 signupViaWorkspaceInviteAction을 호출한다', async () => {
    mockDraft = { ...INVITE_DRAFT, emailVerified: true };
    mockSignupViaWorkspaceInviteAction.mockResolvedValue({
      ok: true,
      email: 'newmember@toss.im',
      password: 'Password123!',
      redirectTo: '/home',
    });

    render(<PgVerifyPage />);

    await waitFor(() => {
      expect(mockSignupViaWorkspaceInviteAction).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'newmember@toss.im',
          wsInviteToken: 'ws-invite-token-abc',
        }),
      );
    });
  });

  it('초대 가입 성공 시 /home 으로 이동한다', async () => {
    mockDraft = { ...INVITE_DRAFT, emailVerified: true };
    mockSignupViaWorkspaceInviteAction.mockResolvedValue({
      ok: true,
      email: 'newmember@toss.im',
      password: 'Password123!',
      redirectTo: '/home',
    });

    render(<PgVerifyPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/home');
    });
    expect(mockPush).not.toHaveBeenCalledWith('/inbox');
  });

  it('초대 가입 실패 시 에러 메시지를 표시한다', async () => {
    mockDraft = { ...INVITE_DRAFT, emailVerified: true };
    mockSignupViaWorkspaceInviteAction.mockResolvedValue({
      ok: false,
      error: 'INVITE_EXPIRED',
    });

    render(<PgVerifyPage />);

    await waitFor(() => {
      // codeError 표시: "가입을 완료하지 못했습니다. (INVITE_EXPIRED)"
      expect(screen.getByRole('alert')).toHaveTextContent('INVITE_EXPIRED');
    });
  });

  it('wsInviteToken 없는 draft는 signupCompleteAction을 호출한다 (비초대 경로 유지)', async () => {
    mockDraft = { ...PG_DRAFT, emailVerified: true };
    mockSignupCompleteAction.mockResolvedValue({
      ok: true,
      email: 'sales@toss.im',
      password: 'Password123!',
      redirectTo: '/inbox',
    });

    render(<PgVerifyPage />);

    await waitFor(() => {
      expect(mockSignupCompleteAction).toHaveBeenCalledWith(
        expect.objectContaining({ wsKind: 'pg', wsName: '(주)토스페이먼츠' }),
      );
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/inbox');
    });
  });
});
