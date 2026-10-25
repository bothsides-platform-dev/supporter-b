import {
  users,
  workspaces,
  workspaceMembers,
  attachments,
} from "@/lib/db/schema";
import { pgRecommendationGroups } from "@/lib/db/schema/pg-recommendations";
import { and, eq, isNull, lte, or, inArray, asc, sql, count, sum, notExists } from "drizzle-orm";
import {
  guestRfpRequests as requests,
  guestRfpDrafts as drafts,
  guestRfpFiles as files,
} from "@/lib/db/schema/guest-rfp";
import type { Tx } from "../types";
export type GuestDraftRow = typeof drafts.$inferSelect;
export type GuestFileRow = typeof files.$inferSelect;
export class DrizzleGuestDraftRepository {
  constructor(private readonly db: Tx) {}
  async assertEditable(id: string, tx: Tx) {
    const [request] = await tx.select().from(requests).where(eq(requests.draftId, id));
    if (request && ['unbound', 'waiting'].includes(request.status)) throw new Error('GUEST_REQUEST_FROZEN');
  }
  async endRequest(id: string, tx: Tx) {
    await tx.update(requests).set({ status: 'canceled' }).where(and(eq(requests.draftId, id), inArray(requests.status, ['unbound', 'waiting', 'needs_action', 'expired'])));
  }
  async bindRequest(id: string, now: Date, tx: Tx) {
    const bound = await tx.update(requests).set({ status: 'waiting', expiresAt: new Date(now.getTime() + 30 * 86400000) }).where(and(eq(requests.draftId, id), eq(requests.status, 'unbound'))).returning();
    if (bound.length) await this.update(id, { autoResumeConsumedAt: now }, tx);
  }
  async purgeTombstones(now: Date, limit: number) {
    const condition = and(
      isNull(drafts.userId), lte(drafts.deletedAt, new Date(now.getTime() - 7 * 86400000)),
      notExists(this.db.select({ id: files.id }).from(files).where(eq(files.draftId, drafts.id))),
    );
    await this.db.delete(drafts).where(and(condition, inArray(drafts.id,
      this.db.select({ id: drafts.id }).from(drafts).where(condition).limit(limit),
    )));
  }
  async cleanupCandidates(now: Date, limit: number, tx: Tx = this.db) {
    return tx
      .select({ id: drafts.id })
      .from(drafts)
      .where(
        and(
          isNull(drafts.userId),
          isNull(drafts.deletedAt),
          lte(drafts.expiresAt, now),
        ),
      )
      .limit(limit)
      .for("update");
  }
  async staleFiles(now: Date, limit: number, tx: Tx = this.db) {
    return tx
      .select()
      .from(files)
      .where(
        or(
          eq(files.status, "deleting"),
          and(
            eq(files.status, "pending"),
            lte(files.createdAt, new Date(now.getTime() - 3600000)),
          ),
        ),
      )
      .orderBy(asc(files.createdAt))
      .limit(limit);
  }
  async retireFile(file: GuestFileRow, tx: Tx = this.db) {
    if (file.attachmentId) {
      const removed = await tx
        .delete(attachments)
        .where(
          and(
            eq(attachments.id, file.attachmentId),
            isNull(attachments.rfpId),
            isNull(attachments.bidId),
            isNull(attachments.bidNoteId),
            isNull(attachments.chatMessageId),
            isNull(attachments.rfpTeamMessageId),
          ),
        )
        .returning();
      if (
        !removed.length &&
        (
          await tx
            .select({ id: attachments.id })
            .from(attachments)
            .where(eq(attachments.id, file.attachmentId))
        ).length
      )
        return false;
    }
    await this.updateFile(
      file.id,
      { status: "deleting", attachmentId: null },
      tx,
    );
    return true;
  }
  async removeRetired(id: string) {
    await this.db
      .delete(files)
      .where(and(eq(files.id, id), eq(files.status, "deleting")));
  }
  async activeBuyer(
    actor: { userId: string; workspaceId: string },
    tx: Tx = this.db,
  ) {
    return (
      (
        await tx
          .select({ id: users.id })
          .from(users)
          .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
          .innerJoin(
            workspaces,
            eq(workspaces.id, workspaceMembers.workspaceId),
          )
          .where(
            and(
              eq(users.id, actor.userId),
              eq(users.emailVerified, true),
              isNull(users.deletedAt),
              eq(workspaces.id, actor.workspaceId),
              eq(workspaces.type, "buyer"),
              eq(workspaces.status, "active"),
            ),
          )
      ).length > 0
    );
  }
  async updateFile(
    id: string,
    patch: Partial<typeof files.$inferInsert>,
    tx: Tx = this.db,
  ) {
    return (
      await tx.update(files).set(patch).where(eq(files.id, id)).returning()
    )[0];
  }
  async markFile(
    id: string,
    from: "pending" | "ready",
    to: "ready" | "deleting",
    tx: Tx = this.db,
  ) {
    return (
      (
        await tx
          .update(files)
          .set({ status: to })
          .where(and(eq(files.id, id), eq(files.status, from)))
          .returning()
      ).length > 0
    );
  }
  async handoff(file: GuestFileRow, userId: string, tx: Tx = this.db) {
    await tx
      .insert(attachments)
      .values({
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mime,
        uploadedBy: userId,
        status: "ready",
      })
      .onConflictDoNothing();
    const [attachment] = await tx
      .select()
      .from(attachments)
      .where(eq(attachments.id, file.id));
    if (
      !attachment ||
      attachment.uploadedBy !== userId ||
      attachment.status !== "ready"
    )
      throw new Error("GUEST_FILES_NOT_READY");
    await this.updateFile(file.id, { attachmentId: file.id }, tx);
  }
  async memberFiles(ids: string[], userId: string, tx: Tx = this.db) {
    const all = await tx
      .select({
        id: attachments.id,
        name: attachments.name,
        size: attachments.size,
      })
      .from(attachments)
      .where(
        and(
          eq(attachments.uploadedBy, userId),
          eq(attachments.status, "ready"),
          isNull(attachments.rfpId),
          isNull(attachments.bidId),
          isNull(attachments.bidNoteId),
          isNull(attachments.chatMessageId),
          isNull(attachments.rfpTeamMessageId),
          inArray(
            attachments.id,
            ids.length ? ids : ["00000000-0000-0000-0000-000000000000"],
          ),
        ),
      );
    return all.filter((file) => ids.includes(file.id));
  }
  async trackMemberFiles(draftId: string, ids: string[], tx: Tx) {
    if (!ids.length) return;
    const rows = await tx
      .select()
      .from(attachments)
      .where(inArray(attachments.id, ids));
    for (const file of rows)
      await tx
        .insert(files)
        .values({
          id: file.id,
          draftId,
          clientId: file.id,
          name: file.name,
          size: file.size,
          mime: file.mimeType,
          status: "ready",
          attachmentId: file.id,
        })
        .onConflictDoNothing();
  }
  async ownedByUser(userId: string, tx: Tx) {
    return tx
      .select()
      .from(drafts)
      .where(eq(drafts.userId, userId))
      .for("update");
  }
  async industryName(id: string, tx: Tx = this.db) {
    return (
      await tx
        .select({ name: pgRecommendationGroups.name })
        .from(pgRecommendationGroups)
        .where(eq(pgRecommendationGroups.id, id))
    )[0]?.name;
  }
  async lock(id: string, tx: Tx = this.db) {
    return (
      await tx.select().from(drafts).where(eq(drafts.id, id)).for("update")
    )[0];
  }
  async insert(value: typeof drafts.$inferInsert, tx: Tx = this.db) {
    await tx.execute(sql`select pg_advisory_xact_lock(72640201)`);
    // Retrying an existing UUID does not reserve another slot. Ownership is still
    // checked by the service, including for deleted or expired rows.
    const [existing] = await tx.select({ id: drafts.id }).from(drafts).where(eq(drafts.id, value.id));
    if (existing) return undefined;
    const [global] = await tx.select({ total: count() }).from(drafts).where(isNull(drafts.userId));
    const [proof] = await tx.select({ total: count() }).from(drafts).where(and(isNull(drafts.userId), eq(drafts.secretHash, value.secretHash)));
    if (global.total >= 1000 || proof.total >= 5) throw new Error('GUEST_DRAFT_LIMIT');
    return (
      await tx.insert(drafts).values(value).onConflictDoNothing().returning()
    )[0];
  }
  async update(
    id: string,
    patch: Partial<typeof drafts.$inferInsert>,
    tx: Tx = this.db,
  ) {
    return (
      await tx.update(drafts).set(patch).where(eq(drafts.id, id)).returning()
    )[0];
  }
  async files(id: string, tx: Tx = this.db) {
    return tx.select().from(files).where(eq(files.draftId, id));
  }
  async insertFile(value: typeof files.$inferInsert, tx: Tx = this.db) {
    await tx.execute(sql`select pg_advisory_xact_lock(72640202)`);
    const [reserved] = await tx.select({ bytes: sum(files.size) }).from(files)
      .innerJoin(drafts, eq(files.draftId, drafts.id))
      .where(or(isNull(drafts.userId), eq(files.status, "deleting")));
    if (Number(reserved.bytes ?? 0) + value.size > 1024 * 1024 * 1024) throw new Error('GUEST_FILE_LIMIT');
    return (await tx.insert(files).values(value).returning())[0];
  }
  async owned(userId: string, workspaceId: string, tx: Tx = this.db) {
    return tx
      .select()
      .from(drafts)
      .where(
        and(eq(drafts.userId, userId), eq(drafts.workspaceId, workspaceId)),
      );
  }
}
