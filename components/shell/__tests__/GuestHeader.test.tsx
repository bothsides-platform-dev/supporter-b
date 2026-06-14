import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuestHeader } from '../GuestHeader';

describe('GuestHeader', () => {
  it('가입하기 CTA는 host가 역할을 정하도록 bare /signup으로 보낸다', () => {
    render(<GuestHeader />);
    const signup = screen.getByRole('link', { name: '가입하기' });
    // /signup/buyer 하드코딩이 아니라 /signup → host 기반 redirect(partner→pg, buyer→buyer)
    expect(signup).toHaveAttribute('href', '/signup');
  });

  it('로그인 링크는 /login으로 보낸다', () => {
    render(<GuestHeader />);
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login');
  });
});
