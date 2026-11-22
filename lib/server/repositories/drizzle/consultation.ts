import { and, asc, desc, eq, inArray, isNull, lte, or, sql, gt } from 'drizzle-orm';
import {
  pgAssignmentPolicies as policies,
  consultationCases as cases,
  consultationQuestions as questions,
  consultationEvidence as evidence,
  consultationEvents as events,
  consultationProgress as progress,
  consultationCorrections as corrections,
  rfpPgReviews as reviews,
  rfps,
  users,
  workspaces,
  workspaceMembers as members,
  chatMessages,
} from '@/lib/db/schema';
import type { Tx } from '../types';
export type AssignmentPolicy = typeof policies.$inferSelect;
export type ContactQuestion = typeof questions.$inferSelect;

export class ConsultationRepository {
  constructor(private readonly db: Tx) {}
  async enabled(ids: string[], tx: Tx = this.db) {
    if (!ids.length) return [];
    return (
      await tx
        .select({ id: policies.pgId })
        .from(policies)
        .where(and(eq(policies.enabled, true), inArray(policies.pgId, ids)))
    ).map((row) => row.id);
  }
  async policy(pgId: string, tx: Tx = this.db) {
    return (await tx.select().from(policies).where(eq(policies.pgId, pgId)))[0] as
      | AssignmentPolicy
      | undefined;
  }
  async recipients(workspaceId: string, type: 'buyer' | 'pg', tx: Tx = this.db) {
    return tx
      .select({
        workspaceId: members.workspaceId,
        userId: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: members.role,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .innerJoin(workspaces, eq(workspaces.id, members.workspaceId))
      .where(
        and(
          eq(members.workspaceId, workspaceId),
          eq(members.approvalStatus, 'approved'),
          eq(workspaces.type, type),
          eq(workspaces.status, 'active'),
          eq(users.status, 'active'),
          isNull(users.deletedAt),
          eq(users.emailVerified, true),
        ),
      );
  }
  async case(reviewId: string, tx: Tx = this.db) {
    const [row] = await tx
      .select({
        assignment: cases,
        review: reviews,
        rfp: {
          id: rfps.id,
          code: rfps.code,
          title: rfps.title,
          creator: rfps.createdBy,
          buyer: rfps.buyerWsId,
          status: rfps.status,
          terms: rfps.currentTerms,
          deadline: rfps.deadline,
        },
      })
      .from(cases)
      .innerJoin(reviews, eq(cases.reviewId, reviews.id))
      .innerJoin(rfps, eq(reviews.rfpId, rfps.id))
      .where(eq(cases.reviewId, reviewId));
    return row;
  }
  async forPg(rfpId: string, pgId: string, tx: Tx = this.db) {
    const [row] = await tx
      .select({ id: cases.reviewId })
      .from(cases)
      .innerJoin(reviews, eq(reviews.id, cases.reviewId))
      .where(and(eq(reviews.rfpId, rfpId), eq(reviews.pgWorkspaceId, pgId)));
    return row?.id;
  }
  async buyerContact(reviewId: string, actor: { workspaceId: string; userId: string }) {
    const c = await this.case(reviewId);
    if (
      !c ||
      c.rfp.status !== 'sent' ||
      !['requested', 'reviewing', 'quoted'].includes(c.review.status) ||
      c.review.pgWorkspaceId !== actor.workspaceId ||
      c.assignment.assignee !== actor.userId
    )
      return;
    if (!(await this.recipients(actor.workspaceId, 'pg')).some((m) => m.userId === actor.userId))
      return;
    return (await this.recipients(c.rfp.buyer, 'buyer')).find((m) => m.userId === c.rfp.creator);
  }
  async progress(reviewId: string, tx: Tx = this.db) {
    const [row] = await tx.select().from(progress).where(eq(progress.reviewId, reviewId));
    return row;
  }
  async start(row: typeof cases.$inferInsert, tx: Tx) {
    await tx.insert(cases).values(row);
  }
  async notified(reviewId: string, revision: number, tx: Tx) {
    await tx
      .update(cases)
      .set({ notifiedRevision: revision })
      .where(and(eq(cases.reviewId, reviewId), eq(cases.revision, revision)));
  }
  async event(reviewId: string, key: string, detail: string, tx: Tx) {
    return (
      (
        await tx
          .insert(events)
          .values({ reviewId, key, detail })
          .onConflictDoNothing()
          .returning({ key: events.key })
      ).length > 0
    );
  }
  async latest(reviewId: string, tx: Tx = this.db): Promise<ContactQuestion | undefined> {
    return (
      await tx
        .select()
        .from(questions)
        .where(eq(questions.reviewId, reviewId))
        .orderBy(desc(questions.reportedAt), desc(questions.id))
        .limit(1)
    )[0];
  }
  async question(id: string, tx: Tx = this.db): Promise<ContactQuestion | undefined> {
    return (await tx.select().from(questions).where(eq(questions.id, id)))[0];
  }
  async ask(row: typeof questions.$inferInsert, tx: Tx) {
    return (await tx.insert(questions).values(row).returning())[0];
  }
  async updateQuestion(id: string, values: Partial<typeof questions.$inferInsert>, tx: Tx) {
    await tx.update(questions).set(values).where(eq(questions.id, id));
  }
  async observe(questionId: string, key: string, userId: string, at: Date, tx: Tx) {
    await tx.insert(evidence).values({ questionId, key, userId, observedAt: at }).onConflictDoNothing();
  }
  async previousMessage(conversationId: string, id: string, at: Date, tx: Tx) {
    return (
      await tx
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, conversationId),
            lte(chatMessages.createdAt, at),
            sql`${chatMessages.id} <> ${id}`,
          ),
        )
        .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
        .limit(1)
    )[0];
  }
  async threadContacts(conversationId: string, through: Date, tx: Tx = this.db) {
    return tx
      .select({
        rfpId: reviews.rfpId,
        pgId: reviews.pgWorkspaceId,
        questionId: questions.id,
        reviewId: reviews.id,
        messageId: chatMessages.id,
      })
      .from(questions)
      .innerJoin(chatMessages, eq(chatMessages.id, questions.messageId))
      .innerJoin(reviews, eq(reviews.id, questions.reviewId))
      .where(
        and(
          eq(chatMessages.conversationId, conversationId),
          lte(chatMessages.createdAt, through),
          inArray(reviews.status, ['requested', 'reviewing', 'quoted']),
        ),
      )
      .orderBy(asc(reviews.rfpId), desc(questions.reportedAt));
  }
  async messageIdentities(messageIds: string[], tx: Tx = this.db) {
    if (!messageIds.length)
      return new Map<string, { name: string; showName: boolean; selected: boolean }>();
    const rows = await tx
      .select({
        id: questions.messageId,
        name: workspaces.name,
        showName: sql<boolean>`exists(select 1 from bids b where b.rfp_id=${rfps.id} and b.pg_ws_id=${reviews.pgWorkspaceId} and b.submitted_by=${questions.reportedBy} and b.status in ('submitted','withdrawn'))`,
        selected: sql<boolean>`exists(select 1 from bids b where b.id=${rfps.awardedBidId} and b.submitted_by=${questions.reportedBy} and b.pg_ws_id=${reviews.pgWorkspaceId})`,
      })
      .from(questions)
      .innerJoin(reviews, eq(reviews.id, questions.reviewId))
      .innerJoin(rfps, eq(rfps.id, reviews.rfpId))
      .innerJoin(workspaces, eq(workspaces.id, reviews.pgWorkspaceId))
      .where(inArray(questions.messageId, messageIds));
    return new Map(rows.map((row) => [row.id!, row]));
  }
  async recordQuote(reviewId: string, tx: Tx) {
    await tx
      .update(cases)
      .set({ quotedAt: sql`clock_timestamp()` })
      .where(and(eq(cases.reviewId, reviewId), isNull(cases.quotedAt)));
  }
  async extend(reviewId: string, deadline: Date, tx: Tx) {
    await tx
      .update(cases)
      .set({
        quoteDue: deadline,
        lateQuoteDue: sql`coalesce(${cases.lateQuoteDue},
      case when ${cases.quotedAt} is null and ${cases.quoteDue} <= now() then ${cases.quoteDue} end)`,
      })
      .where(eq(cases.reviewId, reviewId));
  }
  async pendingCases(after?: string) {
    // Keyset pagination also reaches late disputes on already closed reviews.
    return this.db
      .select({ id: cases.reviewId, rfpId: reviews.rfpId })
      .from(cases)
      .innerJoin(reviews, eq(reviews.id, cases.reviewId))
      .innerJoin(rfps, eq(rfps.id, reviews.rfpId))
      .where(
        and(
          after ? gt(cases.reviewId, after) : undefined,
          or(
            and(eq(rfps.status, 'sent'), inArray(reviews.status, ['requested', 'reviewing', 'quoted'])),
            sql`exists(select 1 from pg_consultation_progress p where p.review_id=${cases.reviewId}
            and ((p.contact_late and not exists(select 1 from pg_consultation_events e where e.review_id=p.review_id and e.key='late-contact'))
              or (p.quote_late and not exists(select 1 from pg_consultation_events e where e.review_id=p.review_id and e.key='late-quote'))))`,
          ),
        ),
      )
      .orderBy(asc(cases.reviewId))
      .limit(100);
  }
  async correction(id: string, tx: Tx = this.db) {
    return (await tx.select().from(corrections).where(eq(corrections.id, id)))[0];
  }
}
export type ConsultationCase = NonNullable<Awaited<ReturnType<ConsultationRepository['case']>>>;
