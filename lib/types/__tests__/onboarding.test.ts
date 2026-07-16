import { describe, it, expect } from 'vitest';
import {
  USER_ONBOARDING_VERSION,
  ONBOARDING_KEYS,
  migrateUserOnboarding,
} from '@/lib/types/onboarding';

describe('USER_ONBOARDING_VERSION', () => {
  it('현재 정규 버전은 1', () => {
    expect(USER_ONBOARDING_VERSION).toBe(1);
  });
});

describe('ONBOARDING_KEYS', () => {
  it('buyerFirstRfp 단일 키를 갖는다', () => {
    expect(ONBOARDING_KEYS).toEqual(['buyerFirstRfp']);
  });
});

describe('migrateUserOnboarding', () => {
  it('빈/누락 입력이면 현재 버전의 빈 문서를 반환한다', () => {
    expect(migrateUserOnboarding(null)).toEqual({ _v: 1 });
    expect(migrateUserOnboarding(undefined)).toEqual({ _v: 1 });
    expect(migrateUserOnboarding({})).toEqual({ _v: 1 });
  });

  it('알려진 키를 보존하고 _v를 현재 버전으로 정규화한다', () => {
    const out = migrateUserOnboarding({
      buyerFirstRfp: { completedAt: '2026-07-01T00:00:00.000Z' },
    });
    expect(out.buyerFirstRfp).toEqual({ completedAt: '2026-07-01T00:00:00.000Z' });
    expect(out._v).toBe(1);
  });

  it('알 수 없는 키/가비지 입력은 무시한다', () => {
    const out = migrateUserOnboarding({
      buyerFirstRfp: { completedAt: '2026-07-01T00:00:00.000Z' },
      unknownKey: { completedAt: '2026-07-01T00:00:00.000Z' },
      garbage: 'not-an-object',
    });
    expect(out).toEqual({ _v: 1, buyerFirstRfp: { completedAt: '2026-07-01T00:00:00.000Z' } });
  });

  it('구 buyerTutorial/pgTutorial 스탬프는 더 이상 알려진 키가 아니므로 폐기된다', () => {
    const out = migrateUserOnboarding({
      buyerTutorial: { completedAt: '2026-07-01T00:00:00.000Z' },
      pgTutorial: { dismissedAt: '2026-07-02T00:00:00.000Z' },
    });
    expect(out).toEqual({ _v: 1 });
  });

  it('멱등하다 — 한 번 정규화한 문서를 다시 넣어도 동일', () => {
    const once = migrateUserOnboarding({ buyerFirstRfp: { completedAt: '2026-07-01T00:00:00.000Z' } });
    expect(migrateUserOnboarding(once)).toEqual(once);
  });

  it('buyerFirstRfp 키를 보존한다', () => {
    const out = migrateUserOnboarding({
      buyerFirstRfp: { dismissedAt: '2026-07-01T00:00:00.000Z' },
    });
    expect(out.buyerFirstRfp).toEqual({ dismissedAt: '2026-07-01T00:00:00.000Z' });
    expect(out._v).toBe(1);
  });
});
