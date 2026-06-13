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
  // 실제 동작과 동일하게 draft 를 비운다. finalizeSignup 성공 경로가 호출한다.
  clearSignupDraft: () => { mockDraft = {}; },
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
    mockReplace.mockReset();
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

  // 회귀: 가입 완료가 성공하면 finalizeSignup 이 clearSignupDraft 로 draft 를 비운다.
  // 라이브에서는 router.push 전이가 프로필 페이지를 한 번 더 렌더하는데, 그 렌더에서
  // draft 가 비어 ready 가 false 가 되면 가드가 /signup/buyer 로 튕겨버린다(P0 버그).
  // rerender 로 그 재렌더를 모사하고, 첫 가입 화면으로 튕기지 않음을 단언한다.
  it('가입 완료 후 draft 가 비워져도 첫 가입 화면(/signup/buyer)으로 튕기지 않는다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BuyerProfilePage />);

    await user.type(screen.getByLabelText('이름'), '김구매');
    await user.click(screen.getByRole('button', { name: 'verify-phone' }));
    await user.click(screen.getByRole('button', { name: '가입 완료' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/rfp'));

    // finalizeSignup 성공 → clearSignupDraft 로 draft 가 빈 상태에서의 재렌더.
    rerender(<BuyerProfilePage />);

    expect(mockReplace).not.toHaveBeenCalledWith('/signup/buyer');
  });

  // deny-path: 1·2단계 미완료(draft 불충분)로 프로필 단계에 직접 진입하면 첫 가입 화면으로
  // 돌려보낸다. freeze(useState 초기화) 이후에도 이 가드가 동작함을 보장한다(PgProfilePage 대칭).
  it('미완성 draft 로 직접 진입 시 /signup/buyer 로 redirect', () => {
    mockDraft = { email: 'kim@example.com', password: 'Password123!' }; // wsName/bizProfile 없음
    render(<BuyerProfilePage />);
    expect(mockReplace).toHaveBeenCalledWith('/signup/buyer');
    expect(screen.queryByLabelText('이름')).not.toBeInTheDocument();
  });
});

describe('BuyerProfilePage — cross-host redirect', () => {
  // signupCompleteAction 의 redirectTo 는 workspaceSwitchTarget 산출물이라, 가입한
  // 호스트와 워크스페이스 home 호스트가 다르면 다른 origin 절대 URL이 된다. 이를
  // router.push 로 따라가면 (app) 셸의 cross-origin redirect 를 RSC fetch 가 따라가다
  // 브라우저 CORS 로 막힌다. 절대 URL 은 전체 페이지 이동으로 처리해야 한다.
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDraft = { ...BASE_DRAFT };
    mockPush.mockReset();
    mockReplace.mockReset();
    mockSignIn.mockReset().mockResolvedValue({ ok: true });
    assign = vi.fn();
    // jsdom 의 window.location.assign 은 "not implemented" 를 던지므로 스텁으로 교체.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { host: 'partner.supporter-b.com', assign },
    });
  });

  it('redirectTo 가 다른 호스트 절대 URL이면 router.push 대신 전체 페이지 이동한다', async () => {
    mockSignupComplete.mockReset().mockResolvedValue({
      ok: true,
      redirectTo: 'https://supporter-b.com/rfp',
      email: 'kim@example.com',
      password: 'Password123!',
    });
    const user = userEvent.setup();
    render(<BuyerProfilePage />);

    await user.type(screen.getByLabelText('이름'), '김구매');
    await user.click(screen.getByRole('button', { name: 'verify-phone' }));
    await user.click(screen.getByRole('button', { name: '가입 완료' }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://supporter-b.com/rfp'),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirectTo 가 같은 호스트 상대경로면 기존대로 router.push 한다', async () => {
    mockSignupComplete.mockReset().mockResolvedValue({
      ok: true,
      redirectTo: '/rfp',
      email: 'kim@example.com',
      password: 'Password123!',
    });
    const user = userEvent.setup();
    render(<BuyerProfilePage />);

    await user.type(screen.getByLabelText('이름'), '김구매');
    await user.click(screen.getByRole('button', { name: 'verify-phone' }));
    await user.click(screen.getByRole('button', { name: '가입 완료' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/rfp'));
    expect(assign).not.toHaveBeenCalled();
  });
});
