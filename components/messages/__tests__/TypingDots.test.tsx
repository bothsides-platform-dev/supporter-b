import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TypingDots } from '../TypingDots';

afterEach(cleanup);

describe('TypingDots', () => {
  it('aria-label "입력 중" 인 status 를 렌더한다', () => {
    render(<TypingDots />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '입력 중');
  });

  it('펄스 점 3개를 렌더한다', () => {
    render(<TypingDots />);
    const dots = screen.getByRole('status').querySelectorAll('span[aria-hidden]');
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveClass('animate-pulse');
  });
});
