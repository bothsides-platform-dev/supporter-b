'use client';

import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

// Emphasized-decelerate easing from --md-sys-motion-easing-emphasized-decelerate.
// Hardcoded because the Web Animations API requires a literal string (cannot
// read CSS custom properties at animation time).
const EASING = 'cubic-bezier(0.05, 0.7, 0.1, 1)';

// Duration matches --md-sys-motion-duration-medium-4 (350ms) — "Linear-snappy"
// agreed with the user: snappier than rdsx.dev's ~500ms to suit the app's
// dense/fast design ethos without feeling sluggish on repeat toggles.
const DURATION = 350;

/**
 * Wraps a theme-apply callback in a View Transitions clip-path circle reveal
 * that spreads outward from `origin` (the toggle button's centre).
 *
 * Falls back to an instant switch when:
 *   • the browser does not support `document.startViewTransition`
 *   • the user prefers-reduced-motion: reduce
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

  if (!supported || prefersReducedMotion()) {
    apply();
    return;
  }

  const { x, y } = origin;

  // Compute radius to the farthest viewport corner so the circle fully covers
  // the screen regardless of where the button sits.
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transition = (document as any).startViewTransition(() => {
    apply();
  }) as { ready: Promise<void> };

  transition.ready.then(() => {
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
  });
}
