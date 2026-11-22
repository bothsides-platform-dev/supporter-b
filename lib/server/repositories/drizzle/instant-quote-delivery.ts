import { and, eq, isNull, lte, notExists, sql } from 'drizzle-orm';
import {
  instantAttempts as attempts,
  instantPgChannels as channels,
  outboxEntries,
  users,
  workspaces,
  type InstantAttempt,
} from '@/lib/db/schema';
import type { Tx } from '../types';
export async function queueMail(
  tx: Tx,
  to: string,
  subject: string,
  dedupeKey: string,
) {
  await tx
    .insert(outboxEntries)
    .values({
      event: 'pg.instant_quote',
      toAddr: to,
      subject,
      html: '',
      dedupeKey,
    })
    .onConflictDoNothing();
}
export async function buyerRecipient(tx: Tx, id: string) {
  return (await tx.select().from(users).where(eq(users.id, id)))[0];
}
export async function recipientLive(tx: Tx, a: InstantAttempt) {
  const [current] = await tx
    .select({ revision: channels.revision, recipient: channels.recipient })
    .from(channels)
    .innerJoin(workspaces, eq(workspaces.id, channels.pgId))
    .where(
      and(
        eq(channels.pgId, a.pgId),
        eq(workspaces.status, 'active'),
        eq(workspaces.type, 'pg'),
      ),
    )
    .for('share');
  return (
    current &&
    current.revision === a.channelRevision &&
    current.recipient === a.recipient
  );
}
export const instantFollowupJobs = [
  {
    notice: 'ack',
    due: attempts.ackDue,
    missing: isNull(attempts.ackAt),
    role: 'pg',
  },
  {
    notice: 'application',
    due: attempts.applyDue,
    missing: and(
      isNull(attempts.appliedAt),
      isNull(attempts.buyerAppliedAt),
      isNull(attempts.buyerEnrolledAt),
    ),
    role: 'buyer',
  },
  {
    notice: 'result',
    due: attempts.resultDue,
    missing: and(isNull(attempts.buyerEnrolledAt), isNull(attempts.resultAt)),
    role: 'buyer',
  },
] as const;
export async function dueAttempts(
  tx: Tx,
  job: (typeof instantFollowupJobs)[number],
  now: Date,
) {
  return await tx
    .select()
    .from(attempts)
    .where(
      and(
        isNull(attempts.closedAt),
        job.missing,
        lte(job.due, now),
        notExists(
          tx
            .select({ id: outboxEntries.id })
            .from(outboxEntries)
            .where(
              eq(
                outboxEntries.dedupeKey,
                sql`'instant:' || ${attempts.id}::text || ':' || ${job.role}::text || ':' || ${job.notice}::text`,
              ),
            ),
        ),
      ),
    )
    .limit(100)
    .for('update', { skipLocked: true });
}
