import { describe, it, expect } from 'vitest';
import {
  isTitleValid,
  isWebsiteValid,
  isPaymentValid,
  isPgValid,
  isDeadlineValid,
  isContractTypeValid,
  isMainProductsValid,
  isAnnualPgVolumeValid,
  isAnnualPgVolumeSatisfied,
  markerState,
} from '@/lib/rfp/required-fields';

describe('required-fields predicates', () => {
  it('isTitleValid: 공백/빈값 false, 내용 true', () => {
    expect(isTitleValid('')).toBe(false);
    expect(isTitleValid('   ')).toBe(false);
    expect(isTitleValid(' 견적 ')).toBe(true);
  });

  it('isWebsiteValid: 빈값 false(이제 필수), 형식오류 false, 유효 도메인 true', () => {
    expect(isWebsiteValid('')).toBe(false);
    expect(isWebsiteValid('   ')).toBe(false);
    expect(isWebsiteValid('not a url')).toBe(false);
    expect(isWebsiteValid('example.com')).toBe(true);
    expect(isWebsiteValid('https://example.com')).toBe(true);
  });

  it('isPaymentValid: 선택+직접입력 합이 1개 이상', () => {
    expect(isPaymentValid([], [])).toBe(false);
    expect(isPaymentValid(['card'], [])).toBe(true);
    expect(isPaymentValid([], [{ label: '기타' }])).toBe(true);
  });

  it('isPgValid: 1개 이상', () => {
    expect(isPgValid([])).toBe(false);
    expect(isPgValid([{ id: 'x' }])).toBe(true);
  });

  it('isDeadlineValid: 빈값/무효 false, 유효 날짜 true', () => {
    expect(isDeadlineValid('')).toBe(false);
    expect(isDeadlineValid('nope')).toBe(false);
    expect(isDeadlineValid('2099-01-01T23:59:59+09:00')).toBe(true);
  });

  it('isContractTypeValid: null/undefined false, new·renewal true', () => {
    expect(isContractTypeValid(null)).toBe(false);
    expect(isContractTypeValid(undefined)).toBe(false);
    expect(isContractTypeValid('new')).toBe(true);
    expect(isContractTypeValid('renewal')).toBe(true);
  });

  it('isMainProductsValid: 공백/빈값 false, 내용 true', () => {
    expect(isMainProductsValid('')).toBe(false);
    expect(isMainProductsValid('   ')).toBe(false);
    expect(isMainProductsValid('의류')).toBe(true);
  });

  it('isAnnualPgVolumeValid: 공백/빈값/0 false, 양의 정수면 true', () => {
    expect(isAnnualPgVolumeValid('')).toBe(false);
    expect(isAnnualPgVolumeValid('   ')).toBe(false);
    expect(isAnnualPgVolumeValid('0')).toBe(false);
    expect(isAnnualPgVolumeValid('1000000000')).toBe(true);
  });

  it('isAnnualPgVolumeValid: 숫자 외 형태(Infinity·지수·16진수·소수)는 false — CurrencyInput 은 정수 자릿수만 방출', () => {
    expect(isAnnualPgVolumeValid('Infinity')).toBe(false);
    expect(isAnnualPgVolumeValid('1e3')).toBe(false);
    expect(isAnnualPgVolumeValid('0x10')).toBe(false);
    expect(isAnnualPgVolumeValid('1.5')).toBe(false);
    expect(isAnnualPgVolumeValid('  500  ')).toBe(true);
  });
});

describe('isAnnualPgVolumeSatisfied: 신규 계약은 전년도 PG 거래액이 존재할 수 없어 필수 제외', () => {
  it("contractType='new' 이면 빈값이어도 충족(true)", () => {
    expect(isAnnualPgVolumeSatisfied('', 'new')).toBe(true);
    expect(isAnnualPgVolumeSatisfied('   ', 'new')).toBe(true);
  });

  it("contractType='new' 이면 값이 있어도 충족(true)", () => {
    expect(isAnnualPgVolumeSatisfied('1000000000', 'new')).toBe(true);
  });

  it("contractType='renewal' 이면 기존대로 양의 정수 문자열을 요구", () => {
    expect(isAnnualPgVolumeSatisfied('', 'renewal')).toBe(false);
    expect(isAnnualPgVolumeSatisfied('0', 'renewal')).toBe(false);
    expect(isAnnualPgVolumeSatisfied('1000000000', 'renewal')).toBe(true);
  });

  it('contractType 미선택(null/undefined)은 여전히 필수', () => {
    expect(isAnnualPgVolumeSatisfied('', null)).toBe(false);
    expect(isAnnualPgVolumeSatisfied('', undefined)).toBe(false);
    expect(isAnnualPgVolumeSatisfied('1000000000', null)).toBe(true);
  });
});

describe('markerState', () => {
  it('valid → filled', () => {
    expect(markerState({ valid: true, attempted: false })).toBe('filled');
    expect(markerState({ valid: true, attempted: true })).toBe('filled');
  });
  it('invalid + attempted → error', () => {
    expect(markerState({ valid: false, attempted: true })).toBe('error');
  });
  it('invalid + not attempted → empty', () => {
    expect(markerState({ valid: false, attempted: false })).toBe('empty');
  });
});
