'use client';

import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

// Hardcoded because the Web Animations API requires a literal string (cannot
// read CSS custom properties at animation time). Both mirror motion tokens in
// styles/tokens.css — keep them in sync by hand; the literals in
// __tests__/view-transition.test.ts pin them against silent drift.
//
// Accelerate (not decelerate) is deliberate. The animated value is the circle's
// radius, but the eye reads the area swept: dA/dt = 2πr · dr/dt, so the same
// radius speed wipes far more screen once r is large. A decelerate curve front-
// loads the radius and spends the tail crawling across the widest ring; the
// accelerate curve keeps the reveal restrained until it commits. Chosen by
// side-by-side comparison of six curves against the real app shell.
const EASING = 'cubic-bezier(0.3, 0, 0.8, 0.15)'; // --md-sys-motion-easing-emphasized-accelerate
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
