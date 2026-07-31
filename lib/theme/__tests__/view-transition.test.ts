import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyThemeWithTransition } from '../view-transition';

// ── helpers ────────────────────────────────────────────────────────────────

function stubMatchMedia(reducedMotion: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches:
        query === '(prefers-reduced-motion: reduce)' ? reducedMotion : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('applyThemeWithTransition', () => {
  const origin = { x: 100, y: 200 };

  beforeEach(() => {
    // Remove startViewTransition by default; individual tests add it back.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (document as any).startViewTransition;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Unsupported browser ─────────────────────────────────────────────

  it('calls apply() immediately when startViewTransition is not supported', () => {
    stubMatchMedia(false);
    const apply = vi.fn();

    applyThemeWithTransition(origin, apply);

    expect(apply).toHaveBeenCalledOnce();
  });

  it('does NOT call startViewTransition when it is not supported', () => {
    stubMatchMedia(false);
    const apply = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).startViewTransition = vi.fn();

    // Remove it right away to simulate unsupported
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (document as any).startViewTransition;

    applyThemeWithTransition(origin, apply);

    expect(apply).toHaveBeenCalledOnce();
  });

  // ── 2. prefers-reduced-motion: reduce ─────────────────────────────────

  it('calls apply() immediately when prefers-reduced-motion is set', () => {
    stubMatchMedia(true); // reduced motion ON
    const apply = vi.fn();
    const startViewTransition = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).startViewTransition = startViewTransition;

    applyThemeWithTransition(origin, apply);

    expect(apply).toHaveBeenCalledOnce();
    expect(startViewTransition).not.toHaveBeenCalled();
  });

  // ── 3. Supported + no reduced motion → full animation ─────────────────

  it('calls startViewTransition when supported and no reduced motion', async () => {
    stubMatchMedia(false);
    const apply = vi.fn();
    const readyResolve = Promise.resolve();
    const finishedResolve = Promise.resolve();
    const animate = vi.fn();
    const startViewTransition = vi.fn().mockImplementation((cb: () => void) => {
      cb(); // invoke the callback synchronously (apply the theme)
      return { ready: readyResolve, finished: finishedResolve };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).startViewTransition = startViewTransition;
    document.documentElement.animate = animate;

    applyThemeWithTransition(origin, apply);

    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledOnce(); // called inside the transition callback

    // Wait for ready and finished microtasks (finished resets inFlight)
    await readyResolve;
    await finishedResolve;

    expect(animate).toHaveBeenCalledOnce();
    const [keyframes, options] = animate.mock.calls[0];

    // Keyframes must be a clip-path circle expansion
    expect(keyframes).toEqual({
      clipPath: [
        `circle(0px at ${origin.x}px ${origin.y}px)`,
        expect.stringMatching(/^circle\(\d+(\.\d+)?px at 100px 200px\)$/),
      ],
    });

    // Must target the ::view-transition-new pseudo-element.
    // duration/easing are pinned as literals on purpose: they are hand-copies of
    // motion tokens (styles/tokens.css), so a silent drift must fail here rather
    // than pass by comparing a constant to itself.
    expect(options).toMatchObject({
      pseudoElement: '::view-transition-new(root)',
      duration: 350, // --md-sys-motion-duration-medium-4
      easing: 'cubic-bezier(0.3, 0, 0.8, 0.15)', // --md-sys-motion-easing-emphasized-accelerate
    });
  });

  it('computes endRadius to cover the farthest viewport corner', async () => {
    stubMatchMedia(false);

    const origWidth = window.innerWidth;
    const origHeight = window.innerHeight;

    // Simulate button at top-left (100, 50); viewport 800×600
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 600 });

    try {
      const buttonOrigin = { x: 100, y: 50 };
      // farthest corner = bottom-right: (800-100)=700, (600-50)=550 → hypot(700,550) ≈ 891
      const expectedRadius = Math.hypot(
        Math.max(buttonOrigin.x, 800 - buttonOrigin.x),
        Math.max(buttonOrigin.y, 600 - buttonOrigin.y),
      );

      const animate = vi.fn();
      const readyResolve = Promise.resolve();
      const finishedResolve = Promise.resolve();
      const startViewTransition = vi.fn().mockImplementation((cb: () => void) => {
        cb();
        return { ready: readyResolve, finished: finishedResolve };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).startViewTransition = startViewTransition;
      document.documentElement.animate = animate;

      applyThemeWithTransition(buttonOrigin, vi.fn());
      await readyResolve;
      await finishedResolve;

      const [{ clipPath }] = animate.mock.calls[0];
      const endClip: string = clipPath[1];
      expect(endClip).toBe(
        `circle(${expectedRadius}px at ${buttonOrigin.x}px ${buttonOrigin.y}px)`,
      );
    } finally {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: origWidth });
      Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: origHeight });
    }
  });

  // ── 4. In-flight guard ────────────────────────────────────────────────────

  it('falls back to instant switch when a transition is already in flight', async () => {
    stubMatchMedia(false);

    let resolveFinished!: () => void;
    const finishedPromise = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });

    const startViewTransition = vi.fn().mockImplementation((cb: () => void) => {
      cb();
      return { ready: Promise.resolve(), finished: finishedPromise };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).startViewTransition = startViewTransition;
    document.documentElement.animate = vi.fn();

    // First call — starts an in-flight transition
    applyThemeWithTransition(origin, vi.fn());

    // Second call while finishedPromise is still pending (inFlight = true)
    const apply2 = vi.fn();
    applyThemeWithTransition(origin, apply2);

    // apply2 must have been called immediately (instant fallback, not a second VT)
    expect(apply2).toHaveBeenCalledOnce();
    expect(startViewTransition).toHaveBeenCalledTimes(1);

    // Resolve so inFlight resets before the next test
    resolveFinished();
    await finishedPromise;
  });
});
