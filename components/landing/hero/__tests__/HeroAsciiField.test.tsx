import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { MotionValue } from 'motion/react';

vi.mock('motion/react', () => ({
  useMotionValueEvent: () => {},
}));

import { HeroAsciiField } from '../HeroAsciiField';
import { LandingPartnerMarquee } from '../../LandingPartnerMarquee';

// jsdom has no real canvas backend — a self-returning Proxy no-ops every 2D
// context method/property (including chained calls like createRadialGradient(...).addColorStop(...))
// without needing to hand-list the full CanvasRenderingContext2D surface.
function makeNoopCanvasContext(): CanvasRenderingContext2D {
  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      if (prop === 'canvas') return undefined;
      const fn = (..._args: unknown[]) => proxy;
      return new Proxy(fn, handler);
    },
    set: () => true,
  };
  const proxy = new Proxy(function noop() {}, handler);
  return proxy as unknown as CanvasRenderingContext2D;
}

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

const stillScrollValue = { get: () => 0 } as unknown as MotionValue<number>;

describe('HeroAsciiField', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => makeNoopCanvasContext(),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // @ts-expect-error remove the test stub
    delete window.matchMedia;
  });

  it('starts the animation loop (rAF) on mount', () => {
    stubMatchMedia(false);
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    render(<HeroAsciiField scrollYProgress={stillScrollValue} />);
    expect(rafSpy).toHaveBeenCalled();
  });

  it('still starts the animation loop when the OS prefers reduced motion (landing ignores the preference)', () => {
    stubMatchMedia(true);
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    render(<HeroAsciiField scrollYProgress={stillScrollValue} />);
    expect(rafSpy).toHaveBeenCalled();
    expect(addEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function), {
      passive: true,
    });
  });

  it('interleaves stable partner-colored glyphs with the original trail and restores it on leave and unmount', () => {
    stubMatchMedia(true);
    let frame: FrameRequestCallback;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frame = callback; return 1; });
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 520, height: 260, left: 0, top: 0 } as DOMRect);
    let paints = new Map<string, string>();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      const context = makeNoopCanvasContext();
      let fillStyle = '';
      return new Proxy(context, {
        set: (_target, key, value) => { if (key === 'fillStyle') fillStyle = value; return true; },
        get: (target, key) => key === 'fillText' ? (text: string, x: number, y: number) => {
          if (text.trim()) paints.set(`${x},${y}`, fillStyle);
        } : Reflect.get(target, key),
      });
    });
    // Replay identical pointer energy so differences measure the palette, not trail decay.
    const drawTrail = () => {
      paints = new Map();
      const field = render(<HeroAsciiField scrollYProgress={stillScrollValue} />);
      fireEvent.pointerMove(window, { clientX: 260, clientY: 130 });
      act(() => frame(40));
      field.unmount();
      return new Map(paints);
    };
    const baseline = drawTrail();
    expect(baseline.size).toBeGreaterThan(10);
    const partners = render(<LandingPartnerMarquee />);
    const partnerPalettes: Map<string, string>[] = [];
    for (const name of ['토스페이먼츠', '키움페이', '헥토파이낸셜']) {
      const logo = screen.getByRole('img', { name });
      fireEvent.mouseEnter(logo);
      const mixed = drawTrail();
      expect([...mixed.keys()]).toEqual([...baseline.keys()]);
      const changed = [...mixed].filter(([position, color]) => color !== baseline.get(position));
      expect(changed.length).toBeGreaterThan(baseline.size * 0.2);
      expect(changed.length).toBeLessThan(baseline.size * 0.6);
      expect(drawTrail()).toEqual(mixed);
      partnerPalettes.push(mixed);
      fireEvent.mouseLeave(logo);
      expect(drawTrail()).toEqual(baseline);
    }
    expect(partnerPalettes[0]).not.toEqual(partnerPalettes[1]);
    expect(partnerPalettes[1]).not.toEqual(partnerPalettes[2]);
    fireEvent.mouseEnter(screen.getByRole('img', { name: '키움페이' }));
    partners.unmount();
    expect(drawTrail()).toEqual(baseline);
  });
});
