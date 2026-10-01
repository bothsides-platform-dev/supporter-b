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

  it('keeps English-mode input steady while a syllable is still being typed', () => {
    expect(fuzzyTermScore('의류 여성복', 'dmlf')).toBe(1);
    expect(fuzzyTermScore('편의점과 식품점', 'vusd')).toBe(1);
  });

  it('tolerates a jamo typo in English-mode input', () => {
    expect(fuzzyTermScore('편의점과 식품점', 'vusdmlwka')).toBe(3);
  });

  it('does not match everything from a single English-mode consonant', () => {
    expect(fuzzyTermScore('가방 판매', 'r')).toBeNull();
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

  it('tolerates one jamo typo from 3 characters', () => {
    expect(fuzzyTermScore('편의점과 식품점', '편의잠')).toBe(3);
    expect(fuzzyTermScore('의류 여성복', '여성뷱')).toBe(3);
  });

  // 2글자는 자모 하나만 달라도 다른 낱말이라(의료/의류, 화원/회원) 다른 업종 정책으로 이어진다.
  it('does not tolerate typos below 3 characters even when compound vowels add jamo', () => {
    expect(fuzzyTermScore('옷 패션', '옺')).toBeNull();
    expect(fuzzyTermScore('음식점 카페', '가페')).toBeNull();
    expect(fuzzyTermScore('의류 여성복', '의루')).toBeNull();
    expect(fuzzyTermScore('의류 여성복', '의료')).toBeNull();
    expect(fuzzyTermScore('회원제 스포츠', '화원')).toBeNull();
    // Value: protects=an English-mode query's allowance counts the Hangul it converts to, so 의료 typed as dmlfy never
    // matches 의류; fails_when=the allowance counts Latin keys (5) instead of converted syllables (2); why_new=the
    // vusdmlwka row scores the same either way; seam=none
    expect(fuzzyTermScore('의류 여성복', 'dmlfy')).toBeNull();
  });

  it('tolerates two jamo typos from exactly 5 characters', () => {
    expect(fuzzyTermScore('의류 판매', '의루판메')).toBeNull();
    expect(fuzzyTermScore('소프트웨어 개발', '서프트웨워')).toBe(4);
  });

  // 오타는 한 단어 안에서 처음부터, 첫 자음이 같을 때만 본다 — 단어 중간·단어 사이에 맞물리면 다른 업종이 된다.
  it('matches typos only from the start of one word with the same first consonant', () => {
    expect(fuzzyTermScore('화장품과 미용용품 메이크업', '케이크')).toBeNull();
    expect(fuzzyTermScore('반려동물 용품 고양이 펫', '고양이카페')).toBeNull();
    expect(fuzzyTermScore('디지털 게임 게임', '게임기')).toBeNull();
    expect(fuzzyTermScore('편의점과 식품점', '벤의점')).toBeNull();
    expect(fuzzyTermScore('편의점과 식품점', '식퓸점')).toBe(3);
    // Value: protects=MCC names joined by · or () stay typo-searchable per word; fails_when=the word split drops
    // punctuation and keeps only whitespace; why_new=other typo rows use space-separated text; seam=none
    expect(fuzzyTermScore('완구점(게임용품)', '게임욤품')).toBe(3);
    expect(fuzzyTermScore('스포츠·기타용품', '기타욤품')).toBe(3);
  });

  // 영문 낱말 오타를 받으면 spa·sauna 가 saas(소프트웨어)로 안내된다 — 영문은 정확히 맞을 때만 찾는다.
  it('matches Latin words only exactly', () => {
    for (const query of ['sass', 'spa', 'sauna']) {
      expect(fuzzyTermScore('온라인 소프트웨어 saas', query), query).toBeNull();
    }
  });

  it('does not throw on English words that do not convert to Hangul', () => {
    for (const query of ['hot', 'hotel', 'photo', 'hospital']) {
      expect(() => fuzzyTermScore('숙박 호텔 모텔', query), query).not.toThrow();
    }
  });

  it('keeps code searches exact', () => {
    expect(fuzzyTermScore('음식점 5812', '5812')).toBe(0);
    expect(fuzzyTermScore('음식점 5812', '58122')).toBeNull();
  });

  // Value: protects=typo allowance scales with query length (1 from 3 characters, 2 from 5);
  // fails_when=the tier thresholds or distance<=allowed guard change; why_new=only the 1-typo tier was
  // exercised; seam=none
  it('allows two jamo typos only in a long query', () => {
    expect(fuzzyTermScore('편의점과 식품점', '펀의잠')).toBeNull();
    expect(fuzzyTermScore('소프트웨어 개발', '소포트웨워')).toBe(4);
  });

  it('returns null for unrelated queries', () => {
    expect(fuzzyTermScore('편의점과 식품점', '항공권')).toBeNull();
    expect(fuzzyTermScore('의류 여성복', 'zzzz')).toBeNull();
  });

  it('ranks exact matches ahead of typo matches', () => {
    const exact = fuzzyTermScore('편의점', '편의점')!;
    const typo = fuzzyTermScore('편의점', '편의잠')!;
    expect(exact).toBeLessThan(typo);
  });
});
