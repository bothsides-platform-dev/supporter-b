import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const updateOnboardingActionMock = vi.fn(
  async (_input: unknown): Promise<{ ok: boolean; error?: string }> => ({ ok: true }),
);
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (input: unknown) => updateOnboardingActionMock(input),
}));

// stampOnboarding(실물)이 실패 시 부르는 부수효과 — 이 스위트의 관심사가 아니라 무음 처리.
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/observability/capture', () => ({ captureActionError: vi.fn() }));

import { useTutorialPhase } from '../useTutorialPhase';

type Phase = 'a' | 'b' | 'done';
const ORDER: Phase[] = ['a', 'b', 'done'];
const LABELS: Record<Phase, string> = { a: '첫째', b: '둘째', done: '완료' };

function setup(onLeave?: () => void) {
  return renderHook(() =>
    useTutorialPhase({ order: ORDER, labels: LABELS, onboardingKey: 'buyerTutorial', onLeave }),
  );
}

describe('useTutorialPhase', () => {
  beforeEach(() => {
    // mockReset(전체 초기화) — 순서 테스트들이 mockImplementation 을 심는데
    // mockClear 는 구현을 남겨 다음 테스트로 새어나간다. updateOnboardingActionMock 도
    // deferred 구현을 심는 테스트가 있어 reset 후 기본 구현을 복원한다.
    mockPush.mockReset();
    updateOnboardingActionMock.mockReset();
    updateOnboardingActionMock.mockImplementation(async () => ({ ok: true }));
  });

  it('첫 phase 에서 시작하고 진행 파생값을 계산한다', () => {
    const { result } = setup();

    expect(result.current.phase).toBe('a');
    expect(result.current.stepNum).toBe(1);
    expect(result.current.total).toBe(3);
    expect(result.current.label).toBe('첫째');
    expect(result.current.isDone).toBe(false);
  });

  it('마지막 phase 가 done — isDone 과 stepNum 이 함께 따라간다', () => {
    const { result } = setup();

    act(() => result.current.setPhase('b'));
    expect(result.current.stepNum).toBe(2);
    expect(result.current.isDone).toBe(false);

    act(() => result.current.setPhase('done'));
    expect(result.current.stepNum).toBe(3);
    expect(result.current.isDone).toBe(true);
  });

  it('handleComplete 는 completed 스탬프를 찍고 done 으로 보낸다', () => {
    const { result } = setup();

    act(() => result.current.handleComplete());

    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'buyerTutorial',
      event: 'completed',
    });
    expect(result.current.phase).toBe('done');
  });

  // 정상 완주와 코치마크 건너뛰기가 같은 handleComplete 로 모이므로, 완주 직후 남아
  // 있던 투어의 skip 이 늦게 들어오는 경로가 실재한다 — 두 번째 호출이 스탬프를
  // 다시 쏘면 안 된다.
  it('done 에서의 재호출은 스탬프를 다시 찍지 않는다 (재진입 가드)', () => {
    const { result } = setup();

    act(() => result.current.handleComplete());
    updateOnboardingActionMock.mockClear();

    act(() => result.current.handleComplete());

    expect(updateOnboardingActionMock).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('done');
  });

  it('handleExit 는 dismissed 스탬프 후 /home 으로 보낸다', async () => {
    const { result } = setup();

    await act(async () => result.current.handleExit());

    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'buyerTutorial',
      event: 'dismissed',
    });
    expect(mockPush).toHaveBeenCalledWith('/home');
  });

  // buyer 플로우는 이탈 전에 격리해 둔 실제 RFP 초안을 되돌려야 한다 — 라우팅이
  // 먼저 일어나면 언마운트 뒤에 복원이 걸린다.
  it('onLeave 는 라우팅보다 먼저 실행된다', async () => {
    const calls: string[] = [];
    mockPush.mockImplementation(() => calls.push('push'));
    const { result } = setup(() => calls.push('leave'));

    await act(async () => result.current.navigate('/rfp-create'));

    expect(calls).toEqual(['leave', 'push']);
    expect(mockPush).toHaveBeenCalledWith('/rfp-create');
  });

  it('onLeave 가 없으면 라우팅만 한다', async () => {
    const { result } = setup();

    await act(async () => result.current.navigate('/inbox'));

    expect(mockPush).toHaveBeenCalledWith('/inbox');
  });

  // stamp-then-move — 스탬프 POST 와 /home RSC GET 이 경주하면 완료 직후 환영
  // 모달이 재노출된다. 라우팅 경로는 쓰기 settle 을 기다려야 한다.
  it('handleExit 은 스탬프 쓰기가 settle 된 뒤에만 push 한다', async () => {
    let resolveAction!: (v: { ok: boolean }) => void;
    updateOnboardingActionMock.mockImplementation(
      () =>
        new Promise<{ ok: boolean }>((res) => {
          resolveAction = res;
        }),
    );
    const { result } = setup();

    act(() => {
      result.current.handleExit();
    });
    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'buyerTutorial',
      event: 'dismissed',
    });
    expect(mockPush).not.toHaveBeenCalled(); // settle 전 push 금지

    await act(async () => {
      resolveAction({ ok: true });
    });
    expect(mockPush).toHaveBeenCalledWith('/home');
  });

  it('스탬프가 실패(reject)해도 push 는 도달한다 — 이탈 의사가 우선', async () => {
    updateOnboardingActionMock.mockImplementation(async () => {
      throw new Error('network');
    });
    const { result } = setup();

    await act(async () => {
      result.current.handleExit();
    });

    expect(mockPush).toHaveBeenCalledWith('/home');
  });

  it('done CTA 의 navigate 는 handleComplete 의 pending 스탬프를 기다린다', async () => {
    let resolveAction!: (v: { ok: boolean }) => void;
    updateOnboardingActionMock.mockImplementation(
      () =>
        new Promise<{ ok: boolean }>((res) => {
          resolveAction = res;
        }),
    );
    const { result } = setup();

    act(() => {
      result.current.handleComplete();
    });
    expect(result.current.phase).toBe('done'); // done 화면 전환은 즉시 — 지연 0

    act(() => {
      void result.current.navigate('/home');
    });
    expect(mockPush).not.toHaveBeenCalled(); // 스탬프 settle 전 push 금지

    await act(async () => {
      resolveAction({ ok: true });
    });
    expect(mockPush).toHaveBeenCalledWith('/home');
  });
});
