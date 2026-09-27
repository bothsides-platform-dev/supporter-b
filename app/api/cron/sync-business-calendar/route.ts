import { timingSafeEqual } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/observability/logger';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET ?? '';
  const provided = request.headers.get('x-cron-secret') ?? '';
  const expected = Buffer.from(secret);
  const comparison = Buffer.alloc(expected.length, 0);
  Buffer.from(provided).copy(comparison);
  if (!secret || provided.length !== secret.length || !timingSafeEqual(expected, comparison)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  try {
    const { runBusinessCalendarSync } = await import('@/lib/server/services/business-calendar-sync');
    return NextResponse.json(await runBusinessCalendarSync());
  } catch {
    // Provider errors may contain ServiceKey in their URL. Never log their raw message.
    logger.error('calendar.sync_failed');
    Sentry.captureException(new Error('calendar_sync_failed'), { tags: { area: 'business_calendar' } });
    return NextResponse.json({ error: 'calendar_sync_failed' }, { status: 500 });
  }
}
