import { describe, it, expect } from 'vitest';

import { siteConfig } from '@/lib/site-config';
import { baseUrl } from '@/lib/site-routing';
import { PRODUCT_NAME } from '@/lib/seo/product-facts';

// 브랜드 표기·오리진은 각각 하나여야 한다. 값이 우연히 같은 복사본은 한쪽만 바뀌는
// 순간 사용자에게 보이는 불일치가 된다(llms.txt·JSON-LD 는 PRODUCT_NAME, 메타데이터·
// OG 는 siteConfig 를 쓴다).
describe('브랜드·오리진 SSOT', () => {
  it('PRODUCT_NAME 은 siteConfig.name 과 같은 출처다', () => {
    expect(PRODUCT_NAME).toBe(siteConfig.name);
  });

  it('siteConfig.url 은 baseUrl() 과 같은 폴백 사슬을 쓴다', () => {
    expect(siteConfig.url).toBe(baseUrl());
  });
});
