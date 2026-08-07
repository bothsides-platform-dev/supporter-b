'use client';

import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

// Hardcoded because the Web Animations API requires literal values (it cannot
// read CSS custom properties at animation time). DURATION is a hand-copy of a
// motion token in styles/tokens.css — keep it in sync by hand. EASING is NOT a
// token: no token expresses "no curve", and this animation specifically wants
// none (see below). Both literals are pinned in __tests__/view-transition.test.ts
// against silent drift.
//
// `linear` is deliberate, and it is the resolution of a real tension.
//
// The animated value is the circle's radius, but the eye reads the area swept:
// dA/dt = 2πr · dr/dt. So a linear radius already *looks* like an accelerating
// wipe — the sweep gets faster on its own as r grows, for free.
//
// This used to be `cubic-bezier(0.3, 0, 0.8, 0.15)` (emphasized-accelerate),
// picked by eye from six curves. Stacking an ease-in on top of that built-in
// acceleration overcorrected: measured on a production build, the radius was
// still ~0 for the first ~90ms of the 350ms, so nothing happened near the icon
// and the reveal read as starting somewhere in the middle-left of the screen
// instead of at the toggle. The origin was never wrong — only invisible.
// Going the other way (a decelerate curve) is worse still: it front-loads the
// radius and then crawls across the widest, most visible outer ring.
//
// Linear keeps the emergence at the icon legible from the first frames while the
// area paradox supplies the acceleration the tail needs. If you change this,
// re-measure the first 100ms — that window is what carries "it started here".
const EASING = 'linear';
const DURATION = 350; // --md-sys-motion-duration-medium-4

// Prevents mid-animation re-entry: the browser tears a partial circle if a
// new transition starts before the previous one finishes. While in-flight,
// fall back to an instant switch instead.
let inFlight = false;

/**
 * Wraps a theme-apply callback in a View Transitions clip-path circle reveal
 * that spreads outward from `origin` (the toggle button's centre).
 *
 * Falls back to an instant switch when:
 *   • the browser does not support `document.startViewTransition`
 *   • the user prefers-reduced-motion: reduce
 *   • a transition is already in progress (rapid re-click)
 *
 * DESIGN.md §9 sanctioned exception: user-initiated, GPU-composited
 * clip-path on a pseudo-element, brand-neutral, respects reduced-motion.
 */
export function applyThemeWithTransition(
  origin: { x: number; y: number },
  apply: () => void,
): void {
  const supported =
    typeof document !== 'undefined' &&
    typeof (document as Document & { startViewTransition?: unknown })
      .startViewTransition === 'function';

  if (!supported || prefersReducedMotion() || inFlight) {
    apply();
    return;
  }

  const { x, y } = origin;

  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  inFlight = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transition = (document as any).startViewTransition(() => {
    apply();
  }) as { ready: Promise<void>; finished: Promise<void> };

  transition.finished.catch(() => {}).finally(() => {
    inFlight = false;
  });

  transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: DURATION,
          easing: EASING,
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch((err: unknown) => {
      if (err instanceof DOMException) return; // VT aborted — theme already applied
      console.error('[view-transition]', err);
    });
}
