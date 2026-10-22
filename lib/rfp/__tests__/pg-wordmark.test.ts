import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PG_WORDMARKS, pgWordmark } from '../pg-wordmark';

// Value: protects=case-insensitive match and the inicis alias (uppercase brand spellings); fails_when=toLowerCase dropped or inicis alias removed; why_new=prior rows were lowercase/Korean only; seam=none; no_claim=whitespace-split aliases
const CASES = [
  ['토스페이먼츠', '/images/pg-logos/toss.png'],
  ['키움페이', '/images/pg-logos/kiwoom.svg'],
  ['키움페이먼츠', '/images/pg-logos/kiwoom.svg'],
  ['헥토파이낸셜', '/images/pg-logos/hecto.svg'],
  ['KG 이니시스', '/images/pg-logos/inicis.png'],
  ['KG INICIS', '/images/pg-logos/inicis.png'],
  ['nhn kcp', '/images/pg-logos/kcp.svg'],
  ['NHN KCP', '/images/pg-logos/kcp.svg'],
] as const;

describe('pgWordmark', () => {
  it.each(CASES)('%s → %s', (name, src) => {
    expect(pgWordmark(name)?.src).toBe(src);
  });

  it('등록되지 않은 PG사는 null 이라 이름 텍스트를 그대로 쓴다', () => {
    expect(pgWordmark('Alpha')).toBeNull();
    expect(pgWordmark('')).toBeNull();
  });

  // Value: protects=every registered wordmark points at a file that exists in public/; fails_when=a logo asset is renamed or deleted, leaving a broken image in the candidate card, tutorial or loading reel; why_new=prior tests compare src strings only; seam=none; no_claim=width/height match the asset
  it('모든 워드마크는 public 에 실존하는 파일을 가리킨다', () => {
    for (const { src } of Object.values(PG_WORDMARKS)) {
      expect(existsSync(join(process.cwd(), 'public', src)), src).toBe(true);
    }
  });
});
