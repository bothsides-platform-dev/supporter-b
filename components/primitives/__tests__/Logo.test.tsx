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

import { Logo } from '../Logo';

afterEach(cleanup);

describe('Logo', () => {
  it('renders the static (non-animated) brand mark by default', () => {
    const { container } = render(<Logo />);
    const path = container.querySelector('path')!;
    expect(path.getAttribute('fill-opacity')).toBeNull();
  });

  it('renders the animated draw-on brand mark when animated is true', () => {
    const { container } = render(<Logo animated />);
    const path = container.querySelector('path')!;
    expect(path.getAttribute('fill-opacity')).toBe('0');
  });
});
