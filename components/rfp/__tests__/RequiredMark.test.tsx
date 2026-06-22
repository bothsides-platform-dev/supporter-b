import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequiredMark } from '@/components/rfp/RequiredMark';

describe('RequiredMark', () => {
  it('empty: "필수" 라벨', () => {
    render(<RequiredMark state="empty" />);
    expect(screen.getByText('필수')).toBeInTheDocument();
  });

  it('filled: "입력 완료" 라벨', () => {
    render(<RequiredMark state="filled" />);
    expect(screen.getByText('입력 완료')).toBeInTheDocument();
  });

  it('error: "필수" 라벨 유지', () => {
    render(<RequiredMark state="error" />);
    expect(screen.getByText('필수')).toBeInTheDocument();
  });
});
