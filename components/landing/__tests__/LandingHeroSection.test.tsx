import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode);
    El.displayName = `motion.${tag}`;
    return El;
  };
  return {
    motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }),
    // 핀 씬(HeroPinnedScene)의 스크롤 스크럽 훅 — jsdom에는 스크롤 레이아웃이 없으므로 정지값 스텁.
    useScroll: () => ({ scrollYProgress: { get: () => 0, on: () => () => {} } }),
    useTransform: () => 0,
    useMotionValueEvent: () => {},
    // 마그네틱 CTA(useMagneticHover) 스텁 — set 가능한 정지 MotionValue 흉내.
    useMotionValue: () => ({ set: () => {}, get: () => 0 }),
    useSpring: () => 0,
  };
});

vi.mock('@/components/primitives/Button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

import { LandingHeroSection } from '../LandingHeroSection';

describe('LandingHeroSection', () => {
  it('renders the static h1 text', () => {
    render(<LandingHeroSection />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('서포트 B를 통해');
  });

  it('renders the first TYPING_VALUE as initial text (not empty)', () => {
    render(<LandingHeroSection />);
    expect(screen.getByText('협상의 주도권을')).toBeInTheDocument();
  });

  it('routes the hero CTA to /rfp-create', () => {
    render(<LandingHeroSection />);
    const cta = screen.getByRole('link', { name: /PG 비교 견적 무료로 시작하기/ });
    expect(cta).toHaveAttribute('href', '/rfp-create');
  });

  it('renders the service-value subtext below the headline', () => {
    render(<LandingHeroSection />);
    expect(
      screen.getByText(/여러 PG사의 제안을 동일한 기준으로 받아보고/),
    ).toBeInTheDocument();
  });
});
