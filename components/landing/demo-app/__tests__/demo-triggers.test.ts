import { describe, it, expect } from 'vitest';
import { demoTriggerSelector } from '../demo-triggers';

describe('demoTriggerSelector', () => {
  it('각 단계 → 다음 단계 전환을 일으키는 트리거 요소의 셀렉터를 돌려준다', () => {
    expect(demoTriggerSelector(1)).toBe('a[href="/rfp"]'); // 사이드바 '견적 요청'
    expect(demoTriggerSelector(2)).toBe('tbody tr'); // 견적 요청 목록 첫 행
    expect(demoTriggerSelector(3)).toBe('a[href="/rfp-create"]'); // 사이드바 '새 견적 요청'
  });

  it('페이지4(작성 위저드)는 위저드 내부 다음/보내기 버튼을 가리킨다', () => {
    expect(demoTriggerSelector(4)).toBe('[data-demo-cursor]');
  });

  it('정의되지 않은 페이지는 트리거가 없다', () => {
    expect(demoTriggerSelector(5)).toBeNull();
  });
});
