/**
 * POST /api/cron/poll-signing-status — 전자서명 상태 폴링 드라이버.
 *
 * SnowSign 은 webhook 을 제공하지 않으므로 진행 중(sent/in_progress) 계약의 상태를
 * 주기적으로 폴링해 로컬에 반영한다. Lightsail 호스트의 1분 crontab 이 여기로 POST 한다.
 * 각 계약 reconcile 은 실패를 삼키고 lastPolledAt 만 갱신하므로(다음 주기 재시도) 이
 * 드라이버는 stuck(응답 지연) 계약도 자연히 재시도한다.
 *
 * Auth(fail-closed): CRON_SECRET 비어있거나 불일치면 항상 401.
 * runtime='nodejs' — 서비스가 postgres-js 를 전이 import.
 */
import { NextResponse } from 'next/server';

import { logger } from '@/lib/observability/logger';

export const runtime = 'nodejs';

const POLL_LIMIT = 50;

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get('x-cron-secret') ?? new URL(request.url).searchParams.get('secret');

  if (!secret || provided !== secret) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { getContractSigningService } = await import('@/lib/server/services/contract-signing');
    const service = await getContractSigningService();
    const result = await service.pollPending(POLL_LIMIT);
    return NextResponse.json(result);
  } catch (e) {
    logger.error('cron.poll_signing_failed', { err: String(e) });
    return NextResponse.json({ error: 'poll_failed' }, { status: 500 });
  }
}
