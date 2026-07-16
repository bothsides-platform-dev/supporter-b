import { describe, expect, it } from 'vitest';
import {
  shouldShowWelcome,
  shouldShowResumeNudge,
  resolveWelcomeState,
  isTutorialCompleted,
  shouldShowFirstRfpCoachmark,
} from '../visibility';
import type { UserOnboarding } from '@/lib/types/onboarding';

describe('shouldShowWelcome', () => {
  it('해당 키가 없으면(_v만 있는 초기 상태) true — 아직 완료/닫기 아님', () => {
    const onboarding: UserOnboarding = { _v: 1 };
    expect(shouldShowWelcome(onboarding, 'buyerTutorial')).toBe(true);
  });

  it('completedAt 이 있으면 false', () => {
    const onboarding: UserOnboarding = { _v: 1, buyerTutorial: { completedAt: '2026-01-01T00:00:00Z' } };
    expect(shouldShowWelcome(onboarding, 'buyerTutorial')).toBe(false);
  });

  it('dismissedAt 이 있으면 false', () => {
    const onboarding: UserOnboarding = { _v: 1, pgTutorial: { dismissedAt: '2026-01-01T00:00:00Z' } };
    expect(shouldShowWelcome(onboarding, 'pgTutorial')).toBe(false);
  });

  it('다른 키의 완료 상태는 영향을 주지 않는다', () => {
    const onboarding: UserOnboarding = { _v: 1, buyerTutorial: { completedAt: '2026-01-01T00:00:00Z' } };
    expect(shouldShowWelcome(onboarding, 'pgTutorial')).toBe(true);
  });
});

describe('shouldShowResumeNudge', () => {
  it('dismissedAt만 있으면(completedAt 없음) true', () => {
    const onboarding: UserOnboarding = { _v: 1, buyerTutorial: { dismissedAt: '2026-01-01T00:00:00Z' } };
    expect(shouldShowResumeNudge(onboarding, 'buyerTutorial')).toBe(true);
  });

  it('completedAt이 있으면(dismissedAt과 무관) false', () => {
    const onboarding: UserOnboarding = {
      _v: 1,
      buyerTutorial: { dismissedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-02T00:00:00Z' },
    };
    expect(shouldShowResumeNudge(onboarding, 'buyerTutorial')).toBe(false);
  });

  it('둘 다 없으면(초기 상태) false', () => {
    const onboarding: UserOnboarding = { _v: 1 };
    expect(shouldShowResumeNudge(onboarding, 'buyerTutorial')).toBe(false);
  });

  it('다른 키의 dismissedAt은 영향을 주지 않는다', () => {
    const onboarding: UserOnboarding = { _v: 1, buyerTutorial: { dismissedAt: '2026-01-01T00:00:00Z' } };
    expect(shouldShowResumeNudge(onboarding, 'pgTutorial')).toBe(false);
  });
});

describe('resolveWelcomeState', () => {
  it('초기 상태(_v만 있음) → welcome', () => {
    const onboarding: UserOnboarding = { _v: 1 };
    expect(resolveWelcomeState(onboarding, 'buyerTutorial')).toBe('welcome');
  });

  it('dismissedAt만 있음 → nudge', () => {
    const onboarding: UserOnboarding = { _v: 1, buyerTutorial: { dismissedAt: '2026-01-01T00:00:00Z' } };
    expect(resolveWelcomeState(onboarding, 'buyerTutorial')).toBe('nudge');
  });

  it('completedAt이 있음 → none', () => {
    const onboarding: UserOnboarding = { _v: 1, buyerTutorial: { completedAt: '2026-01-01T00:00:00Z' } };
    expect(resolveWelcomeState(onboarding, 'buyerTutorial')).toBe('none');
  });
});

describe('isTutorialCompleted', () => {
  it('completedAt이 있으면 true', () => {
    const onboarding: UserOnboarding = { _v: 1, buyerTutorial: { completedAt: '2026-01-01T00:00:00Z' } };
    expect(isTutorialCompleted(onboarding, 'buyerTutorial')).toBe(true);
  });

  it('dismissedAt만 있으면(미완료) false', () => {
    const onboarding: UserOnboarding = { _v: 1, buyerTutorial: { dismissedAt: '2026-01-01T00:00:00Z' } };
    expect(isTutorialCompleted(onboarding, 'buyerTutorial')).toBe(false);
  });

  it('초기 상태면 false', () => {
    const onboarding: UserOnboarding = { _v: 1 };
    expect(isTutorialCompleted(onboarding, 'buyerTutorial')).toBe(false);
  });
});

describe('shouldShowFirstRfpCoachmark', () => {
  it('무스탬프 + hasAnyRfp=false → true', () => {
    const onboarding: UserOnboarding = { _v: 1 };
    expect(shouldShowFirstRfpCoachmark(onboarding, false)).toBe(true);
  });

  it('completedAt이 있으면 false', () => {
    const onboarding: UserOnboarding = {
      _v: 1,
      buyerFirstRfp: { completedAt: '2026-01-01T00:00:00Z' },
    };
    expect(shouldShowFirstRfpCoachmark(onboarding, false)).toBe(false);
  });

  it('dismissedAt이 있으면 false', () => {
    const onboarding: UserOnboarding = {
      _v: 1,
      buyerFirstRfp: { dismissedAt: '2026-01-01T00:00:00Z' },
    };
    expect(shouldShowFirstRfpCoachmark(onboarding, false)).toBe(false);
  });

  it('hasAnyRfp=true면 false', () => {
    const onboarding: UserOnboarding = { _v: 1 };
    expect(shouldShowFirstRfpCoachmark(onboarding, true)).toBe(false);
  });
});
