import { describe, it, expect } from 'vitest';

import { SOLUTION_VALUES as TERMS_SOLUTION_VALUES } from '@/lib/types/rfp-terms';
import { SOLUTION_OPTIONS, SOLUTION_VALUES, SOLUTION_LABELS, solutionLabel } from '../solutions';

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

  // 재복제 가드 — solutions.ts 는 현재 rfp-terms 의 SOLUTION_VALUES 를 그대로 재export
  // 하므로 이 단언은 같은 바인딩끼리 비교하는 항등식이고, 값 드리프트를 "탐지"하지는
  // 못한다(구조적으로 불가능하다). 잡는 건 하나뿐이지만 그게 핵심이다 — 누군가
  // solutions.ts 에 리터럴 배열을 다시 선언해 두 출처로 갈라놓는 회귀.
  it('SOLUTION_VALUES 를 재선언하지 않고 rfp-terms 를 그대로 쓴다', () => {
    expect([...SOLUTION_VALUES]).toEqual([...TERMS_SOLUTION_VALUES]);
  });

  // 이쪽은 진짜 드리프트 가드다 — SOLUTION_LABELS 는 이 파일이 손으로 유지하는
  // 유일한 부분이라 어휘가 늘면 실제로 어긋날 수 있다.
  it('SOLUTION_LABELS 는 캐논니컬 어휘를 정확히 덮는다', () => {
    expect(Object.keys(SOLUTION_LABELS).sort()).toEqual([...TERMS_SOLUTION_VALUES].sort());
    for (const v of TERMS_SOLUTION_VALUES) {
      expect(SOLUTION_LABELS[v]).toBeTruthy();
    }
  });
});

// 저장된 solution 은 free-form text 컬럼에서 오므로(구 데이터·수기 입력) 어휘 밖 값이
// 들어올 수 있다. 화면은 라벨을 못 찾아도 빈칸이 아니라 원문을 보여줘야 한다(fail-open).
describe('solutionLabel', () => {
  it('알려진 값은 한국어 라벨로 바꾼다', () => {
    expect(solutionLabel('cafe24')).toBe('카페24');
    expect(solutionLabel('self')).toBe('자체 개발');
  });

  it('어휘 밖 값은 원문을 그대로 돌려준다', () => {
    expect(solutionLabel('shopify')).toBe('shopify');
  });

  it('빈 값은 undefined 를 돌려준다', () => {
    expect(solutionLabel(null)).toBeUndefined();
    expect(solutionLabel(undefined)).toBeUndefined();
    expect(solutionLabel('')).toBeUndefined();
  });
});
