import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Terms from '@/app/legal/terms/page';
import Privacy from '@/app/legal/privacy/page';
import Marketing from '@/app/legal/marketing/page';
import { siteConfig } from '@/lib/site-config';

describe('current legal document brand name', () => {
  it.each([['terms', Terms], ['privacy', Privacy], ['marketing', Marketing]])('uses 서포트비 in %s', (_, Page) => {
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain('서포트비');
    expect(html).not.toMatch(/Support(?:er)? B|서포터 B/);
    expect(html).not.toMatch(/판본|\bv\d+\b/);
  });

  it.each([['privacy', Privacy], ['marketing', Marketing]])('%s 는 현재 문의 주소를 안내한다', (_, Page) => {
    expect(renderToStaticMarkup(<Page />)).toContain(siteConfig.operator.email);
  });

  /**
   * protects: 개인정보 처리방침 제14조 보호책임자 주소가 공개 사업장 주소(siteConfig.operator.address)와 같다.
   * fails_when: 처리방침 주소가 옛 주소(자양번영로)로 되돌아가거나, siteConfig 주소만 바뀌고 처리방침이 따라오지 않을 때.
   * why_new: legal-edition-pin 의 SHA-256 고정은 본문 바이트 변경만 잡고 어느 주소가 옳은지는 모른다 — 해시를 새로 적으면 틀린 주소도 통과한다.
   * seam: none
   */
  it('privacy 보호책임자 주소는 공개 사업장 주소와 같다', () => {
    expect(renderToStaticMarkup(<Privacy />)).toContain(`주소: ${siteConfig.operator.address}`);
  });
});
