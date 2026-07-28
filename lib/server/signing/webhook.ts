// SnowSign(스노우싸인) 웹훅 HMAC-SHA256 서명 검증.
//
// SnowSign 은 진행 이벤트(contract.completed·participant.signed 등)를 등록 URL 로
// POST 하며, `X-Webhook-Signature` 헤더에 raw body 의 HMAC-SHA256(hex) 서명을 담는다.
// 검증은 반드시 **파싱 전 raw body** 로 계산해야 한다(재직렬화 금지 — 바이트가 달라짐).
//
// 앱은 이 웹훅을 상태 소스가 아니라 **저지연 폴링 트리거**로만 쓴다(payload 본문은
// 신뢰하지 않고 contract_id 만 뽑아 getContract 로 재조회). 따라서 여기서는 진위만
// 판정하고, 상태 매핑은 ContractSigningService.reconcileStatus 단일 경로가 소유한다.

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * raw body 와 헤더 서명이 공유 시크릿으로 계산한 HMAC-SHA256(hex)과 일치하는지 검증한다.
 * 시크릿/서명 부재 시 fail-closed(false). 길이가 다르면 timingSafeEqual 이 throw 하므로
 * 먼저 길이를 확인한다(공개 해시의 길이만 노출 — 시크릿은 새지 않음).
 */
export function verifySnowSignWebhook(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const expBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(signature);
  if (expBuf.length !== sigBuf.length) return false;
  return timingSafeEqual(expBuf, sigBuf);
}
