import { describe, expect, it } from 'vitest';
import {
  INDUSTRY_CATEGORIES,
  industryDisplay,
  matchesIndustry,
} from '../industry-display';
import metadata from '../industry-display.json';
import { MCC_INDUSTRIES } from '../mcc-catalog';

describe('industry display metadata', () => {
  it('covers every MCC code exactly once and assigns each entry a listed category', () => {
    const codes = metadata.industries.map(({ code }) => code);

    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort()).toEqual(MCC_INDUSTRIES.map(({ code }) => code).sort());
    for (const industry of metadata.industries) {
      expect(INDUSTRY_CATEGORIES).toContain(industry.category);
    }
  });

  it('maps a known MCC code to its buyer-facing category, name, and examples', () => {
    expect(industryDisplay({ name: '종합 의류 판매', mccCode: '5651' })).toEqual({
      code: '5651',
      category: '패션·뷰티',
      displayName: '의류',
      examples: '여성복, 남성복, 아동복',
      synonyms: ['옷', '패션'],
    });
    expect(INDUSTRY_CATEGORIES).toContain('패션·뷰티');
  });

  it('falls back to the stored name and 기타 업종 for missing or unknown MCC codes', () => {
    expect(industryDisplay({ name: '수제 악기 제작', mccCode: '9999' })).toEqual({
      category: '기타 업종',
      displayName: '수제 악기 제작',
      examples: '',
      synonyms: [],
    });
    expect(industryDisplay({ name: '직접 등록 업종' })).toEqual({
      category: '기타 업종',
      displayName: '직접 등록 업종',
      examples: '',
      synonyms: [],
    });
  });
});

describe('industry search matching', () => {
  it('searches the stored name, original MCC name, code, display examples, synonyms, and category', () => {
    const group = { name: '우리 쇼핑몰', mccCode: '5651' };

    for (const query of [
      '우리 쇼핑몰',
      '종합 의류 판매',
      '5651',
      '여성복',
      '패션',
      '패션·뷰티',
    ]) {
      expect(matchesIndustry(group, query), query).toBe(true);
    }
    expect(matchesIndustry(group, '여성복 없는 결과')).toBe(false);
  });

  it('normalizes compatibility forms and case and ignores repeated surrounding whitespace', () => {
    expect(matchesIndustry({ name: '온라인 소프트웨어', mccCode: '5817' }, '  ＳＡＡＳ   구독  ')).toBe(true);
  });

  it('searches the stored name and MCC code when display metadata is missing', () => {
    const group = { name: '수제 악기 제작', mccCode: '9999' };

    expect(matchesIndustry(group, '수제 악기')).toBe(true);
    expect(matchesIndustry(group, '9999')).toBe(true);
    expect(matchesIndustry(group, '방문 돌봄')).toBe(false);
  });
});
