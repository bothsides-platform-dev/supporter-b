// 루트 페이지(/) — buyer 랜딩 전용 정적 페이지.
// PG 호스트 분기는 proxy.ts 의 decideRoute rewrite(→ /pg-landing)가 담당한다.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/landing/LandingHero', () => ({
  LandingHero: () => <div>BUYER_LANDING</div>,
}));
vi.mock('@/components/landing/LandingHeaderNav', () => ({
  LandingHeaderNav: () => null,
}));
vi.mock('@/components/landing/faq-data', () => ({
  FAQ_ITEMS: [
    { q: 'Test Q 1?', a: 'Test A 1' },
    { q: 'Test Q 2?', a: 'Test A 2' },
  ],
}));
vi.mock('@/lib/site-config', () => ({
  siteConfig: { name: 'Test', url: 'https://test.com', description: 'Test' },
  BRAND_ALIASES: ['테스트비'],
}));

import RootPage from '../page';

describe('RootPage — buyer 랜딩', () => {
  it('buyer 랜딩을 렌더한다', () => {
    render(RootPage());
    expect(screen.getByText('BUYER_LANDING')).toBeInTheDocument();
  });

  it('FAQPage JSON-LD script를 렌더한다', () => {
    const { container } = render(RootPage());
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!));
    expect(schemas.some((s) => s['@type'] === 'FAQPage')).toBe(true);
  });

  it('SoftwareApplication JSON-LD script를 렌더한다', () => {
    const { container } = render(RootPage());
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!));
    expect(schemas.some((s) => s['@type'] === 'SoftwareApplication')).toBe(true);
  });

  it('FAQPage JSON-LD에 mainEntity 배열이 있다', () => {
    const { container } = render(RootPage());
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!));
    const faq = schemas.find((s) => s['@type'] === 'FAQPage');
    expect(Array.isArray(faq?.mainEntity)).toBe(true);
    expect(faq.mainEntity.length).toBeGreaterThan(0);
  });
});
