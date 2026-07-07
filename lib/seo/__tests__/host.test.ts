import { describe, it, expect } from 'vitest';
import type { AppOrigins } from '@/lib/site-routing';
import { seoHostContext } from '@/lib/seo/host';

// Distinct buyer/pg origins (mirrors production two-host setup).
const PROD: AppOrigins = {
  buyer: 'https://support-b.com',
  pg: 'https://partner.support-b.com',
};

// Single-host (local/dev) where routing is disabled.
const DEV: AppOrigins = {
  buyer: 'http://localhost:3000',
  pg: 'http://localhost:3000',
};

describe('seoHostContext', () => {
  it('resolves the buyer host to buyer type + buyer origin', () => {
    expect(seoHostContext('support-b.com', PROD)).toEqual({
      type: 'buyer',
      origin: 'https://support-b.com',
    });
  });

  it('resolves the partner host to pg type + partner origin', () => {
    expect(seoHostContext('partner.support-b.com', PROD)).toEqual({
      type: 'pg',
      origin: 'https://partner.support-b.com',
    });
  });

  it('ignores a port suffix on the host header', () => {
    expect(seoHostContext('partner.support-b.com:443', PROD)).toEqual({
      type: 'pg',
      origin: 'https://partner.support-b.com',
    });
  });

  it('falls back to buyer for an unknown host', () => {
    expect(seoHostContext('evil.example.com', PROD)).toEqual({
      type: 'buyer',
      origin: 'https://support-b.com',
    });
  });

  it('falls back to buyer for a null host', () => {
    expect(seoHostContext(null, PROD)).toEqual({
      type: 'buyer',
      origin: 'https://support-b.com',
    });
  });

  it('falls back to buyer when routing is disabled (single-host dev)', () => {
    expect(seoHostContext('localhost:3000', DEV)).toEqual({
      type: 'buyer',
      origin: 'http://localhost:3000',
    });
  });
});
