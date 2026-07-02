import { describe, it, expect } from 'vitest';
import {
  SUPPORTER_B_RATE,
  RATE_FLOOR_MARGIN,
  annualMaxSavings,
  gradeFromVolume,
  minCurrentRate,
  tierRangeLabel,
} from '../savings';

describe('minCurrentRate', () => {
  it('floors the current rate at our assumed rate plus the margin, per tier', () => {
    const cases: [number, keyof typeof SUPPORTER_B_RATE][] = [
      [2e8, 'sole'],
      [4e8, 'sme1'],
      [8e8, 'sme2'],
      [2e9, 'sme3'],
      [5e10, 'general'],
    ];
    for (const [volume, tier] of cases) {
      expect(gradeFromVolume(volume)).toBe(tier);
      expect(minCurrentRate(volume)).toBeCloseTo(
        SUPPORTER_B_RATE[tier] + RATE_FLOOR_MARGIN,
        10,
      );
    }
  });

  it('is always strictly above the assumed rate, so savings at the floor is positive', () => {
    for (const volume of [2e8, 4e8, 8e8, 2e9, 5e10]) {
      const floor = minCurrentRate(volume);
      expect(annualMaxSavings(volume, floor)).toBeGreaterThan(0);
    }
  });
});

describe('tierRangeLabel', () => {
  it('describes each tier boundary in human-readable 억 units', () => {
    expect(tierRangeLabel('sole')).toBe('연 거래액 3억 이하');
    expect(tierRangeLabel('sme1')).toBe('연 거래액 3억 초과 5억 이하');
    expect(tierRangeLabel('sme2')).toBe('연 거래액 5억 초과 10억 이하');
    expect(tierRangeLabel('sme3')).toBe('연 거래액 10억 초과 30억 이하');
    expect(tierRangeLabel('general')).toBe('연 거래액 30억 초과');
  });
});
