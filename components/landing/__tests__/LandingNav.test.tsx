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

  it('does not show the docs link in desktop or mobile navigation', () => {
    render(<LandingNav authed={false} />);
    expect(screen.queryByRole('link', { name: 'PG 용어 사전' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /메뉴 열기/ }));
    const menu = screen.getByTestId('landing-mobile-menu');
    expect(within(menu).queryByRole('link', { name: 'PG 용어 사전' })).toBeNull();
  });

  it('exposes 서비스 설명 as a dropdown trigger (collapsed by default)', () => {
    render(<LandingNav authed={false} />);
    const trigger = screen.getByRole('button', { name: /서비스 설명/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // 닫혀 있을 때 맞춤 PG 견적(#service) 링크는 노출되지 않는다.
    expect(screen.queryByRole('link', { name: /맞춤 PG 견적/ })).toBeNull();
  });

  it('reveals the product lineup when 서비스 설명 is opened', () => {
    render(<LandingNav authed={false} />);
    fireEvent.click(screen.getByRole('button', { name: /서비스 설명/ }));

    // PG는 이용 가능 → #service 로 이동하는 링크.
    expect(screen.getByRole('link', { name: /맞춤 PG 견적/ })).toHaveAttribute('href', '#service');
    expect(screen.getByText('이용 가능')).toBeInTheDocument();
    expect(screen.getByText('우리 업종에 맞는 PG사 견적을 받아봐요.')).toBeInTheDocument();

    // 예정 서비스는 같은 일정으로 안내하고 링크를 제공하지 않아요.
    expect(screen.getByText('클라우드')).toBeInTheDocument();
    expect(screen.getByText('클라우드 인프라 비용을 비교해요.')).toBeInTheDocument();
    expect(screen.getByText('메신저')).toBeInTheDocument();
    expect(screen.getByText('비즈니스 메신저의 도입 조건을 비교해요.')).toBeInTheDocument();
    expect(screen.getByText('본인인증')).toBeInTheDocument();
    expect(screen.getByText('본인인증 서비스의 도입 조건과 비용을 비교해요.')).toBeInTheDocument();
    const menu = screen.getByTestId('landing-service-menu');
    const plannedStatuses = Array.from(menu.querySelectorAll('.md-numeric'), (year) =>
      year.parentElement?.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(plannedStatuses).toEqual(Array(3).fill('2027년 상반기 오픈 예정'));
    expect(document.querySelectorAll('[data-testid="landing-service-menu"] a[href="#service"]')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /클라우드/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /메신저/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /본인인증/ })).toBeNull();
  });

  it('does not open the service menu on hover — only on click', () => {
    render(<LandingNav authed={false} />);
    const trigger = screen.getByRole('button', { name: /서비스 설명/ });
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseEnter(trigger.parentElement!);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('landing-service-menu')).toBeNull();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // 열린 뒤 포인터가 벗어나도 닫히지 않는다.
    fireEvent.mouseLeave(trigger.parentElement!);
    expect(screen.getByTestId('landing-service-menu')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the service menu on outside click and Escape', () => {
    render(<LandingNav authed={false} />);
    const trigger = screen.getByRole('button', { name: /서비스 설명/ });

    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByTestId('landing-service-menu'));
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('shows a 로그인 link to /login when unauthenticated', () => {
    render(<LandingNav authed={false} />);
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: /앱으로 이동/ })).toBeNull();
    expect(screen.getByRole('link', { name: '맞춤 견적 받기' })).toHaveAttribute('href', '/rfp-create');
  });

  it('shows an app link to /home when authenticated', () => {
    render(<LandingNav authed />);
    expect(screen.getByRole('link', { name: /앱으로 이동/ })).toHaveAttribute('href', '/home');
    expect(screen.queryByRole('link', { name: '로그인' })).toBeNull();
    expect(screen.queryByRole('link', { name: '맞춤 견적 받기' })).toBeNull();
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
