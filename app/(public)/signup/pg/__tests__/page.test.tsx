import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockCheckEmail = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  checkEmailAvailableAction: (...args: unknown[]) => mockCheckEmail(...args),
}));

const mockReadDraft = vi.fn();
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => mockReadDraft(),
  writeSignupDraft: vi.fn(),
}));

vi.mock('@/lib/stores/signup-draft', () => ({
  useSignupDraftStore: () => ({
    setEmail: vi.fn(),
    setAgreedAt: vi.fn(),
    setWorkspaceType: vi.fn(),
  }),
}));

import PgSignupEmailPage from '../page';

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockCheckEmail.mockReset();
  mockReadDraft.mockReturnValue({});
});

afterEach(() => cleanup());

describe('PgSignupEmailPage — 이메일 blur 중복 검사 (비초대)', () => {
  it('취득 이메일 blur 시 "이미 가입된 이메일입니다." 에러를 노출한다', async () => {
    mockCheckEmail.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });
    const user = userEvent.setup();
    render(<PgSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'taken@example.com');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/이미 가입된 이메일입니다/)).toBeInTheDocument();
    });
    expect(mockCheckEmail).toHaveBeenCalledWith({ email: 'taken@example.com' });
  });

  it('마스터/운영자 이메일 blur 시 "가입할 수 없어요" 안내를 노출한다', async () => {
    mockCheckEmail.mockResolvedValue({ ok: false, error: 'MASTER_EMAIL' });
    const user = userEvent.setup();
    render(<PgSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'op@supporter-b.com');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/이 이메일로는 가입할 수 없어요/)).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('유효하지 않은 포맷 blur 시 checkEmailAvailableAction을 호출하지 않는다', async () => {
    const user = userEvent.setup();
    render(<PgSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'not-an-email');
    await user.tab();

    await new Promise((r) => setTimeout(r, 30));
    expect(mockCheckEmail).not.toHaveBeenCalled();
  });

  it('취득 이메일 상태에서 다음 클릭 시 에러가 유지되고 페이지 이동이 없다', async () => {
    mockCheckEmail.mockResolvedValue({ ok: false, error: 'EMAIL_TAKEN' });
    const user = userEvent.setup();
    render(<PgSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'taken@example.com');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/이미 가입된 이메일입니다/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByText(/이미 가입된 이메일입니다/)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('PgSignupEmailPage — 초대 경로 blur 검사 스킵', () => {
  it('초대(readOnly) 이메일 blur 시 checkEmailAvailableAction을 호출하지 않는다', async () => {
    mockReadDraft.mockReturnValue({
      wsInviteToken: 'inv-token',
      email: 'invited@example.com',
      inviteWorkspaceName: '테스트 Corp',
    });
    const user = userEvent.setup();
    render(<PgSignupEmailPage />);

    const emailInput = screen.getByLabelText('이메일');
    await user.click(emailInput);
    await user.tab();

    await new Promise((r) => setTimeout(r, 30));
    expect(mockCheckEmail).not.toHaveBeenCalled();
  });

  it('초대 유입 시 회사 이메일 권장 안내를 렌더하지 않는다', () => {
    mockReadDraft.mockReturnValue({
      wsInviteToken: 'inv-token',
      email: 'invited@gmail.com',
      inviteWorkspaceName: '테스트 Corp',
    });
    render(<PgSignupEmailPage />);

    expect(screen.queryByText(/별도 심사 과정이 추가될 수 있어요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/회사 이메일을 입력해주세요/)).not.toBeInTheDocument();
  });
});

describe('PgSignupEmailPage — 회사 이메일 권장 안내 (비초대)', () => {
  it('무료 도메인 입력 시 개인 이메일 경고로 전환한다', async () => {
    const user = userEvent.setup();
    render(<PgSignupEmailPage />);

    expect(screen.getByText('회사 이메일을 입력해주세요')).toBeInTheDocument();

    await user.type(screen.getByLabelText('이메일'), 'kim@naver.com');

    expect(screen.getByText(/별도 심사 과정이 추가될 수 있어요/)).toBeInTheDocument();
  });

  it('마스터/운영자 이메일 에러가 표시되면 안내를 숨긴다', async () => {
    mockCheckEmail.mockResolvedValue({ ok: false, error: 'MASTER_EMAIL' });
    const user = userEvent.setup();
    render(<PgSignupEmailPage />);

    await user.type(screen.getByLabelText('이메일'), 'op@gmail.com');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/이 이메일로는 가입할 수 없어요/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/별도 심사 과정이 추가될 수 있어요/)).not.toBeInTheDocument();
    expect(screen.queryByText('회사 이메일을 입력해주세요')).not.toBeInTheDocument();
  });
});
