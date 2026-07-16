import { describe, expect, it } from 'vitest';
import { shouldShowFirstRfpCoachmark } from '../visibility';
import type { UserOnboarding } from '@/lib/types/onboarding';

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
