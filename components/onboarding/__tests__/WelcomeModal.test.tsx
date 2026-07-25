import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const updateOnboardingMock = vi.fn(
  async (_i: unknown): Promise<{ ok: boolean; error?: string }> => ({ ok: true }),
);
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (i: unknown) => updateOnboardingMock(i),
}));

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...args: unknown[]) => toastMock(...args) }));
vi.mock('@/lib/observability/capture', () => ({ captureActionError: vi.fn() }));

import { WelcomeModal } from '../WelcomeModal';

beforeEach(() => {
  pushMock.mockClear();
  updateOnboardingMock.mockClear();
  toastMock.mockClear();
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

  // 공식 표기는 siteConfig.name 인 '서포트비' 하나다. '서포트 B'는 검색·AI 인용용
  // BRAND_ALIASES 일 뿐 화면 표기가 아닌데, 신규 가입자가 처음 보는 이 모달만
  // 별칭을 쓰고 있었다(셸·랜딩·푸터는 전부 '서포트비').
  it.each(['buyer', 'pg'] as const)('%s variant greets with the official brand name', (variant) => {
    render(<WelcomeModal variant={variant} />);
    expect(screen.getByText(/서포트비에 오신 걸 환영해요/)).toBeInTheDocument();
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

  it('스탬프가 {ok:false}로 실패하면 에러 토스트로 알린다 (모달 닫힘은 그대로)', async () => {
    updateOnboardingMock.mockImplementationOnce(async () => ({
      ok: false,
      error: 'FORBIDDEN_BUYER',
    }));
    const user = userEvent.setup();
    render(<WelcomeModal variant="buyer" />);
    await user.click(screen.getByRole('button', { name: '나중에 하기' }));

    expect(screen.queryByRole('button', { name: '체험 시작하기' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('체험 기록을 저장하지 못했어요', { type: 'error' }),
    );
  });
});
