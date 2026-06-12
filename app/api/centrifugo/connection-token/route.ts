/**
 * POST /api/centrifugo/connection-token
 *
 * Issues a short-lived Centrifugo connection JWT for the authenticated user.
 * The client (centrifuge-js `getToken`) calls this on connect and re-connect.
 * 401 when there is no session — the connection is then refused by Centrifugo.
 *
 * Channel-level access is NOT decided here; it is enforced by the subscribe
 * proxy. This endpoint only proves identity.
 *
 * runtime='nodejs' — `auth()` transitively imports postgres-js.
 * dynamic='force-dynamic' — never cache a per-user short-lived token.
 */
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { isSessionRevoked } from '@/lib/auth/session';
import { issueCentrifugoConnectionToken } from '@/lib/server/realtime/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
  if (await isSessionRevoked(session)) return new NextResponse('Unauthorized', { status: 401 });
  const token = await issueCentrifugoConnectionToken(session.user.id);
  return NextResponse.json({ token });
}
