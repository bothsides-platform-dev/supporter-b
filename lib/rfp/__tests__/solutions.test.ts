import { describe, it, expect } from 'vitest';

import { SOLUTION_OPTIONS, SOLUTION_VALUES, SOLUTION_LABELS } from '../solutions';

// 통합 전 4곳(RfpStep2Content/RfpStep4Review/RfpCreateWizard/RequestConditionsView)에
// 분산돼 있던 리터럴과의 드리프트를 막는 가드.
describe('SOLUTION 단일 출처', () => {
  it('SOLUTION_LABELS 는 통합 전 리터럴 맵과 동일하다', () => {
    expect(SOLUTION_LABELS).toEqual({
      cafe24: '카페24',
      imweb: '아임웹',
      makeshop: '메이크샵',
      godo: '고도몰',
      self: '자체 개발',
      other: '기타',
    });
  });

  it('SOLUTION_VALUES 는 SOLUTION_OPTIONS 의 value 순서와 일치한다', () => {
    expect([...SOLUTION_VALUES]).toEqual(SOLUTION_OPTIONS.map((o) => o.value));
  });

  it('모든 옵션 value 에 라벨이 존재한다', () => {
    for (const { value, label } of SOLUTION_OPTIONS) {
      expect(SOLUTION_LABELS[value]).toBe(label);
    }
  });
});
