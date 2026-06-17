import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useDraggable } from '@dnd-kit/core';
import type { BoardCard } from '@/lib/types/column';

vi.mock('@dnd-kit/core', () => ({ useDraggable: vi.fn() }));

const mockSetNodeRef = vi.fn();
const mockSetActivatorNodeRef = vi.fn();

function makeMock(isDragging = false) {
  vi.mocked(useDraggable).mockReturnValue({
    listeners: {},
    setNodeRef: mockSetNodeRef,
    setActivatorNodeRef: mockSetActivatorNodeRef,
    isDragging,
    attributes: { role: 'button' as const, tabIndex: 0, 'aria-disabled': false, 'aria-pressed': undefined, 'aria-describedby': undefined, 'aria-roledescription': undefined },
    transform: null,
    node: { current: null },
    over: null,
    active: null,
  } as unknown as ReturnType<typeof useDraggable>);
}

const card: BoardCard = { cardType: 'rfp', cardId: 'c1', columnId: 'col1', payload: {} };

afterEach(cleanup);
beforeEach(() => {
  mockSetNodeRef.mockClear();
  mockSetActivatorNodeRef.mockClear();
  makeMock();
});

// Dynamically import AFTER mock hoisting so we get the mocked version.
import { BoardDraggableCard } from '../BoardDraggableCard';

describe('BoardDraggableCard', () => {
  it('드래그 핸들 버튼이 렌더된다', () => {
    render(
      <BoardDraggableCard card={card} renderCard={() => <button type="button">카드 버튼</button>} />,
    );
    expect(screen.getByRole('button', { name: /드래그 핸들/ })).toBeInTheDocument();
  });

  it('setActivatorNodeRef 가 드래그 핸들에 연결된다', () => {
    render(<BoardDraggableCard card={card} renderCard={() => <div>내용</div>} />);
    expect(mockSetActivatorNodeRef).toHaveBeenCalled();
  });

  it('isDragging 시 래퍼에 opacity-30 이 적용된다', () => {
    makeMock(true);
    const { container } = render(
      <BoardDraggableCard card={card} renderCard={() => <div>내용</div>} />,
    );
    expect(container.firstChild).toHaveClass('opacity-30');
  });

  it('renderCard(card) 결과가 래퍼 안에 렌더된다', () => {
    render(
      <BoardDraggableCard card={card} renderCard={() => <span data-testid="child">아이</span>} />,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
