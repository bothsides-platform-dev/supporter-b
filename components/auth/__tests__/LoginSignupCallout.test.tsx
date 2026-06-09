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
});
