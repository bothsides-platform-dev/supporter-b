import { describe, it, expect, afterEach } from 'vitest';
import { appOrigins } from '@/lib/site-routing';
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

// 드리프트 가드 — 오리진 해석기가 둘이다: baseUrlFor(이메일 링크 등 서버가 만드는 절대
// URL)와 appOrigins(호스트 라우팅·리다이렉트 판정). 폴백 사슬이 갈리면 같은 환경에서
// 이메일은 A 오리진을 가리키는데 호스트 리다이렉트는 B 를 기준으로 판정하는 어긋남이 난다.
// 부분설정 환경(per-type 오리진 없음)에서 둘이 같은 답을 내는지 고정한다.
describe('baseUrlFor ↔ appOrigins 폴백 일치', () => {
  const clearPerType = () => {
    delete process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
    delete process.env.NEXT_PUBLIC_BUYER_ORIGIN;
  };

  it('NEXT_PUBLIC_BASE_URL 만 설정된 환경에서 두 해석기가 일치한다', () => {
    clearPerType();
    process.env.NEXT_PUBLIC_BASE_URL = 'https://staging.support-b.com';
    delete process.env.AUTH_URL;

    const origins = appOrigins();
    expect(origins.buyer).toBe(baseUrlFor('buyer'));
    expect(origins.pg).toBe(baseUrlFor('pg'));
  });

  it('AUTH_URL 만 설정된 환경에서도 두 해석기가 일치한다', () => {
    clearPerType();
    delete process.env.NEXT_PUBLIC_BASE_URL;
    process.env.AUTH_URL = 'https://auth.support-b.com';

    const origins = appOrigins();
    expect(origins.buyer).toBe(baseUrlFor('buyer'));
    expect(origins.pg).toBe(baseUrlFor('pg'));
  });

  it('둘 다 없으면 같은 로컬 기본값으로 수렴한다', () => {
    clearPerType();
    delete process.env.NEXT_PUBLIC_BASE_URL;
    delete process.env.AUTH_URL;

    const origins = appOrigins();
    expect(origins.buyer).toBe(baseUrlFor('buyer'));
    expect(origins.pg).toBe(baseUrlFor('pg'));
  });
});
