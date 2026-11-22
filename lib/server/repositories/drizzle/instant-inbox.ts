import { and, desc, eq, sql } from 'drizzle-orm';
import {
  instantAttempts as a,
  instantRequests as r,
  signingContracts as sc,
  outboxEntries,
} from '@/lib/db/schema';
import type { Tx } from '../types';
import type { Actor } from '@/lib/server/services/types';
export async function instantInbox(tx: Tx, actor: Actor, pg: boolean) {
  return tx
    .select({
      id: a.id,
      code: a.code,
      pgName: sql<string>`${a.terms}->>'pgName'`,
      input: r.input,
      company: sql<string>`${a.applicant}->>'company'`,
      decision: a.decision,
      at: a.consentAt,
      closed: a.closedAt,
    })
    .from(a)
    .innerJoin(r, eq(a.requestId, r.id))
    .where(
      pg
        ? eq(a.pgId, actor.workspaceId)
        : and(eq(r.buyerId, actor.workspaceId), eq(r.creator, actor.userId)),
    )
    .orderBy(desc(a.consentAt));
}
export async function issuedMail(tx: Tx, id: string) {
  return (
    await tx
      .select({ status: outboxEntries.status, sentAt: outboxEntries.sentAt })
      .from(outboxEntries)
      .where(eq(outboxEntries.dedupeKey, 'instant:' + id + ':pg:issued'))
  )[0];
}
export async function instantSigning(tx: Tx, id: string) {
  return (
    await tx
      .select({ id: sc.id, status: sc.status })
      .from(sc)
      .where(eq(sc.instantAttemptId, id))
  )[0];
}
