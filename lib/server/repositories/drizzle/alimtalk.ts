import { and, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import {
  alimtalkOutbox,
  users,
  workspaces,
  workspaceMembers,
} from '@/lib/db/schema';
import { z } from 'zod';
import { ConsultationRepository } from './consultation';
import type { Tx } from '../types';
import type { BusinessAlimtalk } from '../../alimtalk/types';
import type { NotifyRecipient } from '../../notifications/notify';
export class DrizzleAlimtalkRepository {
  constructor(private readonly db: Tx) {}
  async preference(userId: string) {
    const [row] = await this.db
      .select({ enabled: users.businessAlimtalkEnabled, phone: users.phone })
      .from(users)
      .where(eq(users.id, userId));
    return row;
  }
  async setPreference(userId: string, enabled: boolean) {
    const rows = await this.db
      .update(users)
      .set({ businessAlimtalkEnabled: enabled })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return rows.length === 1;
  }
  async assignmentPreference(workspaceId:string,userId:string) {
    const [row]=await this.db.select({at:workspaceMembers.assignmentAlimtalkConsentAt}).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId,workspaceId),eq(workspaceMembers.userId,userId)));
    return !!row?.at;
  }
  async setAssignmentPreference(workspaceId:string,userId:string,enabled:boolean) {
    const changed=await this.db.update(workspaceMembers).set({assignmentAlimtalkConsentAt:enabled?new Date():null})
      .where(and(eq(workspaceMembers.workspaceId,workspaceId),eq(workspaceMembers.userId,userId),eq(workspaceMembers.approvalStatus,'approved'),
        sql`exists(select 1 from workspaces w join users u on u.id=${userId} where w.id=${workspaceId} and w.type='pg' and w.status='active' and u.status='active' and u.deleted_at is null and u.email_verified)`)).returning({userId:workspaceMembers.userId});
    return changed.length===1;
  }
  async eligible(recipients: NotifyRecipient[], tx: Tx = this.db, assignmentKey?:string) {
    if (!recipients.length) return [];
    if (assignmentKey !== undefined) {
      let identity: unknown;
      try { identity=JSON.parse(assignmentKey); } catch { return []; }
      const parsed=z.tuple([z.string().uuid(),z.number().int(),z.literal('rep'),z.literal('assigned')]).safeParse(identity);
      if (!parsed.success) return [];
      const [reviewId,revision]=parsed.data;
      const repo=new ConsultationRepository(tx);
      const c=await repo.case(reviewId,tx);
      if (!c || c.rfp.status!=='sent' || !['requested','reviewing','quoted'].includes(c.review.status)
        || c.assignment.revision!==revision || !(await repo.policy(c.review.pgWorkspaceId,tx))?.alimtalkReady) return [];
      recipients=recipients.filter(r=>r.userId===c.assignment.assignee && r.workspaceId===c.review.pgWorkspaceId);
      if (!recipients.length) return [];
    }
    const rows = await tx
      .select({
        userId: users.id,
        workspaceId: workspaces.id,
        phone: users.phone,
      })
      .from(users)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          inArray(
            users.id,
            recipients.map((r) => r.userId),
          ),
          eq(users.status, 'active'),
          eq(users.emailVerified, true),
          isNull(users.deletedAt),
          assignmentKey === undefined ? eq(users.businessAlimtalkEnabled,true) : isNotNull(workspaceMembers.assignmentAlimtalkConsentAt),
          eq(workspaces.status, 'active'),
          // A PG member explicitly opts in for this workspace. Other templates keep the buyer preference.
          eq(workspaces.type, assignmentKey === undefined ? 'buyer' : 'pg'),
          eq(workspaceMembers.approvalStatus, 'approved'),
        ),
      );
    return rows
      .map((r) => ({ ...r, phone: r.phone?.replace(/[\s-]/g, '') ?? null }))
      .filter(
        (r) =>
          r.phone &&
          /^010\d{8}$/.test(r.phone) &&
          recipients.some(
            (input) =>
              input.userId === r.userId && input.workspaceId === r.workspaceId,
          ),
      );
  }
  async enqueue(
    recipients: NotifyRecipient[],
    input: BusinessAlimtalk,
    tx: Tx,
  ) {
    const eligible = await this.eligible(recipients, tx, input.template === 'pgAssignment' ? input.eventKey : undefined);
    if (!eligible.length) return;
    await tx
      .insert(alimtalkOutbox)
      .values(
        eligible.map((r) => ({
          userId: r.userId,
          workspaceId: r.workspaceId,
          phone: r.phone!,
          template: input.template,
          rfpCode: input.rfpCode,
          // Kakao variables are short; workspace names are user input.
          assignment: input.assignment ?? null,
          senderName: input.senderName?.replace(/\s+/g, ' ').trim().slice(0, 30) ?? null,
          linkUrl:
            typeof input.linkUrl === 'function'
              ? input.linkUrl(
                  recipients.find(
                    (i) =>
                      i.userId === r.userId && i.workspaceId === r.workspaceId,
                  )!,
                )
              : input.linkUrl,
          dedupeKey: JSON.stringify([
            input.template,
            input.eventKey,
            r.workspaceId,
            r.userId,
          ]),
        })),
      )
      .onConflictDoNothing();
  }

  async claim(limit = 10): Promise<(typeof alimtalkOutbox.$inferSelect)[]> {
    return this.db.transaction(async (tx: Tx) => {
      await tx
        .update(alimtalkOutbox)
        .set({ status: 'unknown', lastError: 'worker_interrupted' })
        .where(
          and(
            eq(alimtalkOutbox.status, 'sending'),
            lte(alimtalkOutbox.claimedAt, new Date(Date.now() - 5 * 60_000)),
          ),
        );
      const rows = await tx
        .select()
        .from(alimtalkOutbox)
        .where(
          and(
            eq(alimtalkOutbox.status, 'pending'),
            lte(alimtalkOutbox.scheduledAt, new Date()),
          ),
        )
        .orderBy(alimtalkOutbox.scheduledAt)
        .limit(limit)
        .for('update', { skipLocked: true });
      if (!rows.length) return [];
      return tx
        .update(alimtalkOutbox)
        .set({
          status: 'sending',
          claimedAt: new Date(),
          attempts: sql`${alimtalkOutbox.attempts} + 1`,
        })
        .where(
          inArray(
            alimtalkOutbox.id,
            rows.map((r) => r.id),
          ),
        )
        .returning();
    });
  }
  async canSend(row: typeof alimtalkOutbox.$inferSelect) {
    if (!row.claimedAt || row.claimedAt.getTime() <= Date.now() - 5 * 60_000)
      return false;
    const [claim] = await this.db
      .select({ id: alimtalkOutbox.id })
      .from(alimtalkOutbox)
      .where(
        and(
          eq(alimtalkOutbox.id, row.id),
          eq(alimtalkOutbox.status, 'sending'),
          eq(alimtalkOutbox.claimedAt, row.claimedAt),
        ),
      );
    if (!claim) return false;
    let assignmentKey: string | undefined;
    if (row.template==='pgAssignment') {
      try { assignmentKey=JSON.parse(row.dedupeKey)[1]; } catch { return false; }
      if (typeof assignmentKey!=='string') return false;
    }
    const current = await this.eligible([
      { userId: row.userId, workspaceId: row.workspaceId, email: '' },
    ], this.db, assignmentKey);
    return current.some((r) => r.phone === row.phone);
  }
  async finish(
    id: string,
    result: {
      status: 'accepted' | 'unknown' | 'failed' | 'skipped' | 'pending';
      messageId?: string;
      lastError?: string;
      scheduledAt?: Date;
    },
  ) {
    await this.db
      .update(alimtalkOutbox)
      .set(result)
      .where(
        and(eq(alimtalkOutbox.id, id), eq(alimtalkOutbox.status, 'sending')),
      );
  }
}
