import { and, eq, isNull, asc, sql, inArray, desc } from "drizzle-orm";
import {
  guestRfpRequests as requests,
  guestRfpDrafts as drafts,
  users,
  workspaceMembers,
  workspaces,
} from "@/lib/db/schema";
import type { Tx } from "../types";
import type { Actor } from "../../services/types";
export type GuestRequestRow = typeof requests.$inferSelect;
export class DrizzleGuestRequestRepository {
  constructor(private readonly db: Tx) {}
  async recover(userId: string) {
    return this.db
      .select({
        id: drafts.id,
        revision: drafts.revision,
        workspaceId: drafts.workspaceId,
      })
      .from(drafts)
      .innerJoin(requests, eq(requests.draftId, drafts.id))
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.userId, drafts.userId),
          eq(workspaceMembers.workspaceId, drafts.workspaceId),
        ),
      )
      .where(
        and(
          eq(drafts.userId, userId),
          isNull(drafts.deletedAt),
          inArray(requests.status, [
            "waiting",
            "needs_action",
            "expired",
            "submitted",
          ]),
        ),
      )
      .orderBy(desc(requests.confirmedAt))
      .limit(20);
  }
  async workspaces(userId: string) {
    return this.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        verified: users.emailVerified,
        status: workspaces.status,
      })
      .from(users)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(users.id, userId),
          isNull(users.deletedAt),
          eq(workspaces.type, "buyer"),
        ),
      );
  }
  async find(id: string, tx: Tx = this.db) {
    return (
      await tx.select().from(requests).where(eq(requests.draftId, id))
    )[0];
  }
  async save(row: typeof requests.$inferInsert, tx: Tx) {
    await tx
      .insert(requests)
      .values(row)
      .onConflictDoUpdate({ target: requests.draftId, set: row });
  }
  async update(
    id: string,
    patch: Partial<typeof requests.$inferInsert>,
    tx: Tx,
  ) {
    await tx.update(requests).set(patch).where(eq(requests.draftId, id));
  }
  async member(actor: Actor, tx: Tx = this.db) {
    return (
      await tx
        .select({
          email: users.email,
          verified: users.emailVerified,
          status: workspaces.status,
        })
        .from(users)
        .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(
          and(
            eq(users.id, actor.userId),
            isNull(users.deletedAt),
            eq(workspaces.id, actor.workspaceId),
            eq(workspaces.type, "buyer"),
          ),
        )
    )[0];
  }
  async attempted(id: string, now: Date) {
    await this.db
      .update(requests)
      .set({ attemptedAt: now })
      .where(and(eq(requests.draftId, id), eq(requests.status, "waiting")));
  }
  async waitingForUser(userId: string) {
    return this.db
      .select({ id: requests.draftId })
      .from(requests)
      .innerJoin(drafts, eq(drafts.id, requests.draftId))
      .where(and(eq(drafts.userId, userId), eq(requests.status, "waiting")))
      .limit(50);
  }
  async pending(limit = 50) {
    return this.db
      .select({ id: requests.draftId })
      .from(requests)
      .where(eq(requests.status, "waiting"))
      .orderBy(
        sql`${requests.attemptedAt} asc nulls first`,
        asc(requests.confirmedAt),
      )
      .limit(limit);
  }
  async owned(actor: Actor) {
    return this.db
      .select({ id: requests.draftId })
      .from(requests)
      .innerJoin(drafts, eq(drafts.id, requests.draftId))
      .where(
        and(
          eq(drafts.userId, actor.userId),
          eq(drafts.workspaceId, actor.workspaceId),
          isNull(drafts.deletedAt),
        ),
      );
  }
}
