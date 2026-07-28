import { describe, expect, test } from 'vitest';
import { clipInset, computeMorphTransform, shouldMorph, type Rect } from '../message-morph';

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

// 클론은 viewport 를 덮는 fixed 레이어에 그려지므로, 채팅 패널 밖(딜룸 모달 헤더 등)을
// 침범하지 않으려면 패널 경계로 잘라내야 한다. inset() 은 그 fixed 레이어(=viewport)
// 각 변에서 안쪽으로 들어가는 거리다.
describe('clipInset', () => {
  const viewport = { width: 1000, height: 800 };

  test('undefined when there is no bounds element (no clipping — legacy behavior)', () => {
    expect(clipInset(null, viewport)).toBeUndefined();
  });

  test('insets each viewport edge to the bounds rect', () => {
    const clip: Rect = { left: 200, top: 100, width: 600, height: 500 };
    // right = 1000 - (200 + 600) = 200, bottom = 800 - (100 + 500) = 200
    expect(clipInset(clip, viewport)).toBe('inset(100px 200px 200px 200px)');
  });

  test('no inset when the bounds fill the viewport', () => {
    expect(clipInset({ left: 0, top: 0, width: 1000, height: 800 }, viewport)).toBe(
      'inset(0px 0px 0px 0px)',
    );
  });

  // 패널이 일부 화면 밖으로 나간 순간(전환 애니메이션 중) 음수 inset 은 클립 박스를
  // *넓히므로* 0 으로 조인다 — 잘라내기만 하고 넓히지는 않는다.
  test('clamps negative insets to 0 (bounds partially offscreen)', () => {
    const clip: Rect = { left: -50, top: -20, width: 1200, height: 900 };
    expect(clipInset(clip, viewport)).toBe('inset(0px 0px 0px 0px)');
  });
});
