import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingHero } from '../LandingHero';

vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode);
    El.displayName = `motion.${tag}`;
    return El;
  };
  const motion = new Proxy({}, { get: (_, tag: string) => makeEl(tag as string) });
  return {
    motion,
    useScroll: () => ({ scrollYProgress: { on: vi.fn() } }),
    useMotionValueEvent: vi.fn(),
    useInView: () => true,
  };
});

vi.mock('@/components/landing/SavingsCalculator', () => ({ SavingsCalculator: () => null }));
vi.mock('@/components/landing/OfferComparisonTable', () => ({ OfferComparisonTable: () => null }));
vi.mock('@/components/landing/ProcessSection', () => ({ ProcessSection: () => null }));
vi.mock('@/components/landing/FaqList', () => ({ FaqList: () => null }));

vi.mock('@/lib/stores/theme', () => ({
  useThemeStore: (selector: (s: { resolvedTheme: string; setTheme: (t: string) => void }) => unknown) =>
    selector({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

describe('LandingHero footer', () => {
  it('renders site footer with theme toggle and not in the header', () => {
    render(<LandingHero />);

    const toggle = screen.getByRole('button', { name: '다크 모드로 전환' });
    expect(toggle).toBeInTheDocument();

    const footer = screen.getByRole('contentinfo');
    expect(footer).toContainElement(toggle);

    const header = screen.getByRole('banner');
    expect(header).not.toContainElement(toggle);
  });
});
