import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateOnboardingActionMock = vi.fn(
  async (_input: unknown): Promise<{ ok: boolean; error?: string }> => ({ ok: true }),
);
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (input: unknown) => updateOnboardingActionMock(input),
}));

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const captureMock = vi.fn();
vi.mock('@/lib/observability/capture', () => ({
  captureActionError: (...args: unknown[]) => captureMock(...args),
}));

import { stampOnboarding, stampSettled } from '../stamp-onboarding';

describe('stampOnboarding', () => {
  beforeEach(() => {
    updateOnboardingActionMock.mockReset();
    updateOnboardingActionMock.mockImplementation(async () => ({ ok: true }));
    toastMock.mockReset();
    captureMock.mockReset();
  });

  it('성공하면 true 를 반환하고 토스트를 띄우지 않는다', async () => {
    const ok = await stampOnboarding({ key: 'buyerTutorial', event: 'completed' });

    expect(ok).toBe(true);
    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'buyerTutorial',
      event: 'completed',
    });
    expect(toastMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('{ok:false} 면 false + 에러 토스트만 — Sentry 미호출(예상된 실패)', async () => {
    updateOnboardingActionMock.mockImplementation(async () => ({
      ok: false,
      error: 'FORBIDDEN_PG',
    }));

    const ok = await stampOnboarding({ key: 'pgTutorial', event: 'dismissed' });

    expect(ok).toBe(false);
    expect(toastMock).toHaveBeenCalledWith('체험 기록을 저장하지 못했어요', { type: 'error' });
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('reject 면 false + 토스트 + captureActionError — 호출측으로 절대 reject 하지 않는다', async () => {
    const err = new Error('network');
    updateOnboardingActionMock.mockImplementation(async () => {
      throw err;
    });

    const ok = await stampOnboarding({ key: 'buyerTutorial', event: 'dismissed' });

    expect(ok).toBe(false);
    expect(toastMock).toHaveBeenCalledWith('체험 기록을 저장하지 못했어요', { type: 'error' });
    expect(captureMock).toHaveBeenCalledWith('onboarding.stamp', err, null, {
      key: 'buyerTutorial',
      event: 'dismissed',
    });
  });

  describe('stampSettled (이동 게이트 대기 상한)', () => {
    it('스탬프가 settle 되면 즉시 resolve 한다', async () => {
      await expect(stampSettled(Promise.resolve(true))).resolves.toBeUndefined();
    });

    it('스탬프가 pending 이어도 deadline 이 지나면 resolve 한다 — 이탈 클릭이 얼어붙지 않게', async () => {
      vi.useFakeTimers();
      const never = new Promise(() => {});
      let settled = false;
      void stampSettled(never, 800).then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(799);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      vi.useRealTimers();
    });
  });
});
