/**
 * GET /api/notifications
 *
 * History endpoint — Step 9 hard 제약 5: history는 GET endpoint에 분리,
 * SSE stream은 신규 emit만 push 한다. 클라이언트는 mount 시 GET 1회로
 * 최근 50건 hydrate, 이후 EventSource로 stream 구독해 prepend.
 *
 * runtime='nodejs' — repo factory가 postgres-js를 lazy import.
 */
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { getNotificationRepo } from '@/lib/server/repositories/factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
  if (await isSessionRevoked(session)) return new NextResponse('Unauthorized', { status: 401 });
  if (await isEmailUnverified(session)) return new NextResponse('Forbidden', { status: 403 });
  if (!session.user.workspaceId) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const repo = await getNotificationRepo();
  const list = await repo.findRecentForUser(session.user.id, session.user.workspaceId, 50);
  return NextResponse.json({ notifications: list });
}
