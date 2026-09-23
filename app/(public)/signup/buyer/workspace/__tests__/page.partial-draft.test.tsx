// Coverage: ISSUE-002 — wsName·bizProfile 이 둘 다 있을 때만 복원한다
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const draft: Record<string, unknown> = {};
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => draft,
  writeSignupDraft: vi.fn(),
}));

vi.mock('@/components/auth/SignupStepper', () => ({ SignupStepper: () => null }));
vi.mock('@/components/rfp/nts-lookup', () => ({ ntsLookup: vi.fn() }));

import BuyerWorkspacePage from '../page';

afterEach(() => {
  cleanup();
  for (const k of Object.keys(draft)) delete draft[k];
});

describe('BuyerWorkspacePage — 불완전한 draft', () => {
  it('bizProfile 없이 wsName 만 있으면 복원하지 않고 빈 폼으로 시작한다', () => {
    Object.assign(draft, { email: 'a@example.com', password: 'Qa!pass12345', wsName: '이름만상사' });
    render(<BuyerWorkspacePage />);

    expect(screen.getByPlaceholderText('(주)샘플테크')).toHaveValue('');
    expect(screen.getByLabelText('사업자 등록번호')).toHaveValue('');
    expect(screen.getByRole('button', { name: '워크스페이스 만들기' })).toBeDisabled();
  });

  it('wsName 없이 bizProfile 만 있어도 복원하지 않는다', () => {
    Object.assign(draft, {
      email: 'a@example.com',
      password: 'Qa!pass12345',
      bizProfile: { bizNo: '124-81-00998', taxType: 'general', status: 'active' },
    });
    render(<BuyerWorkspacePage />);

    expect(screen.getByLabelText('사업자 등록번호')).toHaveValue('');
    expect(screen.queryByText('✓ 확인됨')).not.toBeInTheDocument();
  });
});
