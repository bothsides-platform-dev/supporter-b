import { describe, it, expect } from 'vitest';
import { formatPhoneInput, isCompletePhone } from '@/lib/utils/phone';

describe('formatPhoneInput', () => {
  it('formats 11 raw digits into 010-XXXX-XXXX', () => {
    expect(formatPhoneInput('01057058257')).toBe('010-5705-8257');
  });

  it('is idempotent on an already-hyphenated value', () => {
    expect(formatPhoneInput('010-5705-8257')).toBe('010-5705-8257');
  });

  it('formats an older 10-digit number as XXX-XXX-XXXX', () => {
    expect(formatPhoneInput('0111234567')).toBe('011-123-4567');
  });

  it('formats partial input progressively', () => {
    expect(formatPhoneInput('010')).toBe('010');
    expect(formatPhoneInput('0105')).toBe('010-5');
    expect(formatPhoneInput('0105705')).toBe('010-570-5');
  });

  it('strips non-digit characters', () => {
    expect(formatPhoneInput('010 5705 8257')).toBe('010-5705-8257');
    expect(formatPhoneInput('abc010-5705-8257xyz')).toBe('010-5705-8257');
  });

  it('truncates input beyond 11 digits', () => {
    expect(formatPhoneInput('010570582579999')).toBe('010-5705-8257');
  });

  it('returns empty string for empty input', () => {
    expect(formatPhoneInput('')).toBe('');
  });
});

describe('isCompletePhone', () => {
  it('accepts a complete hyphenated 010 number', () => {
    expect(isCompletePhone('010-5705-8257')).toBe(true);
  });

  it('accepts an older 01X number', () => {
    expect(isCompletePhone('011-123-4567')).toBe(true);
  });

  it('rejects an incomplete number', () => {
    expect(isCompletePhone('010-570')).toBe(false);
  });

  it('rejects a landline number', () => {
    expect(isCompletePhone('02-123-4567')).toBe(false);
  });

  it('rejects empty input', () => {
    expect(isCompletePhone('')).toBe(false);
  });
});
