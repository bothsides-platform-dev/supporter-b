import { describe, expect, it } from 'vitest';

import {
  beginStroke,
  clearModel,
  emptyModel,
  endStroke,
  extendStroke,
  isEmptyModel,
} from '../signature-pad-model';

describe('signature-pad-model', () => {
  it('emptyModel has no strokes and no active stroke', () => {
    expect(emptyModel.strokes).toEqual([]);
    expect(emptyModel.active).toBeNull();
    expect(isEmptyModel(emptyModel)).toBe(true);
  });

  it('beginStroke opens an active stroke seeded with the first point', () => {
    const m = beginStroke(emptyModel, { x: 1, y: 2 });
    expect(m.active).toEqual([{ x: 1, y: 2 }]);
    expect(m.strokes).toEqual([]);
  });

  it('does not mutate the input model', () => {
    const m0 = emptyModel;
    beginStroke(m0, { x: 1, y: 1 });
    expect(m0.active).toBeNull();
    expect(m0.strokes).toEqual([]);
  });

  it('extendStroke appends points to the active stroke', () => {
    let m = beginStroke(emptyModel, { x: 0, y: 0 });
    m = extendStroke(m, { x: 5, y: 5 });
    m = extendStroke(m, { x: 10, y: 0 });
    expect(m.active).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ]);
  });

  it('extendStroke is a no-op when there is no active stroke', () => {
    const m = extendStroke(emptyModel, { x: 3, y: 3 });
    expect(m).toBe(emptyModel);
    expect(m.active).toBeNull();
  });

  it('endStroke commits the active stroke and clears active', () => {
    let m = beginStroke(emptyModel, { x: 0, y: 0 });
    m = extendStroke(m, { x: 10, y: 10 });
    m = endStroke(m);
    expect(m.active).toBeNull();
    expect(m.strokes).toEqual([
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    ]);
  });

  it('endStroke is a no-op when there is no active stroke', () => {
    const m = endStroke(emptyModel);
    expect(m).toBe(emptyModel);
  });

  it('accumulates multiple committed strokes', () => {
    let m = beginStroke(emptyModel, { x: 0, y: 0 });
    m = extendStroke(m, { x: 1, y: 1 });
    m = endStroke(m);
    m = beginStroke(m, { x: 2, y: 2 });
    m = extendStroke(m, { x: 3, y: 3 });
    m = endStroke(m);
    expect(m.strokes).toHaveLength(2);
    expect(isEmptyModel(m)).toBe(false);
  });

  it('isEmptyModel is false once a 2+ point stroke exists (active or committed)', () => {
    let m = beginStroke(emptyModel, { x: 0, y: 0 });
    m = extendStroke(m, { x: 10, y: 10 });
    expect(isEmptyModel(m)).toBe(false); // active with 2 points
    m = endStroke(m);
    expect(isEmptyModel(m)).toBe(false); // committed
  });

  it('treats a single-point stroke as empty', () => {
    let m = beginStroke(emptyModel, { x: 4, y: 4 });
    expect(isEmptyModel(m)).toBe(true); // active has 1 point only
    m = endStroke(m);
    expect(isEmptyModel(m)).toBe(true); // committed 1-point stroke still counts as empty
  });

  it('clearModel returns a fresh empty model', () => {
    const cleared = clearModel();
    expect(cleared.strokes).toEqual([]);
    expect(cleared.active).toBeNull();
    expect(isEmptyModel(cleared)).toBe(true);
  });
});
