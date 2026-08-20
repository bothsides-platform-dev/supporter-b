import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement, forwardRef } from 'react';
import { render, cleanup, act } from '@testing-library/react';
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
    // 애니메이션 중에는 시작점만 회전한 드로잉 경로를 쓴다 — 기하 동일성은 별도 테스트가 보장
    expect(path!.getAttribute('d')).toBeTruthy();
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

  it('renders the same element type under reduced motion (initial===animate, no type swap) to avoid SSR hydration mismatch', () => {
    reduce = true;
    render(<AnimatedBrandMark />);
    expect(captured.pathProps?.initial).toMatchObject({ pathLength: 1, fillOpacity: 1 });
    expect(captured.pathProps?.animate).toMatchObject({ pathLength: 1, fillOpacity: 1 });
    expect((captured.pathProps?.transition as { duration: number }).duration).toBe(0);
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

  it('settles into a plain static path after the draw-on completes — no dash residue degrading the stroke', () => {
    const { container } = render(<AnimatedBrandMark />);
    expect(typeof captured.pathProps?.onAnimationComplete).toBe('function');
    act(() => {
      (captured.pathProps!.onAnimationComplete as () => void)();
    });
    const path = container.querySelector('path')!;
    expect(path.getAttribute('stroke-dasharray')).toBeNull();
    expect(path.getAttribute('stroke-dashoffset')).toBeNull();
    expect(path.getAttribute('pathLength')).toBeNull();
    // 정착 후에는 SSOT 경로 그대로 — BrandMark와 픽셀 동일 렌더
    expect(path.getAttribute('d')).toBe(BRAND_MARK_PATH);
    expect(path.getAttribute('stroke-width')).toBe('450');
    expect(path.getAttribute('stroke-linejoin')).toBe('miter');
  });

  it('draws from mid-edge start points so dash seams never sit on corners during the animation', () => {
    const { container } = render(<AnimatedBrandMark />);
    const d = container.querySelector('path')!.getAttribute('d')!;
    // 서브패스 시작점이 SSOT의 모서리(M3541/M5405)가 아니라 윗변 중간이어야 한다 —
    // dash 이음새(butt 절단)가 모서리에 앉으면 미터 조인이 파여 그리는 중에도 깨져 보인다
    expect(d.startsWith('M4025 9379')).toBe(true);
    expect(d).toContain('M6600 9379');
    expect(d).not.toContain('M3541');
    expect(d).not.toContain('M5405');
  });

  it('the drawing path is geometrically identical to the SSOT path (start-point rotation only)', () => {
    const { container } = render(<AnimatedBrandMark />);
    const d = container.querySelector('path')!.getAttribute('d')!;
    const pairs = (s: string) => {
      const nums = s.match(/-?\d+/g)!.map(Number);
      const out = new Set<string>();
      for (let i = 0; i < nums.length; i += 2) out.add(`${nums[i]},${nums[i + 1]}`);
      return out;
    };
    const ssot = pairs(BRAND_MARK_PATH);
    const draw = pairs(d);
    // SSOT의 모든 정점·제어점이 드로잉 경로에 그대로 존재해야 한다
    for (const p of ssot) expect(draw.has(p)).toBe(true);
    // 드로잉 경로의 추가 정점은 시작점 회전으로 생긴 변 위의 분할점 2개뿐
    const extras = [...draw].filter((p) => !ssot.has(p));
    expect(extras.sort()).toEqual(['4025,9379', '6600,9379']);
  });

  it('settles into the plain static path immediately under prefers-reduced-motion — no dash residue', () => {
    reduce = true;
    const { container } = render(<AnimatedBrandMark />);
    const path = container.querySelector('path')!;
    expect(path.getAttribute('stroke-dasharray')).toBeNull();
    expect(path.getAttribute('pathLength')).toBeNull();
    expect(path.getAttribute('stroke-width')).toBe('450');
  });
});
