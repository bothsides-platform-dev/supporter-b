import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const updateOnboardingMock = vi.fn(async (_i: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (i: unknown) => updateOnboardingMock(i),
}));

import { WelcomeModal } from '../WelcomeModal';

beforeEach(() => {
  pushMock.mockClear();
  updateOnboardingMock.mockClear();
});
afterEach(cleanup);

describe('WelcomeModal', () => {
  it('buyer variant shows a buyer-facing subtitle', () => {
    render(<WelcomeModal variant="buyer" />);
    expect(screen.getByText(/여러 PG사의 견적을 한 번에 비교/)).toBeInTheDocument();
  });

  it('pg variant shows a pg-facing subtitle', () => {
    render(<WelcomeModal variant="pg" />);
    expect(screen.getByText(/견적 요청을 받아 견적을 제출/)).toBeInTheDocument();
  });

  it('clicking 체험 시작하기 navigates to /tutorial', async () => {
    const user = userEvent.setup();
    render(<WelcomeModal variant="buyer" />);
    await user.click(screen.getByRole('button', { name: '체험 시작하기' }));
    expect(pushMock).toHaveBeenCalledWith('/tutorial');
  });

  it('clicking 나중에 하기 dismisses buyerTutorial for a buyer and closes the modal', async () => {
    const user = userEvent.setup();
    render(<WelcomeModal variant="buyer" />);
    await user.click(screen.getByRole('button', { name: '나중에 하기' }));
    expect(updateOnboardingMock).toHaveBeenCalledWith({ key: 'buyerTutorial', event: 'dismissed' });
    expect(screen.queryByRole('button', { name: '체험 시작하기' })).not.toBeInTheDocument();
  });

  it('clicking 나중에 하기 dismisses pgTutorial for a pg', async () => {
    const user = userEvent.setup();
    render(<WelcomeModal variant="pg" />);
    await user.click(screen.getByRole('button', { name: '나중에 하기' }));
    expect(updateOnboardingMock).toHaveBeenCalledWith({ key: 'pgTutorial', event: 'dismissed' });
  });

  it('Esc 등 어떤 방식으로 닫혀도 dismissed 스탬프를 찍는다 (무한 재노출 방지)', async () => {
    const user = userEvent.setup();
    render(<WelcomeModal variant="buyer" />);
    await user.keyboard('{Escape}');

    expect(updateOnboardingMock).toHaveBeenCalledWith({ key: 'buyerTutorial', event: 'dismissed' });
    expect(updateOnboardingMock).toHaveBeenCalledTimes(1);
  });
});
