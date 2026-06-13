import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RequoteBanner } from '../RequoteBanner';

afterEach(() => cleanup());

describe('RequoteBanner', () => {
  it('renders buyer message and new deadline', () => {
    render(<RequoteBanner message="카드 수수료를 낮춰주세요" deadline="2026-06-20T23:59:59Z" />);
    expect(screen.getByText('카드 수수료를 낮춰주세요')).toBeInTheDocument();
    expect(screen.getByText(/재요청/)).toBeInTheDocument();
  });
});
