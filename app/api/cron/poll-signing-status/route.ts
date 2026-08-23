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
    // 방치된 awaiting_pg_template 계약 재넛지(7일 스로틀) — 같은 주기에 백스톱.
    const nudge = await service.nudgeStaleAwaiting();
    // onAward(after() fire-and-forget) 유실 자가치유 — awarded 인데 계약 행이
    // 전무한 딜에 대기 라운드를 재생성한다(없으면 계약 탭 자체가 영영 안 뜬다).
    const sweep = await service.sweepMissingContracts();
    // 마감 없는 계약(조항형)의 방치 감지 — 그 경로는 `expired` 에 도달할 수 없어
    // 아무도 취소하지 않으면 영영 열려 있다. 관측만 하고 자동 취소는 하지 않는다.
    const stale = await service.notifyStaleSent();

    // 계약 보관함 — 백필(행 생성 자가치유) + 하이드레이션(완료본·인증서 R2 저장).
    // 폴링 본체를 죽이지 않도록 자체 try 로 감싼다(스텝 내부에도 계약 단위 격리가
    // 있지만, 싱글턴 구성 실패 같은 상위 오류까지 흡수).
    let archiveBackfilled = 0;
    let archiveHydrated = 0;
    let archiveOrphanedRows = 0;
    try {
      const { getContractArchiveService } = await import('@/lib/server/services/contract-archive');
      const archive = await getContractArchiveService();
      const backfill = await archive.backfillMissing();
      if (backfill.ok) archiveBackfilled = backfill.created;
      const hydrate = await archive.hydratePending();
      if (hydrate.ok) {
        archiveHydrated = hydrate.hydrated;
        archiveOrphanedRows = hydrate.orphanedRows;
      }
    } catch (e) {
      logger.error('cron.archive_step_failed', { err: String(e) });
      captureSigningError('cron.archive_step_failed', e);
    }

    return NextResponse.json({
      ...result,
      ...nudge,
      sweepCreated: sweep.ok ? sweep.created : 0,
      staleNotified: stale.notified,
      archiveBackfilled,
      archiveHydrated,
      archiveOrphanedRows,
    });
  } catch (e) {
    logger.error('cron.poll_signing_failed', { err: String(e) });
    captureSigningError('cron.poll_signing_failed', e);
    return NextResponse.json({ error: 'poll_failed' }, { status: 500 });
  }
}
