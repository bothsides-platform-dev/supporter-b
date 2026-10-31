import { and, eq, isNull } from 'drizzle-orm';
import { bidDrafts } from '@/lib/db/schema';
import type { Tx } from '../types';
import type { BidDraftScope, SavedBidDraft } from '@/lib/quote/draft-schema';
import type { BidDraft } from '@/lib/quote/bid-draft';

const whereScope = (s: BidDraftScope) =>
  and(
    eq(bidDrafts.userId, s.userId),
    eq(bidDrafts.workspaceId, s.workspaceId),
    eq(bidDrafts.rfpId, s.rfpId),
    eq(bidDrafts.roundKey, s.roundKey),
  );
const project = (r: typeof bidDrafts.$inferSelect): SavedBidDraft => ({
  id: r.id,
  revision: r.revision,
  content: r.content,
  submittedBidId: r.submittedBidId,
  updatedAt: r.updatedAt.toISOString(),
});

export class DrizzleBidDraftRepository {
  constructor(private readonly db: Tx) {}
  async find(
    scope: BidDraftScope,
    tx: Tx = this.db,
    lock = false,
  ): Promise<SavedBidDraft | undefined> {
    const query = tx.select().from(bidDrafts).where(whereScope(scope));
    const [row] = await (lock ? query.for('update') : query);
    return row ? project(row) : undefined;
  }
  async save(scope: BidDraftScope, content: BidDraft, expectedRevision: number, tx: Tx = this.db) {
    const rows =
      expectedRevision === 0
        ? await tx
            .insert(bidDrafts)
            .values({ ...scope, content })
            .onConflictDoNothing()
            .returning()
        : await tx
            .update(bidDrafts)
            .set({
              content,
              revision: expectedRevision + 1,
              updatedAt: new Date(),
            })
            .where(
              and(
                whereScope(scope),
                eq(bidDrafts.revision, expectedRevision),
                isNull(bidDrafts.submittedBidId),
              ),
            )
            .returning();
    return rows[0] ? project(rows[0]) : undefined;
  }
  async remove(scope: BidDraftScope, revision: number, tx: Tx = this.db) {
    return (
      (
        await tx
          .delete(bidDrafts)
          .where(
            and(
              whereScope(scope),
              eq(bidDrafts.revision, revision),
              isNull(bidDrafts.submittedBidId),
            ),
          )
          .returning({ id: bidDrafts.id })
      ).length === 1
    );
  }
  async consume(scope: BidDraftScope, revision: number, bidId: string, tx: Tx) {
    return (
      (
        await tx
          .update(bidDrafts)
          .set({ submittedBidId: bidId, updatedAt: new Date() })
          .where(
            and(
              whereScope(scope),
              eq(bidDrafts.revision, revision),
              isNull(bidDrafts.submittedBidId),
            ),
          )
          .returning({ id: bidDrafts.id })
      ).length === 1
    );
  }
  async list(scope: BidDraftScope) {
    const rows = await this.db
      .select()
      .from(bidDrafts)
      .where(
        and(
          eq(bidDrafts.userId, scope.userId),
          eq(bidDrafts.workspaceId, scope.workspaceId),
          eq(bidDrafts.rfpId, scope.rfpId),
          isNull(bidDrafts.submittedBidId),
        ),
      );
    return rows.map((row) => ({ ...project(row), roundKey: row.roundKey }));
  }
  async listRfpIds(userId: string, workspaceId: string) {
    const rows = await this.db
      .select({ rfpId: bidDrafts.rfpId })
      .from(bidDrafts)
      .where(
        and(
          eq(bidDrafts.userId, userId),
          eq(bidDrafts.workspaceId, workspaceId),
          isNull(bidDrafts.submittedBidId),
        ),
      );
    return rows.map((r) => r.rfpId);
  }
}
