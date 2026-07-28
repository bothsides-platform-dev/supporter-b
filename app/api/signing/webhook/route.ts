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
 * 응답은 항상 즉시 200 으로 반환하고, 실제 재조회(getContract 재조회 — 느린/재시도되는
 * 아웃바운드 호출)는 after() 로 응답 이후에 돌린다. SnowSign 5초 웹훅 예산을 넘기지 않도록
 * ack 를 블로킹하지 않으며, 재조회가 유실/실패해도 폴링 cron 이 백스톱한다. 서명 통과 후
 * 파싱 실패도 200 ack(재전송 로그 방지).
 * runtime='nodejs' — 서비스가 postgres-js 를 전이 import + crypto HMAC.
 */
import { after, NextResponse } from 'next/server';

import { logger } from '@/lib/observability/logger';
import { captureSigningError } from '@/lib/server/signing/observability';
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

  // payload 가 null/원시값(진위 검증은 통과했으나 비정상 본문)이어도 500 없이 200 ack.
  const contractId = payload?.data?.contract_id;
  // test 이벤트/계약 무관 이벤트는 재조회 대상이 없다 — 즉시 ack.
  if (payload?.event && payload.event !== 'test' && contractId) {
    // 응답을 먼저 반환하고 재조회는 응답 이후에 실행(5초 예산 보호). 실패는 폴링이 보완.
    after(async () => {
      try {
        const { getContractSigningService } = await import(
          '@/lib/server/services/contract-signing'
        );
        await (await getContractSigningService()).reconcileByProviderRef(contractId);
      } catch (e) {
        logger.warn('signing.webhook_reconcile_failed', { err: String(e) });
        captureSigningError('signing.webhook_reconcile_failed', e, { providerRef: contractId });
      }
    });
  }
  return NextResponse.json({ received: true });
}
