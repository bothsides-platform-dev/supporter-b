import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LandingNav } from '../LandingNav';

const ANCHORS: [string, string][] = [
  ['서비스 설명', '#service'],
  ['도입문의', '#contact'],
  ['이용요금', '#pricing'],
  ['비용 절감 계산기', '#calculator'],
  ['자주 묻는 질문', '#faq'],
];

describe('LandingNav', () => {
  it('renders the five section anchor links', () => {
    render(<LandingNav authed={false} />);
    for (const [label, href] of ANCHORS) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('orders the anchor links to match the landing section flow', () => {
    render(<LandingNav authed={false} />);
    const order = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter((h): h is string => !!h && h.startsWith('#'));
    expect(order).toEqual(['#service', '#pricing', '#calculator', '#faq', '#contact']);
  });

  it('shows a Sign in link to /login when unauthenticated', () => {
    render(<LandingNav authed={false} />);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: /앱으로 이동/ })).toBeNull();
  });

  it('shows an app link to /home when authenticated', () => {
    render(<LandingNav authed />);
    expect(screen.getByRole('link', { name: /앱으로 이동/ })).toHaveAttribute('href', '/home');
    expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull();
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
