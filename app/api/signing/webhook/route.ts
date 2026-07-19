/**
 * POST /api/signing/webhook — SnowSign(스노우싸인) 웹훅 수신.
 *
 * SnowSign 은 진행 이벤트(contract.sent·contract.viewed·participant.signed·
 * participant.declined·contract.completed·contract.cancelled·contract.expired)를
 * 이 URL 로 POST 한다. 앱은 웹훅을 **상태 소스가 아니라 저지연 폴링 트리거**로만 쓴다:
 * HMAC-SHA256 서명을 검증한 뒤 payload 의 contract_id 만 뽑아
 * ContractSigningService.reconcileByProviderRef 로 위임한다(그 안에서 getContract
 * 재조회 → reconcileStatus). 상태 매핑이 폴링과 동일한 단일 경로를 타므로 payload
 * 본문을 신뢰할 필요가 없고, 멱등 ensureFinalized 로 웹훅·폴링 중복이 무해하다.
 * 폴링 cron(poll-signing-status)은 웹훅 유실(SnowSign auto-retry 없음) 백스톱으로 유지.
 *
 * Auth(fail-closed): SNOWSIGN_WEBHOOK_SECRET 미설정 또는 서명 불일치면 401(재조회 없음).
 * 성공 응답은 항상 빠르게 반환한다(SnowSign 5초 타임아웃 — reconcile 은 단일 조회+짧은
 * tx). 서명 통과 후에는 파싱·재조회 실패도 200 으로 ack 한다(재전송 로그 방지 — 폴링 보완).
 * runtime='nodejs' — 서비스가 postgres-js 를 전이 import + crypto HMAC.
 */
import { NextResponse } from 'next/server';

import { logger } from '@/lib/observability/logger';
import { verifySnowSignWebhook } from '@/lib/server/signing/webhook';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.SNOWSIGN_WEBHOOK_SECRET ?? '';
  // raw body 로 HMAC 검증(재직렬화 금지 — 바이트가 달라짐).
  const raw = await request.text();
  const signature = request.headers.get('X-Webhook-Signature');
  if (!verifySnowSignWebhook(raw, signature, secret)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let payload: { event?: string; data?: { contract_id?: string } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ received: true });
  }

  const contractId = payload.data?.contract_id;
  // test 이벤트/계약 무관 이벤트는 재조회 대상이 없다 — 즉시 ack.
  if (payload.event && payload.event !== 'test' && contractId) {
    try {
      const { getContractSigningService } = await import('@/lib/server/services/contract-signing');
      await (await getContractSigningService()).reconcileByProviderRef(contractId);
    } catch (e) {
      // 재조회 실패는 폴링 cron 이 보완 — 웹훅은 항상 ack 해 재전송 로그를 남기지 않는다.
      logger.warn('signing.webhook_reconcile_failed', { err: String(e) });
    }
  }
  return NextResponse.json({ received: true });
}
