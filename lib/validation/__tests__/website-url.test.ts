import { describe, it, expect } from 'vitest';
import { isValidWebsiteUrl, normalizeWebsiteUrl } from '../website-url';

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

  it('스킴 없는 도메인도 허용한다', () => {
    expect(isValidWebsiteUrl('supporter-b.com')).toBe(true);
    expect(isValidWebsiteUrl('www.supporter-b.com')).toBe(true);
    expect(isValidWebsiteUrl('sub.example.co.kr')).toBe(true);
  });

  it('앞뒤 공백이 있어도 트림 후 판정한다', () => {
    expect(isValidWebsiteUrl('  https://supporter-b.com  ')).toBe(true);
    expect(isValidWebsiteUrl('  supporter-b.com  ')).toBe(true);
  });

  it('http(s)가 아닌 스킴은 거부한다', () => {
    expect(isValidWebsiteUrl('ftp://x.com')).toBe(false);
    expect(isValidWebsiteUrl('htp://x.com')).toBe(false);
  });

  it('유효하지 않은 TLD는 거부한다', () => {
    expect(isValidWebsiteUrl('example.invalidtld')).toBe(false);
    expect(isValidWebsiteUrl('https://example.invalidtld')).toBe(false);
  });

  it('점이 없는 단순 문자열은 거부한다', () => {
    expect(isValidWebsiteUrl('notadomain')).toBe(false);
    expect(isValidWebsiteUrl('https://localhost')).toBe(false);
  });

  it('아예 URL이 아닌 문자열은 거부한다', () => {
    expect(isValidWebsiteUrl('abc')).toBe(false);
    expect(isValidWebsiteUrl('https://')).toBe(false);
  });

  it('userinfo(@)가 포함된 URL은 거부한다 (피싱 표시-목적지 불일치 방지)', () => {
    expect(isValidWebsiteUrl('https://example.com@evil.com')).toBe(false);
    expect(isValidWebsiteUrl('https://user:pass@evil.com')).toBe(false);
  });
});

describe('normalizeWebsiteUrl', () => {
  it('빈 값은 그대로 반환한다', () => {
    expect(normalizeWebsiteUrl('')).toBe('');
    expect(normalizeWebsiteUrl('   ')).toBe('   ');
  });

  it('스킴이 없는 도메인에 https://를 붙인다', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com');
    expect(normalizeWebsiteUrl('www.example.com')).toBe('https://www.example.com');
  });

  it('이미 http://가 있으면 그대로 반환한다', () => {
    expect(normalizeWebsiteUrl('http://example.com')).toBe('http://example.com');
  });

  it('이미 https://가 있으면 그대로 반환한다', () => {
    expect(normalizeWebsiteUrl('https://example.com')).toBe('https://example.com');
  });
});
