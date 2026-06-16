import { describe, it, expect } from 'vitest';
import type { Active, Over } from '@dnd-kit/core';
import { buildBoardAnnouncements, boardScreenReaderInstructions } from '../boardAnnouncements';

// dnd-kit only reads .id off active/over inside our pure announcers; the rest of
// the store shape is irrelevant, so a minimal cast keeps the test honest.
function active(id: string): Active {
  return { id } as unknown as Active;
}
function over(id: string): Over {
  return { id } as unknown as Over;
}

describe('boardAnnouncements', () => {
  const announcements = buildBoardAnnouncements();

  it('exposes a draggable instruction so SR users know the affordance', () => {
    expect(boardScreenReaderInstructions.draggable).toMatch(/카드/);
  });

  it('onDragStart announces that a card was grabbed', () => {
    const msg = announcements.onDragStart({ active: active('card:r1') });
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/카드/);
  });

  it('onDragOver announces the column under the card (by title)', () => {
    const msg = announcements.onDragOver({
      active: active('card:r1'),
      over: over('column:c-active'),
    });
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/이동/);
  });

  it('onDragOver with no target says it is off the board', () => {
    const msg = announcements.onDragOver({ active: active('card:r1'), over: null });
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/밖/);
  });

  it('onDragEnd over a column announces a drop', () => {
    const msg = announcements.onDragEnd({
      active: active('card:r1'),
      over: over('column:c-active'),
    });
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/놓았|이동/);
  });

  it('onDragEnd with no target announces the drop was abandoned', () => {
    const msg = announcements.onDragEnd({ active: active('card:r1'), over: null });
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/취소|되돌/);
  });

  it('onDragCancel announces the move was cancelled', () => {
    const msg = announcements.onDragCancel({ active: active('card:r1'), over: null });
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/취소/);
  });

  it('resolves the column title from a provided lookup', () => {
    const withTitles = buildBoardAnnouncements({
      columnTitle: (id) => (id === 'c-active' ? '진행중' : null),
    });
    const msg = withTitles.onDragOver({
      active: active('card:r1'),
      over: over('column:c-active'),
    });
    expect(msg).toMatch(/진행중/);
  });
});
