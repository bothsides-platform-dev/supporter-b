import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const updateOnboardingMock = vi.fn(async (_i: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (i: unknown) => updateOnboardingMock(i),
}));

import { SampleEntryCard } from '../SampleEntryCard';

afterEach(() => {
  cleanup();
  refreshMock.mockClear();
  updateOnboardingMock.mockClear();
});

describe('SampleEntryCard', () => {
  it('구매사 variant는 /rfp/sample 로 가는 링크와 안내 문구를 보여준다', () => {
    render(<SampleEntryCard variant="buyer" />);
    expect(screen.getByText('샘플로 둘러보기')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/rfp/sample');
  });

  it('PG variant는 /inbox/sample 로 가는 링크를 보여준다', () => {
    render(<SampleEntryCard variant="pg" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/inbox/sample');
  });

  it('숨기기(X) 클릭 시 updateOnboardingAction(dismissed) 호출 후 새로고침한다', async () => {
    const user = userEvent.setup();
    render(<SampleEntryCard variant="buyer" />);
    await user.click(screen.getByRole('button', { name: '숨기기' }));
    expect(updateOnboardingMock).toHaveBeenCalledWith({ key: 'buyerSample', event: 'dismissed' });
    expect(refreshMock).toHaveBeenCalled();
  });

  it('PG variant 숨기기는 pgSample 키로 호출한다', async () => {
    const user = userEvent.setup();
    render(<SampleEntryCard variant="pg" />);
    await user.click(screen.getByRole('button', { name: '숨기기' }));
    expect(updateOnboardingMock).toHaveBeenCalledWith({ key: 'pgSample', event: 'dismissed' });
  });
});
