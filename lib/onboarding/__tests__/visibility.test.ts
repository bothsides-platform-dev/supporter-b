import { describe, expect, it } from 'vitest';
import { shouldShowSampleEntry } from '../visibility';
import type { UserOnboarding } from '@/lib/types/onboarding';

describe('shouldShowSampleEntry', () => {
  it('해당 태스크가 없으면(_v만 있는 초기 상태) true — 아직 완료/숨김 아님', () => {
    const onboarding: UserOnboarding = { _v: 1 };
    expect(shouldShowSampleEntry(onboarding, 'buyerSample')).toBe(true);
  });

  it('completedAt 이 있으면 false', () => {
    const onboarding: UserOnboarding = { _v: 1, buyerSample: { completedAt: '2026-01-01T00:00:00Z' } };
    expect(shouldShowSampleEntry(onboarding, 'buyerSample')).toBe(false);
  });

  it('dismissedAt 이 있으면 false', () => {
    const onboarding: UserOnboarding = { _v: 1, pgSample: { dismissedAt: '2026-01-01T00:00:00Z' } };
    expect(shouldShowSampleEntry(onboarding, 'pgSample')).toBe(false);
  });

  it('다른 키의 완료 상태는 영향을 주지 않는다', () => {
    const onboarding: UserOnboarding = { _v: 1, buyerSample: { completedAt: '2026-01-01T00:00:00Z' } };
    expect(shouldShowSampleEntry(onboarding, 'pgSample')).toBe(true);
  });
});
