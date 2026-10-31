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
  it('places the partner slot in the hero instead of the scroll cue', () => {
    render(<LandingHeroSection partners={<section aria-label="파트너 로고" />} />);
    expect(screen.getByRole('region', { name: '파트너 로고' })).toBeInTheDocument();
    expect(screen.queryByText('Scroll')).not.toBeInTheDocument();
  });
  it('scrolls from the hero to the embedded demo section', () => {
    render(<LandingHeroSection />);
    expect(screen.getByRole('link', { name: '데모 체험하기' })).toHaveAttribute('href', '#process');
  });
  it('renders the static h1 text', () => {
    render(<LandingHeroSection />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('PG사마다 같은 설명을 반복하기 번거로울 때. 서포트비를 찾아주세요.');
  });

  it('routes the hero CTA to /quote-start', () => {
    render(<LandingHeroSection />);
    const cta = screen.getByRole('link', { name: /맞춤 PG 견적 무료로 받기/ });
    expect(cta).toHaveAttribute('href', '/quote-start');
  });
});
