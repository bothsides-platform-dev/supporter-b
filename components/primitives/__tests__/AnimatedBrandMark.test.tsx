import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement, forwardRef } from 'react';
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
const captured: { pathProps: Record<string, unknown> | null } = { pathProps: null };
vi.mock('motion/react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('motion/react')>();
  const RealMotionPath = mod.motion.path;
  const CapturingMotionPath = forwardRef<SVGPathElement, Record<string, unknown>>((props, ref) => {
    captured.pathProps = props;
    return createElement(RealMotionPath, { ...props, ref });
  });
  CapturingMotionPath.displayName = 'CapturingMotionPath';
  return {
    ...mod,
    useReducedMotion: () => reduce,
    motion: { ...mod.motion, path: CapturingMotionPath },
  };
});

import { AnimatedBrandMark } from '../AnimatedBrandMark';

afterEach(() => {
  cleanup();
  reduce = false;
  captured.pathProps = null;
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

  it('renders the static path with no draw/fill motion attributes at all (truly static, not just settled)', () => {
    reduce = true;
    const { container } = render(<AnimatedBrandMark />);
    const path = container.querySelector('path')!;
    expect(path.getAttribute('fill-opacity')).toBeNull();
    expect(path.getAttribute('stroke-dasharray')).toBeNull();
    expect(path.getAttribute('stroke-dashoffset')).toBeNull();
  });

  it('reflects custom size, className, colorVar and strokeWidth props', () => {
    const { container } = render(
      <AnimatedBrandMark size={32} className="shrink-0" colorVar="--custom-color" strokeWidth={10} />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('height')).toBe('32');
    expect(svg.getAttribute('class')).toBe('shrink-0');
    const g = container.querySelector('g')!;
    expect(g.getAttribute('fill')).toBe('var(--custom-color)');
    const path = container.querySelector('path')!;
    expect(path.getAttribute('stroke')).toBe('var(--custom-color)');
    expect(path.getAttribute('stroke-width')).toBe('10');
  });

  it('starts the animated path fully undrawn (pathLength 0) before drawing on to completion', () => {
    render(<AnimatedBrandMark />);
    expect(captured.pathProps?.initial).toMatchObject({ pathLength: 0, fillOpacity: 0 });
    expect(captured.pathProps?.animate).toMatchObject({ pathLength: 1, fillOpacity: 1 });
  });

  it('keeps the draw-on easing/timing pinned to the standard curve (regression: decel easing killed the draw feel)', () => {
    render(<AnimatedBrandMark />);
    const transition = captured.pathProps?.transition as Record<string, { ease: unknown; duration: number; delay?: number }>;
    expect(transition.pathLength.ease).toEqual([0.4, 0, 0.2, 1]);
    expect(transition.pathLength.duration).toBe(0.6);
    expect(transition.fillOpacity.delay).toBe(0.5);
    expect(transition.fillOpacity.duration).toBe(0.3);
  });
});
