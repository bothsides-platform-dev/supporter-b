// Regression: ISSUE-002 — 2단계에서 뒤로 오면 1단계 입력(이메일·비밀번호·필수 동의)이 전부 비어 있었다
// Found by /qa on 2026-09-23
// Report: .gstack/qa-reports/qa-report-lvh-me-2026-09-23.md
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/server/actions/auth', () => ({
  checkEmailAvailableAction: vi.fn(),
}));

const draft: Record<string, unknown> = {};
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => draft,
  writeSignupDraft: vi.fn(),
}));

vi.mock('@/lib/stores/signup-draft', () => ({
  useSignupDraftStore: () => ({
    setEmail: vi.fn(),
    setAgreedAt: vi.fn(),
    setWorkspaceType: vi.fn(),
  }),
}));

import BuyerSignupEmailPage from '../page';

afterEach(() => {
  cleanup();
  for (const k of Object.keys(draft)) delete draft[k];
});

describe('BuyerSignupEmailPage — 뒤로 왔을 때 입력 복원', () => {
  it('draft 에 저장된 이메일·비밀번호·필수 동의를 다시 채운다', async () => {
    Object.assign(draft, {
      workspaceType: 'buyer',
      email: 'back@example.com',
      password: 'Qa!pass12345',
      agreedAt: '2026-09-23T00:00:00.000Z',
    });
    render(<BuyerSignupEmailPage />);

    expect(await screen.findByLabelText('이메일')).toHaveValue('back@example.com');
    expect(screen.getByLabelText('비밀번호')).toHaveValue('Qa!pass12345');
    expect(screen.getByLabelText('비밀번호 확인')).toHaveValue('Qa!pass12345');
    expect(screen.getByRole('checkbox', { name: /이용약관/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /개인정보 처리방침/ })).toBeChecked();
    // 마케팅 동의는 draft 에 없으므로 켜지 않는다.
    expect(screen.getByRole('checkbox', { name: /마케팅/ })).not.toBeChecked();
  });

  it('PG 가입 draft 는 구매사 1단계에 채우지 않는다', async () => {
    Object.assign(draft, {
      workspaceType: 'pg',
      email: 'pg@example.com',
      password: 'Qa!pass12345',
      agreedAt: '2026-09-23T00:00:00.000Z',
    });
    render(<BuyerSignupEmailPage />);

    expect(await screen.findByLabelText('이메일')).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: /이용약관/ })).not.toBeChecked();
  });
});
