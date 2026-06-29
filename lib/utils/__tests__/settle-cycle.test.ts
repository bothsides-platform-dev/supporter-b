import { describe, expect, it } from 'vitest';
import { compareSettleCycle, formatSettleCycle, SETTLE_CYCLE_RE } from '../settle-cycle';

describe('SETTLE_CYCLE_RE (canonical D+N format)', () => {
  const ok = (s: string) => SETTLE_CYCLE_RE.test(s);

  it('accepts D/W/M with any positive offset — no upper bound (matches the wizard gate of cycleNum > 0)', () => {
    expect(ok('D+1')).toBe(true);
    expect(ok('W+2')).toBe(true);
    expect(ok('M+99')).toBe(true);
    expect(ok('D+999')).toBe(true);
    expect(ok('D+1000')).toBe(true);
    expect(ok('D+99999')).toBe(true);
  });

  it('rejects a zero or leading-zero offset', () => {
    expect(ok('D+0')).toBe(false);
    expect(ok('D+01')).toBe(false);
  });

  it('rejects an unknown unit', () => {
    expect(ok('X+1')).toBe(false);
    expect(ok('d+1')).toBe(false);
  });

  it('rejects malformed or free-text values', () => {
    expect(ok('')).toBe(false);
    expect(ok('D')).toBe(false);
    expect(ok('D+')).toBe(false);
    expect(ok('협의')).toBe(false);
    expect(ok(' D+1')).toBe(false);
    expect(ok('D+1 ')).toBe(false);
  });
});

describe('compareSettleCycle', () => {
  it('D types sort before W which sorts before M', () => {
    const input = ['W+1', 'D+3', 'M+2', 'D+1'];
    const sorted = [...input].sort(compareSettleCycle);
    expect(sorted).toEqual(['D+1', 'D+3', 'W+1', 'M+2']);
  });

  it('within same type, smaller number sorts first', () => {
    const input = ['D+7', 'D+2', 'D+5', 'D+1'];
    const sorted = [...input].sort(compareSettleCycle);
    expect(sorted).toEqual(['D+1', 'D+2', 'D+5', 'D+7']);
  });

  it('M+3 sorts after W+2', () => {
    expect(compareSettleCycle('M+3', 'W+2')).toBeGreaterThan(0);
    expect(compareSettleCycle('W+2', 'M+3')).toBeLessThan(0);
  });

  it('equal cycles return 0', () => {
    expect(compareSettleCycle('D+1', 'D+1')).toBe(0);
  });
});

describe('formatSettleCycle', () => {
  it('formats D type', () => {
    expect(formatSettleCycle('D', 1)).toBe('D+1');
  });

  it('formats W type', () => {
    expect(formatSettleCycle('W', 2)).toBe('W+2');
  });

  it('formats M type', () => {
    expect(formatSettleCycle('M', 3)).toBe('M+3');
  });
});
