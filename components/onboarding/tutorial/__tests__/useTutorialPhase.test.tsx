import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const updateOnboardingActionMock = vi.fn(async (_input: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (input: unknown) => updateOnboardingActionMock(input),
}));

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
    // mockReset(전체 초기화) — 아래 onLeave 순서 테스트가 mockImplementation 을 심는데
    // mockClear 는 구현을 남겨 다음 테스트로 새어나간다. mockPush 는 기본 구현이 없어
    // reset 이 안전하다(updateOnboardingActionMock 은 구현이 있으므로 clear 유지).
    mockPush.mockReset();
    updateOnboardingActionMock.mockClear();
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

  it('handleExit 는 dismissed 스탬프 후 /home 으로 보낸다', () => {
    const { result } = setup();

    act(() => result.current.handleExit());

    expect(updateOnboardingActionMock).toHaveBeenCalledWith({
      key: 'buyerTutorial',
      event: 'dismissed',
    });
    expect(mockPush).toHaveBeenCalledWith('/home');
  });

  // buyer 플로우는 이탈 전에 격리해 둔 실제 RFP 초안을 되돌려야 한다 — 라우팅이
  // 먼저 일어나면 언마운트 뒤에 복원이 걸린다.
  it('onLeave 는 라우팅보다 먼저 실행된다', () => {
    const calls: string[] = [];
    mockPush.mockImplementation(() => calls.push('push'));
    const { result } = setup(() => calls.push('leave'));

    act(() => result.current.navigate('/rfp-create'));

    expect(calls).toEqual(['leave', 'push']);
    expect(mockPush).toHaveBeenCalledWith('/rfp-create');
  });

  it('onLeave 가 없으면 라우팅만 한다', () => {
    const { result } = setup();

    act(() => result.current.navigate('/inbox'));

    expect(mockPush).toHaveBeenCalledWith('/inbox');
  });
});
