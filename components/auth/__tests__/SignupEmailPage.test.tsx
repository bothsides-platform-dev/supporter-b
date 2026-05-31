/**
 * 가입 1단계 (계정) — 이메일 + 비밀번호 + 약관.
 *
 * 새 흐름: 제출 시 checkEmailAvailableAction으로 중복 체크.
 * - 사용 가능한 이메일 → draft 저장 후 step 2 이동.
 * - EMAIL_TAKEN → 에러 문구 + 로그인 링크 표시, 이동하지 않음.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const mockWriteDraft = vi.fn();
vi.mock('@/lib/stores/signup-draft', () => ({
  useSignupDraftStore: () => ({
    setEmail: vi.fn(),
    setAgreedAt: vi.fn(),
    setWorkspaceType: vi.fn(),
  }),
}));

let mockDraftData: Record<string, unknown> = {};
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => mockDraftData,
  writeSignupDraft: (...args: unknown[]) => mockWriteDraft(...args),
}));

const mockCheckEmailAvailable = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  checkEmailAvailableAction: (...args: unknown[]) => mockCheckEmailAvailable(...args),
}));

import BuyerSignupEmailPage from '@/app/(public)/signup/buyer/page';
import PgSignupEmailPage from '@/app/(public)/signup/pg/page';

const VALID_PW = 'Password123!';

async function fillAndSubmit({
  email = 'kim@example.com',
  password = VALID_PW,
} = {}) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('이메일'), email);
  // PasswordField uses type="password" so getByLabelText is more reliable
  await user.type(screen.getByLabelText('비밀번호'), password);
  await user.type(screen.getByLabelText('비밀번호 확인'), password);
  // 약관 동의
  await user.click(screen.getByRole('checkbox', { name: /이용약관 동의/i }));
  await user.click(screen.getByRole('checkbox', { name: /개인정보 처리방침 동의/i }));
  // submit
  const form = document.querySelector('form')!;
  fireEvent.submit(form);
  await new Promise((r) => setTimeout(r, 0));
}

describe('BuyerSignupEmailPage — 새 step 1 흐름', () => {
  beforeEach(() => {
    mockDraftData = {}; // 비초대 경로
    mockPush.mockReset();
    mockReplace.mockReset();
    mockWriteDraft.mockReset();
    mockCheckEmailAvailable.mockReset();
    // 기본: 사용 가능한 이메일
    mockCheckEmailAvailable.mockResolvedValue({ ok: true });
    render(<BuyerSignupEmailPage />);
  });

  it('이메일, 비밀번호, 비밀번호 확인, 약관 필드가 표시된다', () => {
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호 확인')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /이용약관 동의/i })).toBeInTheDocument();
  });

  it('정상 입력 후 draft 저장 + step 2 (workspace)로 이동한다', async () => {
    await fillAndSubmit();
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/signup/buyer/workspace');
    });
    expect(mockWriteDraft).toHaveBeenCalled();
    const drafted = mockWriteDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(drafted.email).toBe('kim@example.com');
    expect(drafted.password).toBe(VALID_PW);
    expect(drafted.workspaceType).toBe('buyer');
  });

  it('약관 미동의 시 이동하지 않는다', async () => {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('이메일'), 'kim@example.com');
    await user.type(screen.getByLabelText('비밀번호'), VALID_PW);
    await user.type(screen.getByLabelText('비밀번호 확인'), VALID_PW);
    // 약관 미동의 — submit
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('이미 가입된 이메일 제출 시 에러 문구와 로그인 링크를 표시하고 이동하지 않는다', async () => {
    mockCheckEmailAvailable.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });
    await fillAndSubmit({ email: 'taken@example.com' });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('이미 가입된 이메일입니다');
    });
    // 에러 문구 내 로그인 링크 (정확한 텍스트 '로그인'만 매칭)
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockWriteDraft).not.toHaveBeenCalled();
  });
});

describe('PgSignupEmailPage — 새 step 1 흐름', () => {
  beforeEach(() => {
    mockDraftData = {}; // 비초대 경로
    mockPush.mockReset();
    mockReplace.mockReset();
    mockWriteDraft.mockReset();
    mockCheckEmailAvailable.mockReset();
    mockCheckEmailAvailable.mockResolvedValue({ ok: true });
    render(<PgSignupEmailPage />);
  });

  it('정상 입력 후 pg workspace 단계로 이동한다', async () => {
    await fillAndSubmit({ email: 'sales@toss.im' });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/signup/pg/workspace');
    });
    const drafted = mockWriteDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(drafted.workspaceType).toBe('pg');
  });

  it('이미 가입된 이메일 제출 시 에러 문구와 로그인 링크를 표시하고 이동하지 않는다', async () => {
    mockCheckEmailAvailable.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });
    await fillAndSubmit({ email: 'taken@example.com' });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('이미 가입된 이메일입니다');
    });
    // 에러 문구 내 로그인 링크 (정확한 텍스트 '로그인'만 매칭)
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockWriteDraft).not.toHaveBeenCalled();
  });
});

describe('PgSignupEmailPage — 초대 모드 (wsInviteToken in draft)', () => {
  const INVITE_DRAFT = {
    wsInviteToken: 'ws-invite-token-xyz',
    email: 'sales@toss.im',
    inviteWorkspaceName: 'TossPayments PG',
    workspaceType: 'pg',
  };

  beforeEach(() => {
    mockDraftData = { ...INVITE_DRAFT };
    mockPush.mockReset();
    mockReplace.mockReset();
    mockWriteDraft.mockReset();
    mockCheckEmailAvailable.mockReset();
    mockCheckEmailAvailable.mockResolvedValue({ ok: true });
  });

  it('초대 이메일이 prefill되어 readOnly 표시된다', () => {
    render(<PgSignupEmailPage />);
    const emailInput = screen.getByLabelText('이메일') as HTMLInputElement;
    expect(emailInput.value).toBe('sales@toss.im');
    expect(emailInput.readOnly).toBe(true);
  });

  it('초대 워크스페이스 이름이 안내문에 표시된다', () => {
    render(<PgSignupEmailPage />);
    expect(screen.getByText('TossPayments PG')).toBeInTheDocument();
  });

  it('정상 제출 시 workspace 단계를 건너뛰고 profile로 이동한다', async () => {
    render(<PgSignupEmailPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('비밀번호'), 'Password123!');
    await user.type(screen.getByLabelText('비밀번호 확인'), 'Password123!');
    await user.click(screen.getByRole('checkbox', { name: /이용약관 동의/i }));
    await user.click(screen.getByRole('checkbox', { name: /개인정보 처리방침 동의/i }));
    fireEvent.submit(document.querySelector('form')!);
    await new Promise((r) => setTimeout(r, 0));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/signup/pg/profile');
    });
    expect(mockPush).not.toHaveBeenCalledWith('/signup/pg/workspace');
  });

  it('초대 EMAIL_TAKEN 시 /login?next=/invite/workspace/<token> 으로 redirect한다', async () => {
    mockCheckEmailAvailable.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });
    render(<PgSignupEmailPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('비밀번호'), 'Password123!');
    await user.type(screen.getByLabelText('비밀번호 확인'), 'Password123!');
    await user.click(screen.getByRole('checkbox', { name: /이용약관 동의/i }));
    await user.click(screen.getByRole('checkbox', { name: /개인정보 처리방침 동의/i }));
    fireEvent.submit(document.querySelector('form')!);
    await new Promise((r) => setTimeout(r, 0));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining('/login?next='),
      );
      const callArg = mockReplace.mock.calls[0][0] as string;
      expect(callArg).toContain('ws-invite-token-xyz');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
