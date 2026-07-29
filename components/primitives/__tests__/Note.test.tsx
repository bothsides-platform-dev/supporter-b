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

  // 같은 문법(간격·크기·정렬)을 유지한 채 아이콘만 바꿔 끼울 수 있어야 한다 —
  // 안 그러면 호출부가 Note 를 손으로 다시 만든다.
  it('accepts a custom icon and keeps it decorative', () => {
    const { container } = render(
      <Note icon={<svg data-testid="lock-icon" />}>다른 PG는 볼 수 없어요.</Note>,
    );
    expect(screen.getByTestId('lock-icon')).toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(screen.getByTestId('note-icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('appends a caller className', () => {
    render(<Note className="mt-3">안내</Note>);
    expect(screen.getByTestId('note')).toHaveClass('mt-3');
  });
});
