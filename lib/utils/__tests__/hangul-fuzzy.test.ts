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

  it('recovers a query typed with the keyboard left in English mode', () => {
    expect(fuzzyTermScore('의류 여성복', 'dmlfb')).toBe(1);
    expect(fuzzyTermScore('온라인 소프트웨어 saas', 'saas')).toBe(0);
  });

  it('tolerates a one-jamo typo in a multi-syllable query', () => {
    expect(fuzzyTermScore('편의점과 식품점', '편의잠')).toBe(3);
    expect(fuzzyTermScore('의류 여성복', '의루')).toBe(3);
  });

  it('does not tolerate typos in a single-syllable query', () => {
    expect(fuzzyTermScore('옷 패션', '옺')).toBeNull();
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
