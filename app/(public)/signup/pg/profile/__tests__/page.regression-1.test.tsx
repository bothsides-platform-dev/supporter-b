// Regression: ISSUE-001 — 이름 오류 문구가 이름을 입력한 뒤에도 남아 있었다(구매사 가입과 같은 결함)
// Found by /qa on 2026-09-23
// Report: .gstack/qa-reports/qa-report-lvh-me-2026-09-23.md
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => ({
    email: 'pg@example.com',
    password: 'pw-123456',
    wsName: 'PG사',
    bizNo: '1234567890',
  }),
  writeSignupDraft: vi.fn(),
  isSignupStorageAvailable: () => true,
}));

vi.mock('@/lib/stores/signup-draft', () => ({
  useSignupDraftStore: () => ({ setProfile: vi.fn() }),
}));

vi.mock('@/components/auth/SignupStepper', () => ({
  SignupStepper: () => null,
}));

vi.mock('@/components/auth/PhoneVerificationField', () => ({
  PhoneVerificationField: () => null,
}));

vi.mock('@/lib/auth/finalize-signup', () => ({
  finalizeSignup: vi.fn(),
}));

import PgProfilePage from '../page';

afterEach(() => cleanup());

describe('PgProfilePage — 이름 오류 문구', () => {
  it('빈 이름으로 제출해 뜬 오류는 이름을 입력하면 사라진다', async () => {
    const user = userEvent.setup();
    render(<PgProfilePage />);

    await user.click(screen.getByRole('button', { name: '가입 완료' }));
    expect(screen.getByText('이름을 입력해주세요.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('이름'), '김피지');
    expect(screen.queryByText('이름을 입력해주세요.')).not.toBeInTheDocument();
  });
});
