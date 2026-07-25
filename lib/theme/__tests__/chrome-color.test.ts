import { describe, it, expect, beforeEach } from 'vitest';

import { syncChromeColor, CHROME_COLOR_META_ATTR } from '../chrome-color';
import { CANVAS_COLOR } from '../canvas-colors';

/** app/layout.tsx 의 viewport.themeColor 가 내보내는 media 스코프 두 태그를 재현한다. */
function seedNextMetas() {
  for (const media of ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)']) {
    const m = document.createElement('meta');
    m.setAttribute('name', 'theme-color');
    m.setAttribute('media', media);
    m.setAttribute('content', media.includes('dark') ? CANVAS_COLOR.dark : CANVAS_COLOR.light);
    document.head.appendChild(m);
  }
}

function allMetas(): HTMLMetaElement[] {
  return [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
}

/**
 * 브라우저가 실제로 고르는 값 — "tree order 상 media 가 매치되는 첫 태그".
 * jsdom 은 media 를 평가하지 않으므로 OS 선호를 인자로 받아 직접 판정한다.
 */
function effectiveColor(prefersDark: boolean): string | null {
  for (const m of allMetas()) {
    const media = m.getAttribute('media');
    if (media) {
      const wantsDark = media.includes('dark');
      if (wantsDark !== prefersDark) continue;
    }
    return m.getAttribute('content');
  }
  return null;
}

describe('syncChromeColor', () => {
  beforeEach(() => {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  });

  it('media 없는 태그를 head 맨 앞에 만들어 소유한다', () => {
    seedNextMetas();
    syncChromeColor('dark');

    const owned = allMetas()[0];
    expect(owned.hasAttribute(CHROME_COLOR_META_ATTR)).toBe(true);
    expect(owned.hasAttribute('media')).toBe(false);
    expect(owned.getAttribute('content')).toBe(CANVAS_COLOR.dark);
    expect(document.head.firstChild).toBe(owned);
  });

  // 핵심 계약: OS 가 라이트여도 인앱 다크가 이긴다.
  it('OS 선호와 무관하게 실효 테마가 선택된다', () => {
    seedNextMetas();
    syncChromeColor('dark');
    expect(effectiveColor(/* prefersDark */ false)).toBe(CANVAS_COLOR.dark);
    expect(effectiveColor(/* prefersDark */ true)).toBe(CANVAS_COLOR.dark);

    syncChromeColor('light');
    expect(effectiveColor(false)).toBe(CANVAS_COLOR.light);
    expect(effectiveColor(true)).toBe(CANVAS_COLOR.light);
  });

  // React 가 소유한 노드를 건드리면 하이드레이션에서 잉여 태그가 되살아난다(실측).
  it('Next 가 내보낸 media 스코프 태그는 건드리지 않는다', () => {
    seedNextMetas();
    syncChromeColor('dark');

    const nextOwned = allMetas().filter((m) => m.hasAttribute('media'));
    expect(nextOwned.map((m) => m.getAttribute('content'))).toEqual([
      CANVAS_COLOR.light,
      CANVAS_COLOR.dark,
    ]);
  });

  it('반복 호출해도 태그를 하나만 유지한다', () => {
    seedNextMetas();
    syncChromeColor('dark');
    syncChromeColor('light');
    syncChromeColor('dark');

    expect(allMetas().filter((m) => m.hasAttribute(CHROME_COLOR_META_ATTR))).toHaveLength(1);
    expect(allMetas()).toHaveLength(3); // 소유 1 + Next 2
  });

  it('Next 태그가 아직 없어도(메타 이전 시점) 동작한다', () => {
    expect(() => syncChromeColor('dark')).not.toThrow();
    expect(allMetas()).toHaveLength(1);
    expect(effectiveColor(false)).toBe(CANVAS_COLOR.dark);
  });
});
