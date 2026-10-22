import { describe, expect, it } from 'vitest';
import { pgWordmark } from '../pg-wordmark';

describe('pgWordmark', () => {
  it.each([
    ['토스페이먼츠', '/images/pg-logos/toss.png'],
    ['키움페이', '/images/pg-logos/kiwoom.svg'],
    ['키움페이먼츠', '/images/pg-logos/kiwoom.svg'],
    ['헥토파이낸셜', '/images/pg-logos/hecto.svg'],
    ['KG 이니시스', '/images/pg-logos/inicis.png'],
    ['nhn kcp', '/images/pg-logos/kcp.svg'],
  ])('%s → %s', (name, src) => {
    expect(pgWordmark(name)?.src).toBe(src);
  });

  it('등록되지 않은 PG사는 null 이라 이름 텍스트를 그대로 쓴다', () => {
    expect(pgWordmark('Alpha')).toBeNull();
    expect(pgWordmark('')).toBeNull();
  });
});
