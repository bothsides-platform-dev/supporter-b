// Coverage: ISSUE-002 — 복원된 1단계 입력으로 곧바로 다음 단계로 갈 수 있고, 불완전한 draft 는 동의를 켜지 않는다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockCheckEmail = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  checkEmailAvailableAction: (...args: unknown[]) => mockCheckEmail(...args),
}));

const draft: Record<string, unknown> = {};
const writeMock = vi.fn();
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => ({ ...draft }),
  writeSignupDraft: (d: unknown) => writeMock(d),
}));

vi.mock('@/lib/stores/signup-draft', () => ({
  useSignupDraftStore: () => ({
    setEmail: vi.fn(),
    setAgreedAt: vi.fn(),
    setWorkspaceType: vi.fn(),
  }),
}));

import BuyerSignupEmailPage from '../page';

beforeEach(() => {
  mockPush.mockReset();
  writeMock.mockReset();
  mockCheckEmail.mockReset();
  mockCheckEmail.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  for (const k of Object.keys(draft)) delete draft[k];
});

describe('BuyerSignupEmailPage — 복원된 입력으로 진행', () => {
  it('복원된 값만으로 다음을 누르면 2단계로 가고 이후 단계 draft(wsName·bizProfile)를 보존한다', async () => {
    Object.assign(draft, {
      workspaceType: 'buyer',
      email: 'back@example.com',
      password: 'Qa!pass12345',
      agreedAt: '2026-09-23T00:00:00.000Z',
      wsName: '뒤로가기상사',
      bizProfile: { bizNo: '124-81-00998', taxType: 'general', status: 'active' },
    });
    const user = userEvent.setup();
    render(<BuyerSignupEmailPage />);

    await user.click(await screen.findByRole('button', { name: '다음' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/signup/buyer/workspace'));
    expect(mockCheckEmail).toHaveBeenCalledWith({ email: 'back@example.com' });
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'back@example.com',
        password: 'Qa!pass12345',
        workspaceType: 'buyer',
        wsName: '뒤로가기상사',
        bizProfile: { bizNo: '124-81-00998', taxType: 'general', status: 'active' },
      }),
    );
  });

  it('agreedAt 이 없는 draft 는 이메일·비밀번호만 채우고 필수 동의는 켜지 않아 진행을 막는다', async () => {
    Object.assign(draft, {
      workspaceType: 'buyer',
      email: 'noconsent@example.com',
      password: 'Qa!pass12345',
    });
    const user = userEvent.setup();
    render(<BuyerSignupEmailPage />);

    expect(await screen.findByLabelText('이메일')).toHaveValue('noconsent@example.com');
    expect(screen.getByLabelText('비밀번호 확인')).toHaveValue('Qa!pass12345');
    expect(screen.getByRole('checkbox', { name: /이용약관/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /개인정보 처리방침/ })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('workspaceType 이 없는 draft 는 채우지 않는다', async () => {
    Object.assign(draft, {
      email: 'orphan@example.com',
      password: 'Qa!pass12345',
      agreedAt: '2026-09-23T00:00:00.000Z',
    });
    render(<BuyerSignupEmailPage />);

    expect(await screen.findByLabelText('이메일')).toHaveValue('');
    expect(screen.getByLabelText('비밀번호')).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: /이용약관/ })).not.toBeChecked();
  });
});
