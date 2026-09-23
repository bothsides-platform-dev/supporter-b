// Regression: ISSUE-005 — 사업자번호가 화면마다 하이픈 없이(1248100998) 표시됐다
// Found by /qa on 2026-09-23
// Report: .gstack/qa-reports/qa-report-lvh-me-2026-09-23.md
import { describe, expect, it } from 'vitest';
import { formatBizNoDisplay } from '../format';

describe('formatBizNoDisplay', () => {
  it('숫자 10자리를 3-2-5 로 끊는다', () => {
    expect(formatBizNoDisplay('1248100998')).toBe('124-81-00998');
  });

  it('이미 하이픈이 있으면 같은 모양으로 둔다', () => {
    expect(formatBizNoDisplay('124-81-00998')).toBe('124-81-00998');
  });

  it('10자리가 아닌 값은 손대지 않는다', () => {
    expect(formatBizNoDisplay('12345')).toBe('12345');
    expect(formatBizNoDisplay('')).toBe('');
  });
});
