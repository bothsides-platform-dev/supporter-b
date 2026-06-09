import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render, screen } from '@testing-library/react';

// Radix Slider observes element size; jsdom has no ResizeObserver.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

// CostComparisonChart pulls in motion/react — stub it; this suite is about the
// calculator's copy/value surface, not the bar chart.
vi.mock('@/components/landing/CostComparisonChart', () => ({
  CostComparisonChart: () => null,
}));

// useInView is controllable per-test so we can exercise the first-visit hint.
const motionHoisted = vi.hoisted(() => ({ inView: false }));
vi.mock('motion/react', () => ({
  useInView: () => motionHoisted.inView,
}));

import { SavingsCalculator } from '../SavingsCalculator';

describe('SavingsCalculator', () => {
  it('does not show any minimum-fee claim (최저가능)', () => {
    render(<SavingsCalculator />);
    expect(screen.queryByText(/최저\s*가능/)).toBeNull();
  });

  it('highlights the estimated annual savings amount', () => {
    render(<SavingsCalculator />);
    // savings value is rendered as a KRW string (…원)
    expect(screen.getByText(/원$/)).toBeInTheDocument();
    expect(screen.getByText('EST. ANNUAL SAVINGS')).toBeInTheDocument();
  });

  it('keeps an estimate disclaimer without claiming a floor rate', () => {
    render(<SavingsCalculator />);
    const note = screen.getByText(/추정/);
    expect(note.textContent).toMatch(/실제/);
    expect(note.textContent).not.toMatch(/최저\s*가능/);
  });

  it('does not show the first-visit slider hint when the calculator is not in view', () => {
    render(<SavingsCalculator />);
    expect(screen.queryByText(/드래그/)).toBeNull();
  });
});

describe('SavingsCalculator — first-visit slider hint', () => {
  beforeEach(() => {
    motionHoisted.inView = true;
    window.localStorage.clear();
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date', 'performance'],
    });
    // Non-reduced-motion so the hint animation runs.
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
    window.localStorage.clear();
  });

  it('shows the drag hint on first visit once the calculator is in view', () => {
    render(<SavingsCalculator />);
    act(() => {
      vi.advanceTimersByTime(60); // a few rAF frames → first tick sets hint active
    });
    expect(screen.getByText('드래그해서 조정해 보세요')).toBeInTheDocument();
  });

  it('does not replay the hint once it has been seen', () => {
    window.localStorage.setItem('sb:calc-hint-seen', '1');
    render(<SavingsCalculator />);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(screen.queryByText('드래그해서 조정해 보세요')).toBeNull();
  });
});
