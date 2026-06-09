// 루트 페이지(/) — 호스트 인지형 랜딩.
// partner 호스트(PG)는 PG 랜딩화면을, 그 외 호스트(buyer/단일호스트)는 buyer 랜딩을 렌더.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockRedirect = vi.hoisted(() => vi.fn());
const mockHeaders = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('next/headers', () => ({ headers: mockHeaders }));

vi.mock('@/components/landing/LandingHero', () => ({
  LandingHero: () => <div>BUYER_LANDING</div>,
}));
vi.mock('@/components/landing/LandingHeaderNav', () => ({
  LandingHeaderNav: () => null,
}));
vi.mock('@/components/landing/PgLanding', () => ({
  PgLanding: () => <div>PG 랜딩화면</div>,
}));
vi.mock('@/components/landing/FaqList', () => ({
  FAQ_ITEMS: [
    { q: 'Test Q 1?', a: 'Test A 1' },
    { q: 'Test Q 2?', a: 'Test A 2' },
  ],
}));
vi.mock('@/lib/site-config', () => ({
  siteConfig: { name: 'Test', url: 'https://test.com', description: 'Test' },
}));

import RootPage from '../page';

function setHost(host: string | null) {
  mockHeaders.mockResolvedValue({ get: (k: string) => (k === 'host' ? host : null) });
}

describe('RootPage — 호스트 인지형 랜딩', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_BUYER_ORIGIN', 'https://supporter-b.com');
    vi.stubEnv('NEXT_PUBLIC_PARTNER_ORIGIN', 'https://partner.supporter-b.com');
    setHost('supporter-b.com');
  });

  it('어떤 호스트에서도 redirect 없이 랜딩을 렌더한다', async () => {
    await RootPage();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('partner 호스트(PG)에서는 PG 랜딩화면을 렌더한다', async () => {
    setHost('partner.supporter-b.com');
    render(await RootPage());

    expect(screen.getByText('PG 랜딩화면')).toBeInTheDocument();
    expect(screen.queryByText('BUYER_LANDING')).not.toBeInTheDocument();
  });

  it('buyer 호스트에서는 기존 buyer 랜딩을 렌더한다', async () => {
    setHost('supporter-b.com');
    render(await RootPage());

    expect(screen.getByText('BUYER_LANDING')).toBeInTheDocument();
    expect(screen.queryByText('PG 랜딩화면')).not.toBeInTheDocument();
  });

  it('단일 호스트(local/dev)에서는 buyer 랜딩을 렌더한다', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUYER_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('NEXT_PUBLIC_PARTNER_ORIGIN', 'http://localhost:3000');
    setHost('localhost:3000');
    render(await RootPage());

    expect(screen.getByText('BUYER_LANDING')).toBeInTheDocument();
  });

  it('buyer 호스트에서 FAQPage JSON-LD script를 렌더한다', async () => {
    setHost('supporter-b.com');
    const { container } = render(await RootPage());
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!));
    expect(schemas.some((s) => s['@type'] === 'FAQPage')).toBe(true);
  });

  it('buyer 호스트에서 SoftwareApplication JSON-LD script를 렌더한다', async () => {
    setHost('supporter-b.com');
    const { container } = render(await RootPage());
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!));
    expect(schemas.some((s) => s['@type'] === 'SoftwareApplication')).toBe(true);
  });

  it('FAQPage JSON-LD에 mainEntity 배열이 있다', async () => {
    setHost('supporter-b.com');
    const { container } = render(await RootPage());
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!));
    const faq = schemas.find((s) => s['@type'] === 'FAQPage');
    expect(Array.isArray(faq?.mainEntity)).toBe(true);
    expect(faq.mainEntity.length).toBeGreaterThan(0);
  });
});
