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
    expect(html).not.toMatch(/판본|v2/);
  });

  it.each([['privacy', Privacy], ['marketing', Marketing]])('%s 는 현재 문의 주소를 안내한다', (_, Page) => {
    expect(renderToStaticMarkup(<Page />)).toContain(siteConfig.operator.email);
  });
});
