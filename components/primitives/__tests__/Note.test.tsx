import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Note } from '../Note';

describe('Note', () => {
  it('renders the note text', () => {
    render(<Note>다른 PG의 템플릿은 보이지 않아요.</Note>);
    expect(screen.getByText('다른 PG의 템플릿은 보이지 않아요.')).toBeInTheDocument();
  });

  // 아이콘은 순수 장식 — 의미는 문구가 전부 지고 있으므로 AT 에서 배제한다.
  it('hides the leading icon from assistive tech', () => {
    const { container } = render(<Note>안내</Note>);
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('appends a caller className', () => {
    render(<Note className="mt-3">안내</Note>);
    expect(screen.getByTestId('note')).toHaveClass('mt-3');
  });
});
