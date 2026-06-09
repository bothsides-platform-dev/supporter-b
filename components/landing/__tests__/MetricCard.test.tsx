import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render, screen } from '@testing-library/react';

const motionHoisted = vi.hoisted(() => ({ inView: true }));
vi.mock('motion/react', () => ({
  useInView: () => motionHoisted.inView,
}));

import { MetricCard } from '../MetricCard';

describe('MetricCard', () => {
  it('renders the formatted target value (reduced-motion → instant, no count-up)', () => {
    // jsdom has no matchMedia → prefersReducedMotion → final value immediately
    render(<MetricCard to={0.89} decimals={2} unit="%" qualifier="절감" caption="평균 절감 비율" />);
    expect(screen.getByText('0.89%')).toBeInTheDocument();
    expect(screen.getByText('절감')).toBeInTheDocument();
  });

  describe('count-up animation', () => {
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date', 'performance'],
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
      vi.useRealTimers();
      // @ts-expect-error remove the test stub
      delete window.matchMedia;
    });

    it('counts up to the target value over time', () => {
      render(<MetricCard to={2300} decimals={0} unit="만원" caption="연간 절감액" />);
      act(() => {
        vi.advanceTimersByTime(2000); // past COUNT_MS (1.4s) → lands on target
      });
      expect(screen.getByText('2300만원')).toBeInTheDocument();
    });
  });
});
