import { describe, expect, it } from 'vitest';
import { migrateSignupSource, SIGNUP_SOURCE_VERSION } from '../signup-source';

describe('migrateSignupSource', () => {
  it('normalizes garbage/undefined input to an empty v1 document', () => {
    expect(migrateSignupSource(undefined)).toEqual({ _v: SIGNUP_SOURCE_VERSION });
    expect(migrateSignupSource(null)).toEqual({ _v: SIGNUP_SOURCE_VERSION });
    expect(migrateSignupSource('garbage')).toEqual({ _v: SIGNUP_SOURCE_VERSION });
    expect(migrateSignupSource(42)).toEqual({ _v: SIGNUP_SOURCE_VERSION });
  });

  it('preserves known fields', () => {
    const raw = {
      _v: 1,
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'brand',
      utmTerm: 'rfp tool',
      utmContent: 'ad1',
      referrer: 'https://google.com/search',
      landingPath: '/?utm_source=google',
      capturedAt: '2026-07-06T00:00:00.000Z',
    };
    expect(migrateSignupSource(raw)).toEqual(raw);
  });

  it('drops unknown keys', () => {
    const raw = { _v: 1, utmSource: 'google', gclid: 'abc', evil: '<script>' };
    expect(migrateSignupSource(raw)).toEqual({ _v: 1, utmSource: 'google' });
  });

  it('clamps overlong string fields to 512 chars', () => {
    const long = 'a'.repeat(1000);
    const result = migrateSignupSource({ _v: 1, referrer: long, landingPath: long });
    expect(result.referrer).toHaveLength(512);
    expect(result.landingPath).toHaveLength(512);
  });

  it('ignores non-string values for string fields', () => {
    const result = migrateSignupSource({ _v: 1, utmSource: 123, referrer: {} });
    expect(result).toEqual({ _v: 1 });
  });

  it('re-normalizes a legacy/future version to the current version', () => {
    const result = migrateSignupSource({ _v: 99, utmSource: 'google' });
    expect(result._v).toBe(SIGNUP_SOURCE_VERSION);
    expect(result.utmSource).toBe('google');
  });
});
