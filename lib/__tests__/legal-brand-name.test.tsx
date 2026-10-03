import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Terms from '@/app/legal/terms/page';
import Privacy from '@/app/legal/privacy/page';

describe('current legal document brand name', () => {
  it.each([['terms', Terms], ['privacy', Privacy]])('uses 서포트비 in %s', (_, Page) => {
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain('서포트비');
    expect(html).not.toMatch(/Support(?:er)? B|서포터 B/);
    expect(html).toContain('v2');
  });
});
