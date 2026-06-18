/**
 * PG 로고 자산 매핑.
 *
 * canonicalPgKey → public/images/pg/ 경로.
 * 모르는 키는 null 반환 → 호출부가 graceful fallback 처리.
 *
 * 로고 출처: 각 PG사 공식 사이트 (v0.2.27.0)
 *   - tosspayments  : static.toss.im (mono-black, watermark 제거)
 *   - kginicis      : inicis.com
 *   - nicepayments  : nicepay.co.kr
 *   - kcp           : kcp.co.kr (Nuxt static)
 *   - hectofinancial: hecto.co.kr (Vite bundle inline SVG 추출)
 *   - danal         : danal.co.kr
 *   - kicc          : easypay.co.kr (KICC 이지페이)
 */

const PG_LOGOS: Record<string, string> = {
  tosspayments: '/images/pg/tosspayments.svg',
  kginicis: '/images/pg/kginicis.png',
  nicepayments: '/images/pg/nicepayments.png',
  kcp: '/images/pg/kcp.svg',
  hectofinancial: '/images/pg/hectofinancial.svg',
  danal: '/images/pg/danal.svg',
  kicc: '/images/pg/kicc.svg',
};

/** canonicalPgKey에 해당하는 public 로고 경로. 없으면 null. */
export function pgLogoSrc(key: string): string | null {
  return Object.hasOwn(PG_LOGOS, key) ? PG_LOGOS[key] : null;
}
