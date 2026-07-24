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
import { resolveMaxInflight } from './_max-inflight';
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

// Reconnect-storm load shed (mitigation #1). The eager always-on WS reconnects
// EVERY tab within ~1s of a Centrifugo restart; unbounded, that synchronized
// token-issuance flood can saturate the (single) Postgres pool and starve
// business traffic. Bound concurrent in-flight issuance; over the cap, shed
// immediately (before auth()/DB) with 503 + a JITTERED Retry-After so shed
// clients retry spread out instead of re-synchronizing. ky (lib/http) honors
// Retry-After on its 503 retry and centrifuge-js backs off on getToken failure,
// so a 503 here degrades gracefully — never a /login bounce (that's 401-gated).
// The counter is in-process = per PM2 instance, which matches the deployment
// (single `next start`). Tune the cap relative to the Postgres pool size via
// CENTRIFUGO_TOKEN_MAX_INFLIGHT after a reconnect-storm load test.
// finite ≥ 0 가드 — malformed env 가 NaN 비교로 load-shed 를 조용히 끄지
// 않도록 파싱은 _max-inflight.ts (단위 테스트 대상) 로 분리.
const MAX_INFLIGHT = resolveMaxInflight(process.env.CENTRIFUGO_TOKEN_MAX_INFLIGHT);
let inFlight = 0;

export async function POST() {
  if (inFlight >= MAX_INFLIGHT) {
    const retryAfter = 1 + Math.floor(Math.random() * 4); // 1-4s jitter
    return new NextResponse('Busy', {
      status: 503,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }
  inFlight++;
  try {
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
  } finally {
    inFlight--;
  }
}
