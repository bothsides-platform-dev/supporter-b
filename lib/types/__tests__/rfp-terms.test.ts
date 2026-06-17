import { describe, it, expect } from 'vitest';
import {
  CURRENT_TERMS_VERSION,
  migrateCurrentTerms,
  currentTermsFromDiscrete,
  hiddenFromPgFromVisibility,
} from '@/lib/types/rfp-terms';

describe('CURRENT_TERMS_VERSION', () => {
  it('현재 정규 버전은 1', () => {
    expect(CURRENT_TERMS_VERSION).toBe(1);
  });
});

describe('migrateCurrentTerms', () => {
  it('빈/누락 입력이면 현재 버전의 빈 문서를 반환한다', () => {
    expect(migrateCurrentTerms(null)).toEqual({ _v: 1 });
    expect(migrateCurrentTerms(undefined)).toEqual({ _v: 1 });
    expect(migrateCurrentTerms({})).toEqual({ _v: 1 });
  });

  it('알려진 필드를 보존하고 _v를 현재 버전으로 정규화한다', () => {
    const out = migrateCurrentTerms({ feeRate: '2.5%', settlementCycle: 'D+1' });
    expect(out.feeRate).toBe('2.5%');
    expect(out.settlementCycle).toBe('D+1');
    expect(out._v).toBe(1);
  });

  it('_v가 없는 레거시 블롭도 v1로 간주해 정규화한다 (읽기는 관대)', () => {
    // _v 도입 이전 저장된 문서도 깨지지 않고 현재 버전으로 읽혀야 한다.
    const out = migrateCurrentTerms({ feeRate: '1.9%' });
    expect(out._v).toBe(1);
    expect(out.feeRate).toBe('1.9%');
  });

  it('멱등하다 — 한 번 정규화한 문서를 다시 넣어도 동일', () => {
    const once = migrateCurrentTerms({ annualPgVolume: '월 5억' });
    expect(migrateCurrentTerms(once)).toEqual(once);
  });
});

describe('currentTermsFromDiscrete', () => {
  it('개별 current_* 필드를 문서 키로 매핑한다', () => {
    const doc = currentTermsFromDiscrete({
      currentFeeRate: '2.5%',
      currentSettlementLimit: '월 1억',
      currentGuaranteeInsurance: '3000만원',
      currentSettlementCycle: 'D+1',
      deliveryServicePeriod: 'D+3',
      currentSolution: 'self',
      currentSolutionDetail: 'ABC몰',
      annualPgVolume: '10억',
    });
    expect(doc).toEqual({
      _v: 1,
      feeRate: '2.5%',
      settlementLimit: '월 1억',
      guaranteeInsurance: '3000만원',
      settlementCycle: 'D+1',
      deliveryServicePeriod: 'D+3',
      solution: 'self',
      solutionDetail: 'ABC몰',
      annualPgVolume: '10억',
    });
  });

  it('null/undefined 필드는 문서에서 생략한다', () => {
    const doc = currentTermsFromDiscrete({
      currentFeeRate: '2.5%',
      currentSettlementLimit: null,
      annualPgVolume: undefined,
    });
    expect(doc).toEqual({ _v: 1, feeRate: '2.5%' });
  });

  it('빈 입력이면 현재 버전의 빈 문서', () => {
    expect(currentTermsFromDiscrete({})).toEqual({ _v: CURRENT_TERMS_VERSION });
  });
});

describe('hiddenFromPgFromVisibility', () => {
  it('currentFeeVisibleToPg=false 면 feeRate 경로를 숨김 목록에 넣는다', () => {
    expect(hiddenFromPgFromVisibility(false)).toEqual(['currentTerms.feeRate']);
  });
  it('true/undefined 면 빈 목록', () => {
    expect(hiddenFromPgFromVisibility(true)).toEqual([]);
    expect(hiddenFromPgFromVisibility(undefined)).toEqual([]);
  });
});
