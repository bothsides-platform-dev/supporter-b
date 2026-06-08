import { describe, it, expect, vi } from 'vitest';
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
});
