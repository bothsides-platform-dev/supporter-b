import { describe, it, expect } from 'vitest';
import { getNavConfig, getNavCommands, getChordMap } from '../nav-config';

// 출고 기본값 OPEN_BOARD_ENABLED=false 기준. 오픈게시판 진입점이 전부 사라져야 한다.
describe('nav-config — open board disabled (flag off)', () => {
  it('pg inbox 섹션에서 opportunities 링크가 제거된다', () => {
    const inbox = getNavConfig('pg').sections.find((s) => s.id === 'inbox');
    expect(inbox?.links?.map((l) => l.href) ?? []).not.toContain('/opportunities');
  });

  it('pg getNavCommands 에 /opportunities 가 없다', () => {
    expect(getNavCommands('pg').map((c) => c.href)).not.toContain('/opportunities');
  });

  it("pg getChordMap 에 'o' (g→o) 단축키가 없다", () => {
    expect(getChordMap('pg')).not.toHaveProperty('o');
  });
});
