import { describe, it, expect } from 'vitest';
import { escapeIlike } from '../escapeIlike';

describe('escapeIlike', () => {
  it('escapes ilike wildcards % and _ so they match literally', () => {
    expect(escapeIlike('50%')).toBe('50\\%');
    expect(escapeIlike('a_b')).toBe('a\\_b');
  });

  it('escapes the backslash itself', () => {
    expect(escapeIlike('a\\b')).toBe('a\\\\b');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeIlike('수수료 문의')).toBe('수수료 문의');
  });
});
