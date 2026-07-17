import { describe, it, expect } from 'vitest';
import { sha256Hex } from '@/lib/server/contracts/hash';

// 알려진 SHA-256 테스트 벡터로 못박는다. 이 해시는 계약 문서의 무결성 증거
// (basePdfSha256/finalPdfSha256)이자 감사추적 확인서에 인쇄되는 값이므로,
// 알고리즘·인코딩이 조용히 바뀌면 과거 발급 문서의 검증이 전부 깨진다.
describe('sha256Hex', () => {
  it('빈 입력의 알려진 벡터', () => {
    expect(sha256Hex(Buffer.from(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('"abc" 의 알려진 벡터', () => {
    expect(sha256Hex(Buffer.from('abc', 'utf8'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('Uint8Array 입력도 Buffer 와 동일한 해시', () => {
    const bytes = new Uint8Array([0x61, 0x62, 0x63]);
    expect(sha256Hex(bytes)).toBe(sha256Hex(Buffer.from('abc', 'utf8')));
  });

  it('소문자 hex 64자를 반환한다', () => {
    const out = sha256Hex(Buffer.from('supportb', 'utf8'));
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });

  it('1바이트만 달라도 해시가 달라진다', () => {
    expect(sha256Hex(Buffer.from('abc'))).not.toBe(sha256Hex(Buffer.from('abd')));
  });
});
