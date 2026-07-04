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
    useScroll: () => ({ scrollYProgress: { get: () => 0, on: vi.fn() } }),
    useMotionValueEvent: vi.fn(),
    useTransform: () => 1,
    useInView: () => true,
    // 히어로 마그네틱 CTA(useMagneticHover) 스텁
    useMotionValue: () => ({ set: vi.fn(), get: () => 0 }),
    useSpring: () => 0,
  };
});

vi.mock('@/components/landing/SavingsCalculator', () => ({ SavingsCalculator: () => null }));
vi.mock('@/components/landing/SolutionShowcase', () => ({ SolutionShowcase: () => null }));
vi.mock('@/components/landing/demo-app/DemoAppShell', () => ({ DemoAppShell: () => null }));
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
