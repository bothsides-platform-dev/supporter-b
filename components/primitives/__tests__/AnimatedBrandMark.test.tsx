import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BRAND_MARK_PATH } from '@/lib/brand/brand-mark-path';

// motion 내부에서 matchMedia를 읽을 수 있음 (jsdom 미정의)
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

// jsdom에서는 matchMedia 부재 시 reduced=true로 고정되므로 훅을 직접 제어한다
let reduce = false;
vi.mock('motion/react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('motion/react')>();
  return { ...mod, useReducedMotion: () => reduce };
});

import { AnimatedBrandMark } from '../AnimatedBrandMark';

afterEach(() => {
  cleanup();
  reduce = false;
});

describe('AnimatedBrandMark', () => {
  it('renders the brand mark svg with the SSOT path (BrandMark-equivalent structure)', () => {
    const { container } = render(<AnimatedBrandMark />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('viewBox')).toBe('334 294 636 636');
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    const path = svg!.querySelector('path');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('d')).toBe(BRAND_MARK_PATH);
    expect(path!.getAttribute('stroke-width')).toBe('450');
  });

  it('starts with the fill hidden so the mark draws on before filling in (motion allowed)', () => {
    const { container } = render(<AnimatedBrandMark />);
    const path = container.querySelector('path')!;
    const fillHidden =
      path.style.fillOpacity === '0' || path.getAttribute('fill-opacity') === '0';
    expect(fillHidden).toBe(true);
  });

  it('renders statically with the fill visible under prefers-reduced-motion', () => {
    reduce = true;
    const { container } = render(<AnimatedBrandMark />);
    const path = container.querySelector('path')!;
    expect(path.style.fillOpacity).not.toBe('0');
    expect(path.getAttribute('fill-opacity')).not.toBe('0');
  });
});
