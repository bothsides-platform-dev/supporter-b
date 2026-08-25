// 기본 조항 세트 — 새 조항형 서식을 만들 때 시드되는 초안.
//
// 이 테스트는 문안의 **법적 타당성을 검증하지 않는다**(그건 법무 검토의 몫이다).
// 자동 번호·토큰 치환 같은 **기계적 계약**이 문안 편집으로 조용히 깨지는 것을 막는다.

import { describe, it, expect } from 'vitest';
import { buildDefaultContractDoc } from '../default-clauses';
import { loadGlyphCoverage, missingGlyphs } from '../pdf-font';
import { collectUnknownTokens } from '../variables';

describe('기본 조항 세트', () => {
  const doc = buildDefaultContractDoc();

  it('제목·전문·조항·말미문언을 갖춘 문서를 만든다', () => {
    expect(doc.title.length).toBeGreaterThan(0);
    expect(doc.preamble.length).toBeGreaterThan(0);
    expect(doc.closing.length).toBeGreaterThan(0);
    expect(doc.clauses.length).toBeGreaterThanOrEqual(10);
  });

  it('조항 id 가 서로 겹치지 않는다 — 재정렬·삭제의 키다', () => {
    const ids = doc.clauses.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 조항에 제목이 있다', () => {
    for (const clause of doc.clauses) {
      expect(clause.heading.trim().length).toBeGreaterThan(0);
    }
  });

  // 드리프트 가드 — 문안을 고치다 토큰을 오타 내면 저장이 막히거나(운이 좋으면)
  // 계약서에 `{{...}}` 가 인쇄된다. 기본 세트만큼은 여기서 먼저 걸린다.
  it('미등록 토큰을 쓰지 않는다', () => {
    expect(collectUnknownTokens(doc)).toEqual([]);
  });

  // 두 번째 작성 규칙 — 폰트가 그릴 수 있는 문자만 쓴다. 커버리지는 **하드 저장
  // 게이트**라(`COMPOSE_UNSUPPORTED_CHARACTER`), 기본 문안에 甲/乙 한 글자만 섞여도
  // 새 서식은 **처음 열자마자 저장 불가**가 되고 사용자에게는 원인이 안 보인다.
  it('폰트 커버리지 안의 문자만 쓴다', async () => {
    const text = [
      doc.title,
      doc.preamble,
      doc.closing,
      ...doc.clauses.flatMap((c) =>
        c.kind === 'text' ? [c.heading, c.body] : [c.heading, c.intro, c.outro],
      ),
    ].join('\n');
    expect(missingGlyphs(text, await loadGlyphCoverage())).toEqual([]);
  });

  it('수수료 표 조항이 정확히 하나 있다', () => {
    const feeTables = doc.clauses.filter((c) => c.kind === 'feeTable');
    expect(feeTables).toHaveLength(1);
  });

  /**
   * 조 번호는 배열 순서에서 파생하므로, 본문이 "제5조에 따라" 라고 쓰면 조항을
   * 하나만 끼워 넣어도 그 참조가 **조용히 엉뚱한 조를 가리킨다** — 계약서에서.
   * v1 규칙은 "숫자 상호참조를 쓰지 않는다"이고, 이 테스트가 그 규칙을 지킨다.
   * (참조 토큰은 후속 과제 — 그때 이 테스트를 그 방식으로 바꾼다.)
   */
  it('본문에 숫자 조 상호참조를 쓰지 않는다', () => {
    const offenders: string[] = [];
    for (const clause of doc.clauses) {
      const bodies = clause.kind === 'text' ? [clause.body] : [clause.intro, clause.outro];
      for (const body of bodies) {
        if (/제\s*\d+\s*조/.test(body)) offenders.push(clause.heading);
      }
    }
    expect(offenders).toEqual([]);
  });

  // 개인정보보호법 제26조는 처리위탁 계약에 안전성 확보조치·재위탁 제한·관리감독·
  // 손해배상을 명시하도록 요구한다. 기본 세트에서 이 조항이 통째로 빠지면
  // 사용자가 없는 줄도 모른다.
  it('개인정보 처리위탁 조항을 포함한다', () => {
    const headings = doc.clauses.map((c) => c.heading);
    expect(headings.some((h) => h.includes('개인정보'))).toBe(true);
  });

  it('호출할 때마다 새 객체를 준다 — 편집이 다음 서식에 새지 않는다', () => {
    const a = buildDefaultContractDoc();
    const b = buildDefaultContractDoc();
    expect(a).not.toBe(b);
    expect(a.clauses).not.toBe(b.clauses);
    a.clauses[0].heading = '바뀐 제목';
    expect(b.clauses[0].heading).not.toBe('바뀐 제목');
  });
});
