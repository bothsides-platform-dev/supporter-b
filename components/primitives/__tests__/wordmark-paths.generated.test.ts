import { describe, expect, it } from 'vitest';
import { WORDMARK_PATHS } from '../wordmark-paths.generated';

// 코드젠 산출물(wordmark-paths.generated.ts, `pnpm brand:wordmark`) 드리프트 가드 —
// 재생성 스크립트가 깨지거나 파일이 수동으로 잘못 편집됐을 때 형태를 잡아낸다.
describe('WORDMARK_PATHS (generated)', () => {
  it('has exactly 4 glyphs: 서·포·트·마크(B 자리)', () => {
    expect(WORDMARK_PATHS.glyphs).toHaveLength(4);
  });

  it('every glyph has a non-empty path starting with a moveto command', () => {
    for (const d of WORDMARK_PATHS.glyphs) {
      expect(typeof d).toBe('string');
      expect(d.length).toBeGreaterThan(0);
      expect(d[0]).toBe('M');
    }
  });

  it('has positive font metrics (unitsPerEm, ascent, totalWidth) and negative descent', () => {
    expect(WORDMARK_PATHS.unitsPerEm).toBeGreaterThan(0);
    expect(WORDMARK_PATHS.ascent).toBeGreaterThan(0);
    expect(WORDMARK_PATHS.totalWidth).toBeGreaterThan(0);
    expect(WORDMARK_PATHS.descent).toBeLessThan(0);
  });
});
