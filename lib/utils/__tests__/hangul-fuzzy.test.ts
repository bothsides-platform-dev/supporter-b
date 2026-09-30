import { describe, expect, it } from 'vitest';
import { fuzzyTermScore } from '../hangul-fuzzy';

describe('fuzzyTermScore', () => {
  it('scores an exact substring as 0', () => {
    expect(fuzzyTermScore('편의점과 식품점', '편의점')).toBe(0);
  });

  it('ignores spacing differences between the query and the text', () => {
    expect(fuzzyTermScore('편의점과 식품점', '과식품')).toBe(1);
  });

  it('matches a choseong-only query against the text initials', () => {
    expect(fuzzyTermScore('편의점과 식품점', 'ㅍㅇㅈ')).toBe(1);
  });

  // Value: protects=an all-choseong query that misses the initials returns null instead of reaching typo matching;
  // fails_when=the choseong branch falls through to the jamo edit distance on a miss; why_new=only choseong hits
  // were tested; seam=none
  it('does not fall back to typo matching when a choseong-only query misses', () => {
    expect(fuzzyTermScore('ㄱㄴㄷㄹㅁㅂ', 'ㄱㄴㄷㄹㅁㅅ')).toBeNull();
  });

  it('recovers a query typed with the keyboard left in English mode', () => {
    expect(fuzzyTermScore('의류 여성복', 'dmlfb')).toBe(1);
    expect(fuzzyTermScore('온라인 소프트웨어 saas', 'saas')).toBe(0);
  });

  it('keeps Shift when recovering an English-mode query with double consonants', () => {
    expect(fuzzyTermScore('빵집과 제과점', 'Qkdwlq')).toBe(1);
    expect(fuzzyTermScore('음식점 까페', 'Rkvp')).toBe(1);
  });

  it('treats a syllable still being composed as an exact match', () => {
    for (const composing of ['펴', '편ㅇ', '편으', '편의저']) {
      expect(fuzzyTermScore('편의점과 식품점', composing), composing).toBe(0);
    }
  });

  it('matches Latin letters regardless of case', () => {
    expect(fuzzyTermScore('온라인 소프트웨어 saas', 'SaaS')).toBe(0);
  });

  it('tolerates one jamo typo from 5 jamo', () => {
    expect(fuzzyTermScore('편의점과 식품점', '편의잠')).toBe(3);
    expect(fuzzyTermScore('의류 여성복', '의루')).toBe(3);
  });

  it('does not tolerate typos below 5 jamo', () => {
    expect(fuzzyTermScore('옷 패션', '옺')).toBeNull();
    expect(fuzzyTermScore('음식점 카페', '가페')).toBeNull();
  });

  it('tolerates two jamo typos from exactly 10 jamo', () => {
    expect(fuzzyTermScore('의류 판매', '의루판메')).toBe(4);
  });

  // Value: protects=typo allowance scales with query jamo length (1 below 10 jamo, 2 at 10+);
  // fails_when=the tier thresholds or distance<=allowed guard change; why_new=only the 1-typo tier was
  // exercised; seam=none
  it('allows two jamo typos only in a long query', () => {
    expect(fuzzyTermScore('편의점과 식품점', '펀의잠')).toBeNull();
    expect(fuzzyTermScore('편의점과 식품점', '펀의점과식퓸점')).toBe(4);
  });

  it('returns null for unrelated queries', () => {
    expect(fuzzyTermScore('편의점과 식품점', '항공권')).toBeNull();
    expect(fuzzyTermScore('의류 여성복', 'zzzz')).toBeNull();
  });

  it('ranks exact matches ahead of typo matches', () => {
    const exact = fuzzyTermScore('의류', '의류')!;
    const typo = fuzzyTermScore('의류', '의루')!;
    expect(exact).toBeLessThan(typo);
  });
});
