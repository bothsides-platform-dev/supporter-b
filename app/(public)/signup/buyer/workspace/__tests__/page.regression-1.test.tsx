// Regression: ISSUE-002 — 3단계에서 뒤로 오면 워크스페이스 이름과 국세청 조회 결과가 사라져 다시 조회해야 했다
// Found by /qa on 2026-09-23
// Report: .gstack/qa-reports/qa-report-lvh-me-2026-09-23.md
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

const draft: Record<string, unknown> = {};
const writeMock = vi.fn();
vi.mock('@/lib/auth/signup-storage', () => ({
  readSignupDraft: () => draft,
  writeSignupDraft: (d: unknown) => writeMock(d),
}));

vi.mock('@/components/auth/SignupStepper', () => ({
  SignupStepper: () => null,
}));

vi.mock('@/components/rfp/nts-lookup', () => ({
  ntsLookup: vi.fn(),
}));

import BuyerWorkspacePage from '../page';

afterEach(() => {
  cleanup();
  mockPush.mockReset();
  writeMock.mockReset();
  for (const k of Object.keys(draft)) delete draft[k];
});

describe('BuyerWorkspacePage — 뒤로 왔을 때 입력 복원', () => {
  it('draft 의 워크스페이스 이름과 조회 결과를 복원해 바로 다음 단계로 갈 수 있다', async () => {
    Object.assign(draft, {
      email: 'back@example.com',
      password: 'Qa!pass12345',
      wsName: '뒤로가기상사',
      bizProfile: { bizNo: '124-81-00998', taxType: 'general', status: 'active' },
    });
    const user = userEvent.setup();
    render(<BuyerWorkspacePage />);

    expect(screen.getByPlaceholderText('(주)샘플테크')).toHaveValue('뒤로가기상사');
    expect(screen.getByLabelText('사업자 등록번호')).toHaveValue('124-81-00998');
    expect(screen.getByText('✓ 확인됨')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '워크스페이스 만들기' }));
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        wsName: '뒤로가기상사',
        bizProfile: { bizNo: '124-81-00998', taxType: 'general', status: 'active' },
      }),
    );
    expect(mockPush).toHaveBeenCalledWith('/signup/buyer/profile');
  });

  it('국세청 장애로 미검증 통과한 조회 결과는 확인됨 표시 없이 복원한다', () => {
    Object.assign(draft, {
      email: 'back@example.com',
      password: 'Qa!pass12345',
      wsName: '장애상사',
      bizProfile: { bizNo: '124-81-00998' },
    });
    render(<BuyerWorkspacePage />);

    expect(screen.getByLabelText('사업자 등록번호')).toHaveValue('124-81-00998');
    expect(screen.queryByText('✓ 확인됨')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '워크스페이스 만들기' })).toBeEnabled();
  });
});
