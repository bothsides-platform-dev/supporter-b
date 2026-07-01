import { describe, it, expect } from 'vitest';
import {
  SUPPORTER_B_RATE,
  RATE_FLOOR_MARGIN,
  annualMaxSavings,
  gradeFromVolume,
  minCurrentRate,
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
