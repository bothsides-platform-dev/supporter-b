import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// PgLandingHeaderNav 는 클라이언트에서 /api/auth/session 을 fetch 하는 훅(useSessionAuthed)을
// 쓴다 — 이 스모크 테스트는 그 세션 조회와 무관하므로 스텁으로 대체(nav 자체는 PgLandingNav.test 에서 커버).
vi.mock('../PgLandingHeaderNav', () => ({
  PgLandingHeaderNav: () => <a href="/login">로그인</a>,
}));

// Footer 는 테마/스토어 의존이 있어 스모크에서 격리한다.
vi.mock('@/components/shell/Footer', () => ({
  Footer: () => <footer>footer</footer>,
}));

// 임베드 PG 제품 데모(실제 페이지·사이드바 의존)는 스모크에서 마커로 대체한다.
vi.mock('@/components/landing/demo-app/PgDemoAppShell', () => ({
  PgDemoAppShell: () => <div>PG_PRODUCT_DEMO</div>,
}));

// 화면1 히어로는 캔버스 ASCII·마그네틱 훅에 의존하는 스크롤 핀 씬(구매사 히어로 풀 패리티)이라
// 이 컴포지션 스모크에서는 마커로 격리한다(히어로 자체는 PgHeroSection.test 에서 커버).
vi.mock('@/components/landing/PgHeroSection', () => ({
  PgHeroSection: () => <div>PG_HERO</div>,
}));

// motion 을 평탄화해 whileInView/IntersectionObserver 없이 자식을 그대로 렌더.
vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(
        tag,
        // motion 전용 prop 은 DOM 으로 흘리지 않는다.
        Object.fromEntries(
          Object.entries(props).filter(
            ([k]) =>
              !['initial', 'animate', 'whileInView', 'viewport', 'transition', 'exit'].includes(k),
          ),
        ),
        children as React.ReactNode,
      );
    El.displayName = `motion.${tag}`;
    return El;
  };
  return {
    motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }),
    // ScrollPinnedSection·PinnedDemoFrame(스크롤 pin) 이 쓰는 훅 스텁(always-pin이라 항상 호출).
    useScroll: () => ({ scrollYProgress: { on: vi.fn() } }),
    useMotionValueEvent: vi.fn(),
    useTransform: () => 1,
  };
});

import { PgLanding } from '../PgLanding';

describe('PgLanding — PG 전용 랜딩', () => {
  it('화면2 문제 제기 섹션 제목과 카드를 렌더한다', () => {
    render(<PgLanding />);
    expect(screen.getByText(/확실한 니즈입니다/)).toBeInTheDocument();
    expect(screen.getByText('관심은 있지만 움직이지 않는 고객사')).toBeInTheDocument();
  });

  it('화면3 성장 고객사 인바운드 섹션과 고객사 유형 카드를 누적 리스트로 렌더한다', () => {
    render(<PgLanding />);
    expect(screen.getByText('새로운 성장 고객사가 PG사를 찾아오게 만듭니다')).toBeInTheDocument();
    // 누적 스택은 모든 카드를 한 번에 렌더한다(과거 캐러셀은 활성 카드 1개만 렌더).
    expect(screen.getByText('PG 변경을 검토하는 기존 가맹점')).toBeInTheDocument();
    expect(screen.getByText('복수 PG 조건을 비교하는 구매 의사 보유 고객사')).toBeInTheDocument();
  });

  it('화면4 검증 섹션 제목을 렌더한다 (공정 대신 동일)', () => {
    render(<PgLanding />);
    expect(
      screen.getByText('검증된 고객사의 영업기회를 동일한 기준으로 제공합니다'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/공정/)).toBeNull();
  });

  it('화면5 참여 프로세스 5단계 중 1단계를 렌더한다', () => {
    render(<PgLanding />);
    expect(screen.getByText('파트너 참여 방식은 간단합니다')).toBeInTheDocument();
    expect(screen.getByText('파트너 등록')).toBeInTheDocument();
  });

  it('화면5에 제품 데모를 임베드한다', () => {
    render(<PgLanding />);
    expect(screen.getByText('PG_PRODUCT_DEMO')).toBeInTheDocument();
  });

  it('화면6 파트너 사례 섹션과 사례 카드를 렌더한다', () => {
    render(<PgLanding />);
    expect(screen.getByText('영업팀은 더 좋은 기회에 집중할 수 있습니다')).toBeInTheDocument();
    expect(screen.getByText('K사 영업 팀장')).toBeInTheDocument();
  });

  it('화면7 PG 전용 FAQ 문항을 렌더한다', () => {
    render(<PgLanding />);
    expect(
      screen.getByText('Supporter B의 리드는 어떤 기준으로 검증되나요?'),
    ).toBeInTheDocument();
  });

  it('화면8 최종 CTA 의 보조 버튼 제휴 소개서 받기를 렌더한다', () => {
    render(<PgLanding />);
    expect(screen.getByText('확실한 니즈가 있는 고객사를 먼저 만나세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /제휴 소개서 받기/ })).toBeInTheDocument();
  });

  it('파트너 상담 신청 CTA 가 본문에 1개 이상 존재한다', () => {
    render(<PgLanding />);
    const ctas = screen.getAllByRole('button', { name: /파트너 상담 신청/ });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
  });

  it('PG FAQPage JSON-LD 를 렌더한다', () => {
    const { container } = render(<PgLanding />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const schemas = Array.from(scripts).map((s) => JSON.parse(s.textContent!));
    const faq = schemas.find((s) => s['@type'] === 'FAQPage');
    expect(faq).toBeTruthy();
    expect(Array.isArray(faq.mainEntity)).toBe(true);
    expect(faq.mainEntity.length).toBe(7);
  });

  it('일러스트(webp) 이미지를 렌더하지 않는다', () => {
    const { container } = render(<PgLanding />);
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });
});
