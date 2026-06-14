/**
 * POST /api/cron/flush-outbox — periodic outbox drainer.
 *
 * The 1-minute crontab on the Lightsail host POSTs here to push the email
 * queue forward. This is required because the post-commit flush
 * (lib/server/outbox/post-commit.ts) fires only right after an action commits —
 * it cannot pick up DELAYED chat-digest rows that become due (scheduled_at <=
 * now) on a later tick when no action is running. The cron is what actually
 * sends those window-end digests.
 *
 * It drives:
 *   - flushAllOutbox       — generic pending rows (everything except the
 *                            coalesced chat digests).
 *   - flushChatDigests     — coalesced chat.message digests, recomputed at send.
 *   - flushTeamChatDigests — coalesced team_chat.message digests, recomputed at send.
 *
 * Auth (fail-closed): authorized iff CRON_SECRET is a non-empty string AND the
 * provided value (header `x-cron-secret` or query `?secret=`) equals it. An
 * unset OR empty CRON_SECRET → ALWAYS 401, even against a matching value — so a
 * crontab line whose `$CRON_SECRET` expands to empty can never bypass the gate.
 *
 * runtime='nodejs' — the flushes transitively import postgres-js.
 */
import { NextResponse } from 'next/server';

import { flushAllOutbox } from '@/lib/server/outbox/flush-all';
import { flushChatDigests } from '@/lib/server/outbox/chat-digest-flush';
import { flushTeamChatDigests } from '@/lib/server/outbox/team-chat-digest-flush';
import { getResendSender } from '@/lib/integrations/resend';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get('x-cron-secret') ??
    new URL(request.url).searchParams.get('secret');

  // `!secret` first: an unset or empty secret fails closed before any compare,
  // so an attacker can't satisfy the gate with the empty string.
  if (!secret || provided !== secret) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const sender = getResendSender();
  const generic = await flushAllOutbox(sender);
  const digests = await flushChatDigests(sender);
  const teamDigests = await flushTeamChatDigests(sender);

  return NextResponse.json({ generic, digests, teamDigests });
}
