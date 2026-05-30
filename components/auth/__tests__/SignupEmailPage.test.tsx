/**
 * 가입 1단계 (계정) — 이메일 + 비밀번호 + 약관.
 *
 * 새 흐름: 이메일 발송은 step 4 에서 이뤄지므로 step 1 페이지는 서버 액션을
 * 호출하지 않는다. draft 저장 후 step 2 로 이동한다.
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

vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => ({}),
  writeSignupDraft: (...args: unknown[]) => mockWriteDraft(...args),
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
    mockPush.mockReset();
    mockWriteDraft.mockReset();
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
});

describe('PgSignupEmailPage — 새 step 1 흐름', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockWriteDraft.mockReset();
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
});
