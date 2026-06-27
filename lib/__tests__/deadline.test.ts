import { describe, it, expect } from 'vitest';
import { endOfDayKstIso, kstDateOf } from '../deadline';

describe('kstDateOf', () => {
  it('KST 자정 경계 — UTC 6/30 15:00 이후는 KST 7/1', () => {
    // 2026-06-30T15:00:00Z = 2026-07-01T00:00:00+09:00 (KST 7월 1일 자정)
    expect(kstDateOf(new Date('2026-06-30T15:00:00.000Z'))).toBe('2026-07-01');
  });

  it('KST 자정 경계 — UTC 6/30 14:59:59은 아직 KST 6/30', () => {
    // 2026-06-30T14:59:59Z = 2026-06-30T23:59:59+09:00 (KST 6월 30일 끝)
    expect(kstDateOf(new Date('2026-06-30T14:59:59.000Z'))).toBe('2026-06-30');
  });

  it('UTC 자정 전날(UTC 12/31 20:00)은 KST 새해 첫날', () => {
    // 2026-12-31T20:00:00Z = 2027-01-01T05:00:00+09:00 (KST 1월 1일)
    expect(kstDateOf(new Date('2026-12-31T20:00:00.000Z'))).toBe('2027-01-01');
  });
});

describe('endOfDayKstIso', () => {
  it("'YYYY-MM-DD' → 해당 날 KST 23:59:59+09:00 문자열을 반환한다", () => {
    expect(endOfDayKstIso('2026-06-30')).toBe('2026-06-30T23:59:59+09:00');
  });

  it('반환값이 new Date()로 파싱될 때 올바른 UTC 인스턴트(T14:59:59Z)와 일치한다', () => {
    // 2026-06-30T23:59:59+09:00 == 2026-06-30T14:59:59Z
    const iso = endOfDayKstIso('2026-06-30');
    const parsed = new Date(iso);
    expect(parsed.toISOString()).toBe('2026-06-30T14:59:59.000Z');
  });

  it('월 경계: 말일이 다음 달 첫날로 해석되지 않는다', () => {
    const iso = endOfDayKstIso('2026-12-31');
    // 2026-12-31T23:59:59+09:00 = 2026-12-31T14:59:59Z (여전히 12/31)
    expect(new Date(iso).toISOString()).toBe('2026-12-31T14:59:59.000Z');
  });
});
