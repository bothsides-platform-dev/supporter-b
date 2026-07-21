import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { vi, describe, it, expect } from 'vitest';
import type { Viewport } from 'next';

vi.mock('next/font/local', () => ({
  default: () => ({ variable: '--font-test', className: '' }),
}));
vi.mock('next-axiom', () => ({ AxiomWebVitals: () => null }));
vi.mock('@/lib/site-config', () => ({
  siteConfig: {
    url: 'https://support-b.com',
    title: '서포트비',
    description: 'Test',
    name: '서포트비',
    locale: 'ko_KR',
    keywords: [],
    ogImageAlt: 'Test',
  },
}));
vi.mock('@/lib/channel-io/server', () => ({ getChannelMember: async () => null }));
vi.mock('@/components/shell/ChannelTalk', () => ({ ChannelTalk: () => null }));
vi.mock('@/components/shell/Analytics', () => ({ Analytics: () => null }));
vi.mock('../globals.css', () => ({}));

const { viewport } = await import('../layout');
const { default: manifest } = await import('../manifest');

// 캔버스 색의 단일 출처는 styles/tokens.css 다. 브라우저 크롬(상태바)·PWA 스플래시가
// 캔버스와 다른 색이면 앱을 열 때 색이 튄다 — 토큰에서 직접 읽어 대조한다.
const TOKENS = readFileSync(resolve(__dirname, '../../styles/tokens.css'), 'utf8');

/** `.dark {` 앞뒤로 갈라 라이트/다크 스코프의 캔버스 색을 뽑는다. */
function canvasToken(scope: 'light' | 'dark'): string {
  const darkAt = TOKENS.indexOf('.dark {');
  expect(darkAt).toBeGreaterThan(-1); // 스코프 구분이 사라지면 파서가 조용히 틀리는 걸 방지
  const chunk = scope === 'light' ? TOKENS.slice(0, darkAt) : TOKENS.slice(darkAt);
  const m = chunk.match(/--md-sys-color-background:\s*(#[0-9A-Fa-f]{6})/);
  if (!m) throw new Error(`${scope} 스코프에서 --md-sys-color-background 를 찾지 못했다`);
  return m[1].toLowerCase();
}

const LIGHT_CANVAS = canvasToken('light');
const DARK_CANVAS = canvasToken('dark');

describe('브라우저/PWA 크롬색 ↔ 캔버스 토큰 드리프트 가드', () => {
  it('viewport.themeColor 는 라이트/다크 캔버스 토큰과 일치한다', () => {
    const themeColor = (viewport as Viewport).themeColor as {
      media: string;
      color: string;
    }[];

    const light = themeColor.find((t) => t.media.includes('light'));
    const dark = themeColor.find((t) => t.media.includes('dark'));

    expect(light?.color.toLowerCase()).toBe(LIGHT_CANVAS);
    expect(dark?.color.toLowerCase()).toBe(DARK_CANVAS);
  });

  it('manifest 의 theme_color·background_color 는 라이트 캔버스 토큰과 일치한다', () => {
    // web app manifest 는 라이트/다크 변형을 못 담으므로 라이트 캔버스로 고정한다.
    const m = manifest();
    expect(m.theme_color?.toLowerCase()).toBe(LIGHT_CANVAS);
    expect(m.background_color?.toLowerCase()).toBe(LIGHT_CANVAS);
  });
});
