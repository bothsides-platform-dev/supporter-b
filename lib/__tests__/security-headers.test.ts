/**
 * SECURITY_HEADERS — the security response headers applied to every route via
 * next.config.ts `headers()`. This test pins the exact set and values so an
 * accidental deletion or weakening shows up as a red test, not a prod scan.
 */
import { describe, it, expect } from 'vitest';
import { SECURITY_HEADERS } from '@/lib/security-headers';

function headerValue(key: string): string | undefined {
  return SECURITY_HEADERS.find((h) => h.key === key)?.value;
}

describe('SECURITY_HEADERS', () => {
  it('HSTS를 1년 + 서브도메인 포함으로 강제한다', () => {
    expect(headerValue('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });

  it('MIME 스니핑을 차단한다', () => {
    expect(headerValue('X-Content-Type-Options')).toBe('nosniff');
  });

  it('프레이밍을 같은 출처로 제한한다 (PDF 미리보기 iframe은 same-origin이라 허용)', () => {
    expect(headerValue('X-Frame-Options')).toBe('SAMEORIGIN');
  });

  it('리퍼러를 cross-origin에는 origin까지만 보낸다', () => {
    expect(headerValue('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('카메라·마이크·위치 권한을 전면 차단한다', () => {
    expect(headerValue('Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
  });

  it('헤더 5종 외 잉여 항목이 없다 (CSP는 nonce 작업 후 별도 도입)', () => {
    expect(SECURITY_HEADERS).toHaveLength(5);
  });
});
