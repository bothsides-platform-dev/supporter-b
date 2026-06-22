import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DateDivider } from '../DateDivider';

afterEach(cleanup);

describe('DateDivider', () => {
  it('role="separator" 와 날짜 라벨 칩을 렌더한다', () => {
    render(<DateDivider label="6월 22일 월요일" />);
    const sep = screen.getByRole('separator');
    expect(sep).toHaveTextContent('6월 22일 월요일');
  });
});
