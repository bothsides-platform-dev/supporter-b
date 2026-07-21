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

  // 드리프트 가드 — solution 어휘의 캐논니컬 출처는 lib/types/rfp-terms.ts 다(zod
  // current-terms 가 여기서 파생). UI 측 solutions.ts 가 별도 리터럴을 들고 있으면
  // 한쪽에만 값을 추가했을 때 위저드에선 고를 수 있는데 서버가 거부하는(또는 그 반대)
  // 어긋남이 조용히 생긴다. 두 선언이 항상 동일 어휘·동일 순서임을 못박는다.
  it('SOLUTION_VALUES 는 rfp-terms 의 캐논니컬 어휘와 동일하다', () => {
    expect([...SOLUTION_VALUES]).toEqual([...TERMS_SOLUTION_VALUES]);
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
