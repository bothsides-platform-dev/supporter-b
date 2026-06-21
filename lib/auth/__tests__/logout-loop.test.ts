import { describe, it, expect } from 'vitest';
import {
  RL_THRESHOLD,
  isLoopBreakEscape,
  parseRlCount,
  planForcedLogout,
} from '../logout-loop';

describe('parseRlCount', () => {
  it('reads the __rl counter from the Cookie header', () => {
    expect(parseRlCount('__rl=2; foo=bar')).toBe(2);
    expect(parseRlCount('a=1; __rl=5')).toBe(5);
  });

  it('treats a missing / empty / null header as 0', () => {
    expect(parseRlCount('foo=bar')).toBe(0);
    expect(parseRlCount('')).toBe(0);
    expect(parseRlCount(null)).toBe(0);
    expect(parseRlCount(undefined)).toBe(0);
  });

  it('treats a non-numeric or negative __rl value as 0', () => {
    expect(parseRlCount('__rl=abc')).toBe(0);
    expect(parseRlCount('__rl=-3')).toBe(0);
  });
});

describe('planForcedLogout', () => {
  it('returns normal with an incremented count below the threshold', () => {
    expect(planForcedLogout(0)).toEqual({ kind: 'normal', nextCount: 1 });
    expect(planForcedLogout(1)).toEqual({ kind: 'normal', nextCount: 2 });
    expect(planForcedLogout(RL_THRESHOLD - 1)).toEqual({
      kind: 'normal',
      nextCount: RL_THRESHOLD,
    });
  });

  it('trips the breaker once the counter reaches the threshold', () => {
    expect(planForcedLogout(RL_THRESHOLD)).toEqual({ kind: 'break' });
  });

  it('stays tripped above the threshold and never increments (idempotent)', () => {
    expect(planForcedLogout(RL_THRESHOLD + 7)).toEqual({ kind: 'break' });
  });
});

describe('isLoopBreakEscape', () => {
  it('lets /login render when the break flag is present (suppress authed→/home bounce)', () => {
    expect(isLoopBreakEscape('/login', '1')).toBe(true);
    expect(isLoopBreakEscape('/login', 'anything-truthy')).toBe(true);
  });

  it('does not escape without the flag', () => {
    expect(isLoopBreakEscape('/login', undefined)).toBe(false);
    expect(isLoopBreakEscape('/login', '')).toBe(false);
  });

  it('only escapes on /login, not other routes', () => {
    expect(isLoopBreakEscape('/home', '1')).toBe(false);
    expect(isLoopBreakEscape('/', '1')).toBe(false);
  });
});
