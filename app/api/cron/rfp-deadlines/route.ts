import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/observability/logger';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET ?? '';
  const supplied = request.headers.get('x-cron-secret') ?? '';
  const expected = Buffer.from(secret);
  const actual = Buffer.alloc(expected.length);
  Buffer.from(supplied).copy(actual);
  const authorized = secret.length > 0 && supplied.length === secret.length && timingSafeEqual(expected, actual);
  if (!authorized) return new NextResponse('Unauthorized', { status: 401 });
  try {
    const { runRfpDeadlineNotices } = await import('@/lib/server/services/rfp-deadlines');
    return NextResponse.json(await runRfpDeadlineNotices());
  } catch (error) {
    logger.error('cron.rfp_deadlines_failed', { err: String(error) });
    return NextResponse.json({ error: 'rfp_deadlines_failed' }, { status: 500 });
  }
}
