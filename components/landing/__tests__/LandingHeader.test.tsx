import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, cleanup, screen } from '@testing-library/react';
import { DOCS_URL } from '@/lib/site-config';
import styles from '../LandingHeader.module.css';

vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

vi.mock('motion/react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('motion/react')>();
  return { ...mod, useReducedMotion: () => false };
});

import { LandingHeader } from '../LandingHeader';

afterEach(cleanup);

describe('LandingHeader', () => {
  it('plays the draw-on brand mark animation (landing page gets the same entrance as the sidebar)', () => {
    const { container } = render(<LandingHeader />);
    const path = container.querySelector('path')!;
    expect(path.getAttribute('fill-opacity')).toBe('0');
  });

  it('puts the external 인사이트 link right after the logo, apart from the section menu', () => {
    render(
      <LandingHeader>
        <div data-testid="section-nav" />
      </LandingHeader>,
    );
    const insight = screen.getByRole('link', { name: '인사이트' });
    expect(insight).toHaveAttribute('href', DOCS_URL);
    expect(insight).not.toHaveAttribute('target');
    expect(insight).toHaveAttribute('title', 'docs.support-b.com');
    expect(insight.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

    const logo = screen.getByRole('link', { name: '서포트비 홈' });
    expect(logo.compareDocumentPosition(insight) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(insight.compareDocumentPosition(screen.getByTestId('section-nav')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // jsdom은 미디어 쿼리를 계산하지 못하므로, 헤더 쪽 링크·구분선의 숨김 클래스와
  // 1200px 미만 블록의 display:none 규칙을 함께 고정한다(모바일에서는 메뉴 맨 아래가 대신 보여준다).
  it('hides the logo-side 인사이트 and divider below 1200px', () => {
    render(<LandingHeader />);
    const insight = screen.getByRole('link', { name: '인사이트' });
    expect(insight).toHaveClass(styles.brandInsight);
    expect(insight.previousElementSibling).toHaveClass(styles.brandDivider);

    const css = readFileSync(resolve(__dirname, '../LandingHeader.module.css'), 'utf8');
    const start = css.indexOf('@media (max-width: 1199px)');
    const block = css.slice(start, css.indexOf('@media', start + 1));
    const hidden = [...block.matchAll(/([^{}]+)\{\s*display:\s*none;?\s*\}/g)].flatMap(([, selectors]) => selectors.split(',').map((s) => s.trim()));
    expect(hidden).toEqual(expect.arrayContaining(['.brandInsight', '.brandDivider']));
  });
});
