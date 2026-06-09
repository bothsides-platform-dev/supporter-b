import { describe, it, expect } from 'vitest';
import { safeInternalNext } from '@/lib/auth/safe-next';

describe('safeInternalNext', () => {
  it('허용: 일반 내부 경로', () => {
    expect(safeInternalNext('/rfp/new')).toBe('/rfp/new');
  });

  it('허용: 쿼리스트링 보존', () => {
    expect(safeInternalNext('/rfp/new?x=1')).toBe('/rfp/new?x=1');
  });

  it('허용: 슬래시 하나로 시작하는 다른 경로', () => {
    expect(safeInternalNext('/home')).toBe('/home');
  });

  it('차단: 프로토콜-상대 URL (//', () => {
    expect(safeInternalNext('//evil.com')).toBeNull();
  });

  it('차단: http URL', () => {
    expect(safeInternalNext('http://evil.com')).toBeNull();
  });

  it('차단: https URL', () => {
    expect(safeInternalNext('https://evil.com')).toBeNull();
  });

  it('차단: javascript: 스킴', () => {
    expect(safeInternalNext('javascript:alert(1)')).toBeNull();
  });

  it('차단: 슬래시 없이 시작 (상대 경로)', () => {
    expect(safeInternalNext('rfp/new')).toBeNull();
  });

  it('차단: 백슬래시로 시작 (/\\\\evil)', () => {
    expect(safeInternalNext('/\\evil.com')).toBeNull();
  });

  it('차단: 빈 문자열', () => {
    expect(safeInternalNext('')).toBeNull();
  });

  it('차단: undefined', () => {
    expect(safeInternalNext(undefined)).toBeNull();
  });

  it('차단: null', () => {
    expect(safeInternalNext(null)).toBeNull();
  });
});
