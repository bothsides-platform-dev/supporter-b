import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NotSelectedNotice } from '../NotSelectedNotice';

afterEach(cleanup);

describe('NotSelectedNotice', () => {
  it('미선정 안내 문구를 렌더한다', () => {
    render(<NotSelectedNotice />);
    expect(screen.getByText('이번엔 선정되지 않았어요')).toBeInTheDocument();
  });

  it('연락처(이메일/전화 링크)를 노출하지 않는다', () => {
    const { container } = render(<NotSelectedNotice />);
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
  });
});
