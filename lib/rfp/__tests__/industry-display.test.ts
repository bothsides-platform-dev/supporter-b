import { describe, expect, it } from 'vitest';
import {
  INDUSTRY_CATEGORIES,
  industryDisplay,
  searchIndustries,
} from '../industry-display';
import metadata from '../industry-display.json';
import { MCC_INDUSTRIES } from '../mcc-catalog';

const matches = (group: { name: string; mccCode?: string | null }, query: string) =>
  searchIndustries([group], query).length > 0;

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
      category: '패션과 뷰티',
      displayName: '의류',
      examples: '여성복, 남성복, 아동복',
      synonyms: ['옷', '패션'],
    });
    expect(INDUSTRY_CATEGORIES).toContain('패션과 뷰티');
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
      '패션과 뷰티',
    ]) {
      expect(matches(group, query), query).toBe(true);
    }
    expect(matches(group, '여성복 없는 결과')).toBe(false);
  });

  it('normalizes compatibility forms and case and ignores repeated surrounding whitespace', () => {
    expect(matches({ name: '온라인 소프트웨어', mccCode: '5817' }, '  ＳＡＡＳ   구독  ')).toBe(true);
  });

  it('searches the stored name and MCC code when display metadata is missing', () => {
    const group = { name: '수제 악기 제작', mccCode: '9999' };

    expect(matches(group, '수제 악기')).toBe(true);
    expect(matches(group, '9999')).toBe(true);
    expect(matches(group, '방문 돌봄')).toBe(false);
  });
});

describe('industry search typo tolerance', () => {
  const clothing = { name: '종합 의류 판매', mccCode: '5651' };

  it('finds an industry despite a one-jamo typo or a keyboard left in English mode', () => {
    expect(matches(clothing, '여성뷱')).toBe(true);
    expect(matches(clothing, 'dmlfb')).toBe(true);
    expect(matches(clothing, '항공권')).toBe(false);
  });

  it('does not steer short words or words inside other words to a different industry in the real catalog', () => {
    const catalog = metadata.industries.map(({ code, displayName }) => ({ name: displayName, mccCode: code }));

    for (const query of ['의료', '화원', '의사', '과자', '의루', '케이크', '고양이카페', '게임기', '마이크', 'spa', 'sauna', 'pro', 'its', 'toys', 'garden', 'deal']) {
      expect(searchIndustries(catalog, query).filter(r => r.typo), query).toEqual([]);
    }
  });

  it('keeps Shift when recovering an English-mode query', () => {
    expect(matches({ name: '빵집', mccCode: null }, 'Qkdwlq')).toBe(true);
  });

  it('scores literal matches 0 and typo matches higher', () => {
    expect(searchIndustries([clothing], '여성복')[0].score).toBe(0);
    expect(searchIndustries([clothing], '여성뷱')[0].score).toBeGreaterThan(0);
  });

  it('adds up term scores so more typo terms rank lower', () => {
    const twoTypos = { name: '여성복 판매대행', mccCode: null };
    const oneTypo = { name: '여성뷱 판매대행', mccCode: null };
    const results = searchIndustries([twoTypos, oneTypo], '여성뷱 판매대헹');

    expect(results.map(r => r.group.name)).toEqual(['여성뷱 판매대행', '여성복 판매대행']);
    expect(results.map(r => r.score)).toEqual([3, 6]);
  });

  it('puts an intentional match ahead of a typo match with the same score', () => {
    const typo = { name: '가나 다라 마바사어', mccCode: null };
    const intentional = { name: '가 나 다 라 마 바 사 아', mccCode: null };
    const results = searchIndustries([typo, intentional], '가나 다라 마바사아');

    expect(results.map(r => [r.group.name, r.score, r.typo])).toEqual([
      ['가 나 다 라 마 바 사 아', 3, false],
      ['가나 다라 마바사어', 3, true],
    ]);
  });

  it('keeps choseong queries intact through compatibility normalization', () => {
    expect(matches(clothing, 'ㅇㄹ')).toBe(true);
    expect(matches({ name: '편의점', mccCode: null }, 'ㅍㅇㅈ')).toBe(true);
  });

  it('orders exact matches ahead of typo matches', () => {
    const typoOnly = { name: '여성뷱 수선', mccCode: null };
    const exact = { name: '여성복 판매', mccCode: null };

    expect(searchIndustries([typoOnly, exact], '여성뷱').map(r => r.group.name)).toEqual(['여성뷱 수선', '여성복 판매']);
    expect(searchIndustries([typoOnly, exact], '여성복').map(r => r.group.name)).toEqual(['여성복 판매', '여성뷱 수선']);
  });

  // Value: protects=equal-score results keep the admin-provided order and non-matches are dropped;
  // fails_when=a sort key other than score and typo is added or the null-score filter is removed; why_new=existing
  // ordering cases only compare distinct scores; seam=none
  it('keeps the original order for equally close matches and drops non-matches', () => {
    const groups = [
      { name: '의류 수선', mccCode: null },
      { name: '항공권 예약', mccCode: null },
      { name: '아동 의류', mccCode: null },
    ];

    expect(searchIndustries(groups, '의류').map(r => r.group.name)).toEqual(['의류 수선', '아동 의류']);
    expect(searchIndustries([...groups].reverse(), '의류').map(r => r.group.name)).toEqual(['아동 의류', '의류 수선']);
  });
});
