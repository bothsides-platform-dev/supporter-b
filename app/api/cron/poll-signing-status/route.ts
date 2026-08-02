/**
 * POST /api/cron/poll-signing-status — 전자서명 상태 폴링 드라이버.
 *
 * SnowSign 웹훅(/api/signing/webhook)이 저지연 트리거로 상태를 밀어주지만, 웹훅은
 * auto-retry 가 없어 유실될 수 있으므로 진행 중(sent/in_progress) 계약을 주기적으로
 * 폴링해 백스톱으로 반영한다. Lightsail 호스트의 1분 crontab 이 여기로 POST 한다.
 * 각 계약 reconcile 은 실패를 삼키고 lastPolledAt 만 갱신하므로(다음 주기 재시도) 이
 * 드라이버는 stuck(응답 지연) 계약도 자연히 재시도한다.
 *
 * Auth(fail-closed): CRON_SECRET 비어있거나 불일치면 항상 401.
 * runtime='nodejs' — 서비스가 postgres-js 를 전이 import.
 */
import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { logger } from '@/lib/observability/logger';
import { captureSigningError } from '@/lib/server/signing/observability';

export const runtime = 'nodejs';

const POLL_LIMIT = 50;

export async function POST(request: Request): Promise<NextResponse> {
  // 헤더 전용 + 상수시간 비교(쿼리 파라미터 미지원 — 시크릿이 접근 로그에 남지 않도록,
  // 웹훅 검증과 동일 패턴). 길이 가드 후 항상 timingSafeEqual 을 실행해 타이밍 오라클 차단.
  const secret = process.env.CRON_SECRET ?? '';
  const provided = request.headers.get('x-cron-secret') ?? '';
  const secretBuf = Buffer.from(secret);
  const cmpBuf = Buffer.alloc(secretBuf.length, 0);
  Buffer.from(provided).copy(cmpBuf);
  const match =
    secret.length > 0 &&
    provided.length === secret.length &&
    timingSafeEqual(secretBuf, cmpBuf);

  if (!match) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { getContractSigningService } = await import('@/lib/server/services/contract-signing');
    const service = await getContractSigningService();
    const result = await service.pollPending(POLL_LIMIT);
    // 고아 복구 — 발송은 됐는데 완료 postMessage 가 유실돼 대기에 갇힌 계약을 되찾는다.
    // 재넛지보다 먼저 돈다: 이미 나간 계약을 두고 "계약서를 올려달라"고 조르면 안 된다.
    const recover = await service.recoverStaleOrphans();
    // 방치된 awaiting_pg_template 계약 재넛지(7일 스로틀) — 같은 주기에 백스톱.
    const nudge = await service.nudgeStaleAwaiting();
    return NextResponse.json({ ...result, ...recover, ...nudge });
  } catch (e) {
    logger.error('cron.poll_signing_failed', { err: String(e) });
    captureSigningError('cron.poll_signing_failed', e);
    return NextResponse.json({ error: 'poll_failed' }, { status: 500 });
  }
}
