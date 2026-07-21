import { describe, it, expect, afterEach, vi } from 'vitest';

import { siteConfig } from '@/lib/site-config';
import { PRODUCT_NAME } from '@/lib/seo/product-facts';
import { buildLlmsTxt } from '@/lib/seo/llms';
import { buildOrganizationJsonLd } from '@/lib/seo/jsonld';

// 브랜드 표기·오리진은 각각 하나여야 한다. PRODUCT_NAME 과 siteConfig.url 은 지금
// 파생이라 서로 비교해봐야 항등식이고 값 드리프트를 탐지하지 못한다 — 그래서 여기서는
// ① 리터럴로 되돌리는 재복제 회귀와 ② 실제로 사용자·크롤러에게 나가는 표면을 본다.
describe('브랜드 표기 SSOT', () => {
  it('PRODUCT_NAME 을 리터럴로 재선언하지 않고 siteConfig.name 을 쓴다', () => {
    expect(PRODUCT_NAME).toBe(siteConfig.name);
  });

  // 진짜 가드 — 드리프트가 생기면 깨지는 건 이 소비 표면이다.
  it('llms.txt 와 JSON-LD 가 공식 표기를 그대로 싣는다', () => {
    const llms = buildLlmsTxt({ origin: 'https://support-b.com', type: 'buyer' });
    expect(llms).toContain(siteConfig.name);

    expect(buildOrganizationJsonLd().name).toBe(siteConfig.name);
  });
});

// siteConfig.url 은 baseUrl() 파생이라 baseUrl() 과 비교하면 항등식이다. 실제로 지켜야
// 하는 건 폴백 "순서"이므로, 두 env 를 다른 값으로 두고 모듈을 다시 평가해 확인한다
// (siteConfig 는 모듈 로드 시점에 값을 굳히므로 resetModules 가 필요하다).
describe('siteConfig.url 오리진 폴백', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.resetModules();
  });

  it('NEXT_PUBLIC_BASE_URL 을 AUTH_URL 보다 우선한다', async () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://staging.support-b.com';
    process.env.AUTH_URL = 'https://auth.support-b.com';
    vi.resetModules();

    const { siteConfig: fresh } = await import('@/lib/site-config');
    expect(fresh.url).toBe('https://staging.support-b.com');
  });
});
