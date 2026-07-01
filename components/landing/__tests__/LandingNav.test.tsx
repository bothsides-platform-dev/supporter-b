import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LandingNav } from '../LandingNav';

// 최상위 섹션 앵커(서비스 설명은 드롭다운 트리거라 제외).
const TOP_ANCHORS: [string, string][] = [
  ['이용요금', '#pricing'],
  ['비용 절감 계산기', '#calculator'],
  ['자주 묻는 질문', '#faq'],
  ['도입문의', '#contact'],
];

describe('LandingNav', () => {
  it('renders the top-level section anchor links', () => {
    render(<LandingNav authed={false} />);
    for (const [label, href] of TOP_ANCHORS) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('orders the top-level anchors to match the landing section flow', () => {
    render(<LandingNav authed={false} />);
    const order = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter((h): h is string => !!h && h.startsWith('#'));
    expect(order).toEqual(['#pricing', '#calculator', '#faq', '#contact']);
  });

  it('exposes 서비스 설명 as a dropdown trigger (collapsed by default)', () => {
    render(<LandingNav authed={false} />);
    const trigger = screen.getByRole('button', { name: /서비스 설명/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // 닫혀 있을 때 PG 비교 견적(#service) 링크는 노출되지 않는다.
    expect(screen.queryByRole('link', { name: /PG 비교 견적/ })).toBeNull();
  });

  it('reveals the product lineup when 서비스 설명 is opened', () => {
    render(<LandingNav authed={false} />);
    fireEvent.click(screen.getByRole('button', { name: /서비스 설명/ }));

    // PG는 이용 가능 → #service 로 이동하는 링크.
    expect(screen.getByRole('link', { name: /PG 비교 견적/ })).toHaveAttribute('href', '#service');

    // 클라우드·메신저는 오픈 예정 안내(링크 아님).
    expect(screen.getByText('클라우드')).toBeInTheDocument();
    expect(screen.getByText('2026. 4Q 오픈 예정')).toBeInTheDocument();
    expect(screen.getByText('메신저')).toBeInTheDocument();
    expect(screen.getByText('2026. 3Q 오픈 예정')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /클라우드/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /메신저/ })).toBeNull();
  });

  it('shows a 로그인 link to /login when unauthenticated', () => {
    render(<LandingNav authed={false} />);
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: /앱으로 이동/ })).toBeNull();
  });

  it('shows an app link to /home when authenticated', () => {
    render(<LandingNav authed />);
    expect(screen.getByRole('link', { name: /앱으로 이동/ })).toHaveAttribute('href', '/home');
    expect(screen.queryByRole('link', { name: '로그인' })).toBeNull();
  });

  it('toggles the mobile menu via the hamburger button', () => {
    render(<LandingNav authed={false} />);
    const toggle = screen.getByRole('button', { name: /메뉴/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('landing-mobile-menu')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByTestId('landing-mobile-menu');
    expect(within(menu).getByRole('link', { name: '이용요금' })).toHaveAttribute('href', '#pricing');
  });
});
