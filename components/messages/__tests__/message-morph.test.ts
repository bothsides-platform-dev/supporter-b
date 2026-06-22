import { describe, expect, test } from 'vitest';
import { computeMorphTransform, shouldMorph, type Rect } from '../message-morph';

describe('computeMorphTransform', () => {
  test('places the to-anchored clone visually at from (offset left/up, larger)', () => {
    // from = composer text box, to = final bubble slot.
    const from: Rect = { left: 10, top: 200, width: 300, height: 40 };
    const to: Rect = { left: 50, top: 80, width: 200, height: 36 };
    // dx/dy move the to-anchored clone back to from; scale shrinks to→from width.
    expect(computeMorphTransform(from, to)).toEqual({ dx: -40, dy: 120, scale: 1.5 });
  });

  test('identity transform when from equals to', () => {
    const r: Rect = { left: 50, top: 80, width: 200, height: 36 };
    expect(computeMorphTransform(r, r)).toEqual({ dx: 0, dy: 0, scale: 1 });
  });

  test('scale falls back to 1 when to has zero width (avoids divide-by-zero)', () => {
    const from: Rect = { left: 0, top: 0, width: 300, height: 40 };
    const to: Rect = { left: 0, top: 0, width: 0, height: 0 };
    expect(computeMorphTransform(from, to)).toEqual({ dx: 0, dy: 0, scale: 1 });
  });
});

describe('shouldMorph', () => {
  const to: Rect = { left: 50, top: 80, width: 200, height: 36 };

  test('true for a self message with text when motion is allowed and bubble measured', () => {
    expect(shouldMorph({ isSelf: true, hasText: true, reduce: false, to })).toBe(true);
  });

  test('false when prefers-reduced-motion', () => {
    expect(shouldMorph({ isSelf: true, hasText: true, reduce: true, to })).toBe(false);
  });

  test('false for an attachment-only send (no text)', () => {
    expect(shouldMorph({ isSelf: true, hasText: false, reduce: false, to })).toBe(false);
  });

  test('false for an incoming (non-self) message', () => {
    expect(shouldMorph({ isSelf: false, hasText: true, reduce: false, to })).toBe(false);
  });

  test('false when the bubble could not be measured (to is null)', () => {
    expect(shouldMorph({ isSelf: true, hasText: true, reduce: false, to: null })).toBe(false);
  });

  test('false when measured width is zero (jsdom / not laid out)', () => {
    expect(
      shouldMorph({ isSelf: true, hasText: true, reduce: false, to: { left: 0, top: 0, width: 0, height: 0 } }),
    ).toBe(false);
  });
});
