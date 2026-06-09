import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// LandingHeaderNav 는 `@/auth`(next-auth) 를 임포트하는 async 서버 컴포넌트라
// jsdom 렌더 트리에 그대로 끌어오면 next-auth 의 `next/server` 임포트가
// 수집 단계에서 깨진다. nav 자체는 LandingHeaderNav.test 에서 커버하므로
// 여기서는 스텁으로 대체한다.
vi.mock('../LandingHeaderNav', () => ({
  LandingHeaderNav: () => <a href="/login">Sign in →</a>,
}));

import { PgLanding } from '../PgLanding';

describe('PgLanding — PG 전용 랜딩', () => {
  it('PG 랜딩화면 텍스트를 렌더한다', () => {
    render(<PgLanding />);
    expect(screen.getByText('PG 랜딩화면')).toBeInTheDocument();
  });

  it('헤더에 로그인 진입 내비게이션을 렌더한다', () => {
    render(<PgLanding />);
    const signIn = screen.getByRole('link', { name: /sign in/i });
    expect(signIn).toHaveAttribute('href', '/login');
  });
});
