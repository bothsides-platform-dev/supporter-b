import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PgLandingNav } from '../PgLandingNav';

describe('PgLandingNav — PG 랜딩 헤더 내비게이션', () => {
  it('파트너 상담 신청 CTA 버튼을 렌더한다', () => {
    render(<PgLandingNav authed={false} />);
    expect(screen.getByRole('button', { name: /파트너 상담 신청/ })).toBeInTheDocument();
  });

  it('비로그인 시 로그인 링크를 렌더한다', () => {
    render(<PgLandingNav authed={false} />);
    const login = screen.getByRole('link', { name: /로그인|sign in/i });
    expect(login).toHaveAttribute('href', '/login');
  });

  it('로그인 시 앱으로 이동 링크를 렌더한다', () => {
    render(<PgLandingNav authed />);
    const app = screen.getByRole('link', { name: /앱으로 이동/ });
    expect(app).toHaveAttribute('href', '/home');
  });

  it('섹션 앵커 링크(FAQ)를 렌더한다', () => {
    render(<PgLandingNav authed={false} />);
    const faqLinks = screen.getAllByRole('link', { name: /자주 묻는 질문/ });
    expect(faqLinks.some((a) => a.getAttribute('href') === '#faq')).toBe(true);
  });

  it('햄버거 버튼으로 모바일 메뉴를 토글한다', async () => {
    const user = userEvent.setup();
    render(<PgLandingNav authed={false} />);
    expect(screen.queryByTestId('pg-landing-mobile-menu')).toBeNull();
    await user.click(screen.getByRole('button', { name: /메뉴 열기/ }));
    expect(screen.getByTestId('pg-landing-mobile-menu')).toBeInTheDocument();
  });
});
