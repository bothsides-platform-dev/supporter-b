import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render, screen } from '@testing-library/react';

// useInView is controllable per-test so we can exercise the stepped emphasis.
const motionHoisted = vi.hoisted(() => ({ inView: true }));
vi.mock('motion/react', () => ({ useInView: () => motionHoisted.inView }));

// The table is covered by its own suite — stub it so this suite focuses on the
// solution-point list / stepper.
vi.mock('@/components/landing/OfferComparisonTable', () => ({
  OfferComparisonTable: () => null,
}));

import { SolutionShowcase } from '../SolutionShowcase';

const POINTS = ['포인트 하나', '포인트 둘', '포인트 셋', '포인트 넷'];

describe('SolutionShowcase', () => {
  it('renders every solution point, each with a check mark', () => {
    // jsdom has no matchMedia → reduced-motion → no stepping; all points neutral.
    render(<SolutionShowcase points={POINTS} />);
    for (const p of POINTS) {
      expect(screen.getByText(p)).toBeInTheDocument();
    }
    // one check svg per point
    expect(document.querySelectorAll('svg').length).toBeGreaterThanOrEqual(POINTS.length);
  });

  describe('stepped emphasis', () => {
    beforeEach(() => {
      motionHoisted.inView = true;
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
      });
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as typeof window.matchMedia;
    });
    afterEach(() => {
      motionHoisted.inView = false;
      vi.useRealTimers();
      // @ts-expect-error remove the test stub
      delete window.matchMedia;
    });

    it('emphasizes exactly one step at a time and advances over time', () => {
      render(<SolutionShowcase points={POINTS} />);

      act(() => {
        vi.advanceTimersByTime(1); // kick → step 0 active
      });
      const items = () => screen.getAllByRole('listitem');
      expect(items()[0]).toHaveAttribute('data-active', 'true');
      expect(
        items().filter((li) => li.getAttribute('data-active') === 'true'),
      ).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(2800); // interval → step 1 active
      });
      expect(items()[1]).toHaveAttribute('data-active', 'true');
      expect(items()[0]).not.toHaveAttribute('data-active');
    });
  });
});
