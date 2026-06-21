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
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { issueCentrifugoConnectionToken } from '@/lib/server/realtime/token';
import type { Session } from 'next-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Route-LOCAL gate cache (C1). The eager always-on WS makes every Centrifugo
// restart a reconnect storm; this collapses the per-reconnect gate reads to ~1
// DB read / user / window. Deliberately NOT in lib/auth/session.ts — caching the
// shared helpers would widen the revocation window for EVERY server action.
const GATE_TTL_MS = 10_000;
type Gate = { revoked: boolean; unverified: boolean; at: number };
const gateCache = new Map<string, Gate>();

async function checkGates(session: Session, now: number): Promise<Gate> {
  const userId = session.user!.id!;
  const hit = gateCache.get(userId);
  if (hit && now - hit.at < GATE_TTL_MS) return hit;
  const [revoked, unverified] = await Promise.all([
    isSessionRevoked(session),
    isEmailUnverified(session),
  ]);
  const gate = { revoked, unverified, at: now };
  gateCache.set(userId, gate);
  return gate;
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
  const gate = await checkGates(session, Date.now());
  if (gate.revoked) return new NextResponse('Unauthorized', { status: 401 });
  if (gate.unverified) return new NextResponse('Forbidden', { status: 403 });
  const token = await issueCentrifugoConnectionToken(
    session.user.id,
    session.user.workspaceId,
  );
  return NextResponse.json({ token });
}
