import { describe, it, expect } from 'vitest';
import { isValidWebsiteUrl, isValidWebsiteUrlLight, normalizeWebsiteUrl } from '../website-url';

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

  it('점이 없는 단순 문자열은 거부한다', () => {
    expect(isValidWebsiteUrl('notadomain')).toBe(false);
    expect(isValidWebsiteUrl('https://localhost')).toBe(false);
    expect(isValidWebsiteUrl('https://localhost:3000')).toBe(false);
  });

  it('TLD만 있는 단일 라벨(등록 가능한 도메인 없음)은 거부한다', () => {
    expect(isValidWebsiteUrl('com')).toBe(false);
    expect(isValidWebsiteUrl('https://com')).toBe(false);
  });

  it('프로토콜 상대 URL(//)은 거부한다', () => {
    expect(isValidWebsiteUrl('//evil.com')).toBe(false);
  });

  it('userinfo(@)가 포함된 URL은 거부한다 (피싱 표시-목적지 불일치 방지)', () => {
    expect(isValidWebsiteUrl('https://example.com@evil.com')).toBe(false);
    expect(isValidWebsiteUrl('https://user:pass@evil.com')).toBe(false);
    // 스킴 없는 입력에서도 userinfo 패턴 거부
    expect(isValidWebsiteUrl('example.com@evil.com')).toBe(false);
  });
});

describe('isValidWebsiteUrlLight', () => {
  it('빈 값/공백은 허용한다 (선택 필드)', () => {
    expect(isValidWebsiteUrlLight('')).toBe(true);
    expect(isValidWebsiteUrlLight('   ')).toBe(true);
  });

  it('http(s):// 스킴 + 도메인 형태를 통과시킨다', () => {
    expect(isValidWebsiteUrlLight('https://example.com')).toBe(true);
    expect(isValidWebsiteUrlLight('http://www.a.co.kr')).toBe(true);
    expect(isValidWebsiteUrlLight('https://sub.domain.example.com/path')).toBe(true);
  });

  it('스킴 없는 도메인도 허용한다', () => {
    expect(isValidWebsiteUrlLight('example.com')).toBe(true);
    expect(isValidWebsiteUrlLight('www.example.com')).toBe(true);
    expect(isValidWebsiteUrlLight('sub.example.co.kr')).toBe(true);
  });

  it('앞뒤 공백이 있어도 트림 후 판정한다', () => {
    expect(isValidWebsiteUrlLight('  https://example.com  ')).toBe(true);
    expect(isValidWebsiteUrlLight('  example.com  ')).toBe(true);
  });

  it('http(s)가 아닌 스킴은 거부한다', () => {
    expect(isValidWebsiteUrlLight('ftp://x.com')).toBe(false);
  });

  it('점이 없는 단순 문자열은 거부한다', () => {
    expect(isValidWebsiteUrlLight('abc')).toBe(false);
    expect(isValidWebsiteUrlLight('notadomain')).toBe(false);
  });

  it('localhost 등 점 없는 호스트는 거부한다', () => {
    expect(isValidWebsiteUrlLight('localhost')).toBe(false);
    expect(isValidWebsiteUrlLight('localhost:3000')).toBe(false);
  });

  it('프로토콜 상대 URL(//)은 거부한다', () => {
    expect(isValidWebsiteUrlLight('//evil.com')).toBe(false);
  });

  it('userinfo(@)가 포함된 URL은 거부한다', () => {
    expect(isValidWebsiteUrlLight('https://example.com@evil.com')).toBe(false);
    expect(isValidWebsiteUrlLight('example.com@evil.com')).toBe(false);
  });

  it('무효 TLD도 점이 있으면 통과시킨다 (경량 검사는 PSL 미사용)', () => {
    // isValidWebsiteUrlLight는 PSL 없이 구조만 보므로 invalidtld를 거부하지 않음
    expect(isValidWebsiteUrlLight('example.invalidtld')).toBe(true);
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
