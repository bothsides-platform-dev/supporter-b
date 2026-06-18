/**
 * pgLogoSrc — canonicalPgKey → public 로고 경로 매핑 헬퍼
 */
import { describe, it, expect } from 'vitest';
import { pgLogoSrc } from '../pg-logos';

describe('pgLogoSrc', () => {
  it('tosspayments 키에 대해 /images/pg/ 경로를 반환한다', () => {
    const src = pgLogoSrc('tosspayments');
    expect(src).toMatch(/^\/images\/pg\/tosspayments\./);
  });

  it('kginicis 키에 대해 /images/pg/ 경로를 반환한다', () => {
    expect(pgLogoSrc('kginicis')).toMatch(/^\/images\/pg\/kginicis\./);
  });

  it('nicepayments 키에 대해 /images/pg/ 경로를 반환한다', () => {
    expect(pgLogoSrc('nicepayments')).toMatch(/^\/images\/pg\/nicepayments\./);
  });

  it('kcp 키에 대해 /images/pg/ 경로를 반환한다', () => {
    expect(pgLogoSrc('kcp')).toMatch(/^\/images\/pg\/kcp\./);
  });

  it('hectofinancial 키에 대해 /images/pg/ 경로를 반환한다', () => {
    expect(pgLogoSrc('hectofinancial')).toMatch(/^\/images\/pg\/hectofinancial\./);
  });

  it('danal 키에 대해 /images/pg/ 경로를 반환한다', () => {
    expect(pgLogoSrc('danal')).toMatch(/^\/images\/pg\/danal\./);
  });

  it('kicc 키에 대해 /images/pg/ 경로를 반환한다', () => {
    expect(pgLogoSrc('kicc')).toMatch(/^\/images\/pg\/kicc\./);
  });

  it('알 수 없는 키는 null을 반환한다', () => {
    expect(pgLogoSrc('unknown-pg')).toBeNull();
    expect(pgLogoSrc('')).toBeNull();
  });

  it('프로토타입 상속 키(__proto__, constructor 등)는 null을 반환한다', () => {
    expect(pgLogoSrc('__proto__')).toBeNull();
    expect(pgLogoSrc('constructor')).toBeNull();
    expect(pgLogoSrc('toString')).toBeNull();
  });
});
