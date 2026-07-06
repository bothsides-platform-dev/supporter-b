import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import type { MotionValue } from 'motion/react';

vi.mock('motion/react', () => ({
  useMotionValueEvent: () => {},
}));

import { HeroAsciiField } from '../HeroAsciiField';

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
});
