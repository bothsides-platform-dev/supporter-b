import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { DOCS_URL } from '@/lib/site-config';

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
});
