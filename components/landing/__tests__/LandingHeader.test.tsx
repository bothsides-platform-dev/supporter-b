import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

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
});
