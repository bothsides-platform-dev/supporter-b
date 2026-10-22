import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PG_WORDMARKS, pgWordmark } from '../pg-wordmark';

// Value: protects=official spellings still get the logo across case, spacing, full-width characters and corporate affixes ((주)·㈜·주식회사); fails_when=NFKC, the whitespace strip, toLowerCase or the affix strip is dropped, or an official alias is removed; why_new=prior rows were lowercase/Korean only; seam=none; no_claim=admin-side name policy
const CASES = [
  ['토스페이먼츠', '/images/pg-logos/toss.png'],
  ['키움페이', '/images/pg-logos/kiwoom.svg'],
  ['키움페이먼츠', '/images/pg-logos/kiwoom.svg'],
  ['헥토파이낸셜', '/images/pg-logos/hecto.svg'],
  ['KG이니시스', '/images/pg-logos/inicis.png'],
  ['KG 이니시스', '/images/pg-logos/inicis.png'],
  ['KG INICIS', '/images/pg-logos/inicis.png'],
  ['ＫＧ이니시스', '/images/pg-logos/inicis.png'],
  ['nhn kcp', '/images/pg-logos/kcp.svg'],
  ['NHN KCP', '/images/pg-logos/kcp.svg'],
  ['토스 페이먼츠', '/images/pg-logos/toss.png'],
  ['토스페이먼츠(주)', '/images/pg-logos/toss.png'],
  ['㈜토스페이먼츠', '/images/pg-logos/toss.png'],
  ['주식회사 토스페이먼츠', '/images/pg-logos/toss.png'],
  ['KG이니시스(주)', '/images/pg-logos/inicis.png'],
] as const;

describe('pgWordmark', () => {
  it.each(CASES)('%s → %s', (name, src) => {
    expect(pgWordmark(name)?.src).toBe(src);
  });

  it('등록되지 않은 PG사는 null 이라 이름 텍스트를 그대로 쓴다', () => {
    expect(pgWordmark('Alpha')).toBeNull();
    expect(pgWordmark('')).toBeNull();
  });

  // Value: protects=a different PG (reseller, test workspace, look-alike) never shows an official logo that hides its real name; fails_when=matching loosens from exact to substring or short tokens; why_new=prior rows only checked positive matches; seam=none; no_claim=two workspaces approved with the exact same official name
  it.each([
    '토스트페이', '토스', '키움증권', '헥토',
    'KG이니시스 강남 대리점', '토스페이먼츠 테스트', 'KCPay', 'QuickCPay', 'KG이니시스 / 토스페이먼츠',
  ])('공식 이름과 다르면(%s) 로고를 붙이지 않는다', (name) => {
    expect(pgWordmark(name)).toBeNull();
  });

  // Value: protects=every registered wordmark points at a file that exists in public/; fails_when=a logo asset is renamed or deleted, leaving a broken image in the candidate card, tutorial or loading reel; why_new=covers the whole registry including kcp.svg used only by the loading reel (tutorial-fixtures checks the 4 tutorial paths); seam=none; no_claim=width/height match the asset
  it('모든 워드마크는 public 에 실존하는 파일을 가리킨다', () => {
    for (const { src } of Object.values(PG_WORDMARKS)) {
      expect(existsSync(join(process.cwd(), 'public', src)), src).toBe(true);
    }
  });
});
