import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginSignupCallout } from '../LoginSignupCallout';

describe('LoginSignupCallout', () => {
  it('foregrounds signup for first-time visitors', () => {
    render(<LoginSignupCallout />);
    expect(screen.getByText('처음 오셨나요?')).toBeInTheDocument();
    expect(screen.getByText(/PG 비교 견적을 무료로 시작/)).toBeInTheDocument();
  });

  it('routes the prominent signup CTA to /signup', () => {
    render(<LoginSignupCallout />);
    const cta = screen.getByRole('link', { name: /신규 회원가입/ });
    expect(cta).toHaveAttribute('href', '/signup');
  });

  it('next="/rfp-create" → 가입 링크에 next 인코딩 포함', () => {
    render(<LoginSignupCallout next="/rfp-create" />);
    const link = screen.getByRole('link', { name: /신규 회원가입/ });
    expect(link).toHaveAttribute('href', `/signup?next=${encodeURIComponent('/rfp-create')}`);
  });

  it('next="/rfp-create" → 맥락 안내 문구 노출', () => {
    render(<LoginSignupCallout next="/rfp-create" />);
    expect(screen.getByText(/견적을 시작하려면 가입하거나 로그인해요/)).toBeInTheDocument();
  });

  it('next="//evil.com" (불안전) → 가입 링크 /signup 유지', () => {
    render(<LoginSignupCallout next="//evil.com" />);
    const link = screen.getByRole('link', { name: /신규 회원가입/ });
    expect(link).toHaveAttribute('href', '/signup');
  });

  it('next="/home" → 가입 링크에 next 포함, 기본 문구 유지', () => {
    render(<LoginSignupCallout next="/home" />);
    const link = screen.getByRole('link', { name: /신규 회원가입/ });
    expect(link).toHaveAttribute('href', `/signup?next=${encodeURIComponent('/home')}`);
    expect(screen.getByText(/PG 비교 견적을 무료로 시작/)).toBeInTheDocument();
  });
});
