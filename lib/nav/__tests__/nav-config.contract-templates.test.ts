import { describe, it, expect } from 'vitest';
import { getNavConfig, getNavCommands, getChordMap } from '../nav-config';

// 출고 기본값 CONTRACT_TEMPLATES_ENABLED=false 기준 — 플래그를 mock 하지 않는다.
// 플래그를 true 로 re-enable 할 때는 이 파일을 삭제하고,
// nav-config.test.ts 의 vi.mock('.../contract-templates', …) 행도 제거한다.
describe('nav-config — contract templates disabled (flag off)', () => {
  it('pg top 에서 계약서 템플릿 항목이 제거된다', () => {
    const top = getNavConfig('pg').top;
    expect(top.map((i) => i.id)).not.toContain('contract-templates');
    expect(top.map((i) => i.href)).not.toContain('/contract-templates');
  });

  it('pg getNavCommands 에 /contract-templates 가 없다', () => {
    expect(getNavCommands('pg').map((c) => c.href)).not.toContain('/contract-templates');
  });

  it("pg getChordMap 에 'c' (g→c) 단축키가 없다", () => {
    expect(getChordMap('pg')).not.toHaveProperty('c');
  });

  it('buyer 의 g→c(새 견적 요청)는 그대로다', () => {
    expect(getChordMap('buyer').c).toBe('/rfp-create');
  });
});
