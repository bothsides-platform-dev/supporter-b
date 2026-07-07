import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// 구매사 히어로와 같은 핀 씬(HeroPinnedScene)을 재사용하므로 스크롤 스크럽·마그네틱 훅을
// jsdom 안전한 정지값으로 스텁한다(LandingHeroSection.test.tsx 와 동일 패턴).
vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, props, children as React.ReactNode);
    El.displayName = `motion.${tag}`;
    return El;
  };
  return {
    motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }),
    useScroll: () => ({ scrollYProgress: { get: () => 0, on: () => () => {} } }),
    useTransform: () => 0,
    useMotionValueEvent: () => {},
    useMotionValue: () => ({ set: () => {}, get: () => 0 }),
    useSpring: () => 0,
  };
});

import { PgHeroSection } from '../PgHeroSection';

describe('PgHeroSection — PG 파트너 랜딩 히어로 (구매사 히어로 풀 패리티)', () => {
  it('브랜드 라인(서포트비로)을 h1로 렌더한다', () => {
    render(<PgHeroSection />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('서포트비로');
  });

  it('첫 순환 문구를 초기 정착 텍스트로 렌더한다', () => {
    render(<PgHeroSection />);
    expect(screen.getByText('확실한 니즈의 고객사를')).toBeInTheDocument();
  });

  it('접미 문구 "만나세요."를 렌더한다', () => {
    render(<PgHeroSection />);
    expect(screen.getByText('만나세요.')).toBeInTheDocument();
  });

  it('파트너 시작하기 CTA 를 내부 가입 링크(/signup/pg)로 렌더한다', () => {
    render(<PgHeroSection />);
    const cta = screen.getByRole('link', { name: /파트너로 시작하기/ });
    expect(cta).toHaveAttribute('href', '/signup/pg');
  });

  it('PG 가치 제안 서브카피를 렌더한다', () => {
    render(<PgHeroSection />);
    expect(
      screen.getByText(/리드 발굴과 자격 검증에 쓰던 시간을 아끼고/),
    ).toBeInTheDocument();
  });

  it('제품 창 위 리드 카피(먼저 닿으세요)를 렌더한다', () => {
    render(<PgHeroSection />);
    expect(
      screen.getByText(/이미 PG 조건을 비교 중인 고객사에게 먼저 닿으세요/),
    ).toBeInTheDocument();
  });
});
