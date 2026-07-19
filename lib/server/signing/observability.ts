import * as Sentry from '@sentry/nextjs';

import { SnowSignError } from './snowsign-client';

// 자가치유 transient — 다운타임 중 매 폴 주기 재발하므로 Sentry 에 남기면 무료 플랜
// (5k/월)을 소진시킨다. logger(Axiom)에는 남지만 Sentry 는 스킵한다.
const TRANSIENT_CODES = new Set(['SNOWSIGN_NETWORK', 'SNOWSIGN_RATE_LIMIT']);

export type SigningErrorContext = {
  contractId?: string;
  providerRef?: string;
  rfpCode?: string;
};

/**
 * 서명 실패를 Sentry 에 남긴다(logger 는 Sentry 로 포워드하지 않으므로 별도 캡처).
 *
 * 정책: **비정상·하드 실패만** 캡처한다 — 무료 플랜(5k errors/월) 보호(`capture.ts` 참조).
 * 자가치유 transient(NETWORK/RATE_LIMIT)는 스킵한다. **PII 금지** — 참여자 email/name 은
 * 절대 넣지 않고 code·contractId·providerRef·rfpCode 만 태그/extra 로 남긴다(scrubber 정책).
 * 저빈도 사이트에서만 호출한다(고빈도 폴 루프는 Axiom 만 — 폭주 방지). 텔레메트리가
 * 호출자를 깨뜨리지 않도록 try/catch 로 감싼다.
 */
export function captureSigningError(
  event: string,
  err: unknown,
  ctx: SigningErrorContext = {},
): void {
  try {
    const code = err instanceof SnowSignError ? err.code : undefined;
    if (code && TRANSIENT_CODES.has(code)) return; // 자가치유 transient — Sentry 스킵
    const tags: Record<string, string> = { area: 'signing', event };
    if (code) tags.code = code;
    const extra: Record<string, string> = {};
    if (ctx.contractId) extra.contractId = ctx.contractId;
    if (ctx.providerRef) extra.providerRef = ctx.providerRef;
    if (ctx.rfpCode) extra.rfpCode = ctx.rfpCode;
    Sentry.captureException(err, { tags, extra });
  } catch {
    // 텔레메트리는 절대 호출자를 깨뜨리지 않는다.
  }
}
