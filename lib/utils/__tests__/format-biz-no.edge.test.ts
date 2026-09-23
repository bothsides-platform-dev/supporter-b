// Coverage: ISSUE-005 — formatBizNoDisplay 경계값
import { describe, expect, it } from 'vitest';
import { formatBizNoDisplay } from '../format';

describe('formatBizNoDisplay — 경계값', () => {
  it('하이픈 위치가 어긋난 값은 정상 번호처럼 보이게 고치지 않고 그대로 둔다', () => {
    expect(formatBizNoDisplay('124-8100-998')).toBe('124-8100-998');
    expect(formatBizNoDisplay('1-2-4-8-1-0-0-9-9-8')).toBe('1-2-4-8-1-0-0-9-9-8');
    expect(formatBizNoDisplay('124--81-00998')).toBe('124--81-00998');
    expect(formatBizNoDisplay('124-8100998')).toBe('124-8100998');
  });

  it('하이픈이 아닌 구분자(공백·점)는 제거하지 않고 원본을 그대로 둔다', () => {
    expect(formatBizNoDisplay('124 81 00998')).toBe('124 81 00998');
    expect(formatBizNoDisplay('124.81.00998')).toBe('124.81.00998');
  });

  it('9·11자리, 숫자 아닌 문자가 섞인 값은 손대지 않는다', () => {
    expect(formatBizNoDisplay('124810099')).toBe('124810099');
    expect(formatBizNoDisplay('12481009981')).toBe('12481009981');
    expect(formatBizNoDisplay('12481009a8')).toBe('12481009a8');
  });
});
