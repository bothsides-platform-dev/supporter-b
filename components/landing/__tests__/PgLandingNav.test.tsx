import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PgLandingNav } from '../PgLandingNav';
import { DOCS_URL } from '@/lib/site-config';

describe('PgLandingNav — PG 랜딩 헤더 내비게이션', () => {
  it('파트너 시작하기 CTA 를 내부 가입 링크(/signup/pg)로 렌더한다', () => {
    render(<PgLandingNav authed={false} />);
    const cta = screen.getByRole('link', { name: /파트너 시작하기/ });
    expect(cta).toHaveAttribute('href', '/signup/pg');
  });

  it('비로그인 시 로그인 링크를 렌더한다', () => {
    render(<PgLandingNav authed={false} />);
    const login = screen.getByRole('link', { name: /로그인|sign in/i });
    expect(login).toHaveAttribute('href', '/login');
  });

  it('로그인 시 서포트비로 이동해요 링크를 렌더한다', () => {
    render(<PgLandingNav authed />);
    const app = screen.getByRole('link', { name: "서포트비로 이동해요 →" });
    expect(app).toHaveAttribute('href', '/home');
  });

  it('서비스 설명 앵커 링크를 렌더한다', () => {
    render(<PgLandingNav authed={false} />);
    const links = screen.getAllByRole('link', { name: /서비스 설명/ });
    expect(links.some((a) => a.getAttribute('href') === '#inbound')).toBe(true);
  });

  it('고객사 사례 앵커 링크를 렌더한다', () => {
    render(<PgLandingNav authed={false} />);
    const links = screen.getAllByRole('link', { name: /고객사 사례/ });
    expect(links.some((a) => a.getAttribute('href') === '#cases')).toBe(true);
  });

  it.each([false, true])('고객사 사례 다음에 같은 탭 인사이트 링크를 표시한다 (authed=%s)', (authed) => {
    render(<PgLandingNav authed={authed} />);
    const insight = screen.getByRole('link', { name: '인사이트' });
    expect(insight).toHaveAttribute('href', DOCS_URL);
    expect(insight).not.toHaveAttribute('target');
    expect(insight).not.toHaveAttribute('aria-current');
    expect(within(insight.parentElement!).getAllByRole('link').map((link) => link.textContent?.trim()))
      .toEqual(['서비스 설명', '핵심 이점', '고객사 사례', '인사이트']);
  });

  it.each([false, true])('모바일 인사이트 클릭 시 메뉴를 닫는다 (authed=%s)', async (authed) => {
    const user = userEvent.setup();
    render(<PgLandingNav authed={authed} />);
    await user.click(screen.getByRole('button', { name: /메뉴 열기/ }));
    const menu = screen.getByTestId('pg-landing-mobile-menu');
    expect(within(menu).getAllByRole('link').map((link) => link.textContent?.trim()))
      .toEqual(['서비스 설명', '핵심 이점', '고객사 사례', '인사이트']);
    const insight = within(menu).getByRole('link', { name: '인사이트' });
    expect(insight).toHaveAttribute('href', DOCS_URL);
    expect(insight).not.toHaveAttribute('target');
    expect(insight).not.toHaveAttribute('aria-current');
    insight.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await user.click(insight);
    expect(screen.queryByTestId('pg-landing-mobile-menu')).toBeNull();
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('햄버거 버튼으로 모바일 메뉴를 토글한다', async () => {
    const user = userEvent.setup();
    render(<PgLandingNav authed={false} />);
    expect(screen.queryByTestId('pg-landing-mobile-menu')).toBeNull();
    await user.click(screen.getByRole('button', { name: /메뉴 열기/ }));
    expect(screen.getByTestId('pg-landing-mobile-menu')).toBeInTheDocument();
  });
});
