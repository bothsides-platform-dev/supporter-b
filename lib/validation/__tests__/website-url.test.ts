import { describe, it, expect } from 'vitest';
import { isValidWebsiteUrl } from '../website-url';

describe('isValidWebsiteUrl', () => {
  it('빈 값/공백은 허용한다 (선택 필드)', () => {
    expect(isValidWebsiteUrl('')).toBe(true);
    expect(isValidWebsiteUrl('   ')).toBe(true);
  });

  it('http(s):// 스킴 + 도메인 형태를 통과시킨다', () => {
    expect(isValidWebsiteUrl('https://supporter-b.com/')).toBe(true);
    expect(isValidWebsiteUrl('http://www.a.co.kr')).toBe(true);
    expect(isValidWebsiteUrl('https://sub.domain.example.com/path?q=1')).toBe(true);
  });

  it('앞뒤 공백이 있어도 트림 후 판정한다', () => {
    expect(isValidWebsiteUrl('  https://supporter-b.com  ')).toBe(true);
  });

  it('스킴이 없으면 거부한다', () => {
    expect(isValidWebsiteUrl('supporter-b.com')).toBe(false);
    expect(isValidWebsiteUrl('www.supporter-b.com')).toBe(false);
  });

  it('http(s)가 아닌 스킴은 거부한다', () => {
    expect(isValidWebsiteUrl('ftp://x.com')).toBe(false);
    expect(isValidWebsiteUrl('htp://x.com')).toBe(false);
  });

  it('도메인(점+TLD) 형태가 아니면 거부한다', () => {
    expect(isValidWebsiteUrl('https://localhost')).toBe(false);
    expect(isValidWebsiteUrl('https://localhost:3000')).toBe(false);
  });

  it('아예 URL이 아닌 문자열은 거부한다', () => {
    expect(isValidWebsiteUrl('abc')).toBe(false);
    expect(isValidWebsiteUrl('https://')).toBe(false);
  });

  it('userinfo(@)가 포함된 URL은 거부한다 (피싱 표시-목적지 불일치 방지)', () => {
    // new URL()은 example.com을 userinfo로, evil.com을 실제 host로 파싱한다.
    expect(isValidWebsiteUrl('https://example.com@evil.com')).toBe(false);
    expect(isValidWebsiteUrl('https://user:pass@evil.com')).toBe(false);
  });
});
