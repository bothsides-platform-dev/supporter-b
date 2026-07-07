import { describe, it, expect, afterEach } from 'vitest';
import { baseUrl, baseUrlFor, adminBaseUrl } from '../env';

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe('adminBaseUrl', () => {
  it('returns ADMIN_ORIGIN when set', () => {
    process.env.ADMIN_ORIGIN = 'https://admin.support-b.com';
    expect(adminBaseUrl()).toBe('https://admin.support-b.com');
  });
  it('falls back to baseUrl() when ADMIN_ORIGIN is unset', () => {
    delete process.env.ADMIN_ORIGIN;
    expect(adminBaseUrl()).toBe(baseUrl());
  });
});

describe('baseUrlFor', () => {
  it('uses the partner origin for pg-facing links', () => {
    process.env.NEXT_PUBLIC_PARTNER_ORIGIN = 'https://partner.support-b.com';
    expect(baseUrlFor('pg')).toBe('https://partner.support-b.com');
  });
  it('uses the buyer origin for buyer-facing links', () => {
    process.env.NEXT_PUBLIC_BUYER_ORIGIN = 'https://support-b.com';
    expect(baseUrlFor('buyer')).toBe('https://support-b.com');
  });
  it('falls back to baseUrl() when the per-type origin is unset', () => {
    delete process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
    delete process.env.NEXT_PUBLIC_BUYER_ORIGIN;
    expect(baseUrlFor('pg')).toBe(baseUrl());
  });
});
