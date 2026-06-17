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
  // 실제 동작과 동일하게 draft 를 비운다. finalizeSignup 성공 경로가 호출한다.
  clearSignupDraft: () => { mockDraftData = {}; },
  // 테스트 환경에서는 sessionStorage 가 정상 작동한다고 가정.
  isSignupStorageAvailable: () => true,
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

  it('canonical PG 선택 경로: selectedPgWorkspaceId만 있으면 wsName/bizNo 없어도 진입 허용', () => {
    mockDraftData = {
      email: 'sales@toss.im',
      password: 'Password123!',
      selectedPgWorkspaceId: 'ws-tosspayments-uuid',
    };

    render(<PgProfilePage />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText('이름')).toBeInTheDocument();
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

  // 회귀: 가입 완료 성공 후 clearSignupDraft 로 draft 가 비면, 재렌더 시 ready 가 false 가
  // 되어 가드가 /signup/pg 로 튕긴다(buyer 와 동일 P0 버그). 튕기지 않아야 한다.
  it('가입 완료 후 draft 가 비워져도 /signup/pg 로 튕기지 않는다', async () => {
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
    const { rerender } = render(<PgProfilePage />);

    await user.type(screen.getByLabelText('이름'), '신규 영업');
    await user.click(screen.getByRole('button', { name: '인증 완료' }));
    await user.click(screen.getByRole('button', { name: '가입 완료' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/home'));

    rerender(<PgProfilePage />);

    expect(mockReplace).not.toHaveBeenCalledWith('/signup/pg');
  });
});

describe('PgProfilePage — cross-host redirect', () => {
  // 일반 PG 가입의 redirectTo 는 workspaceSwitchTarget 산출물이라, 가입한 호스트와
  // PG home 호스트(partner)가 다르면 다른 origin 절대 URL이 된다. router.push 로
  // 따라가면 (app) 셸의 cross-origin redirect 를 RSC fetch 가 따라가다 CORS 로 막힌다.
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockSignupComplete.mockReset();
    mockSignupInvite.mockReset();
    mockSignIn.mockReset().mockResolvedValue({ ok: true });
    mockDraftData = {
      email: 'sales@toss.im',
      password: 'Password123!',
      workspaceType: 'pg',
      wsName: '토스페이먼츠',
      bizNo: '1234567890',
    };
    assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { host: 'supporter-b.com', assign },
    });
  });

  it('redirectTo 가 다른 호스트 절대 URL이면 router.push 대신 전체 페이지 이동한다', async () => {
    mockSignupComplete.mockResolvedValue({
      ok: true,
      redirectTo: 'https://partner.supporter-b.com/home',
      email: 'sales@toss.im',
      password: 'Password123!',
    });
    const user = userEvent.setup();
    render(<PgProfilePage />);

    await user.type(screen.getByLabelText('이름'), '신규 영업');
    await user.click(screen.getByRole('button', { name: '인증 완료' }));
    await user.click(screen.getByRole('button', { name: '가입 완료' }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://partner.supporter-b.com/home'),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirectTo 가 같은 호스트 상대경로면 기존대로 router.push 한다', async () => {
    mockSignupComplete.mockResolvedValue({
      ok: true,
      redirectTo: '/pending-approval',
      email: 'sales@toss.im',
      password: 'Password123!',
    });
    const user = userEvent.setup();
    render(<PgProfilePage />);

    await user.type(screen.getByLabelText('이름'), '신규 영업');
    await user.click(screen.getByRole('button', { name: '인증 완료' }));
    await user.click(screen.getByRole('button', { name: '가입 완료' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/pending-approval'));
    expect(assign).not.toHaveBeenCalled();
  });
});
