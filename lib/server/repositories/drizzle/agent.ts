import { and, eq, isNull, gt, desc } from "drizzle-orm";
import {
  agentClients,
  agentConnections,
  agentCodes,
  agentTokens,
  agentRequests,
  agentEvents,
  users,
  workspaces,
  workspaceMembers,
} from "@/lib/db/schema";
import type { Tx } from "../types";

export type AgentConnection = typeof agentConnections.$inferSelect;
export type AgentRequestRow = typeof agentRequests.$inferSelect;

export class DrizzleAgentRepository {
  constructor(readonly tx: Tx) {}
  async client(id: string) {
    return (
      await this.tx
        .select()
        .from(agentClients)
        .where(
          and(eq(agentClients.id, id), gt(agentClients.expiresAt, new Date())),
        )
    )[0];
  }
  async addClient(row: typeof agentClients.$inferInsert) {
    await this.tx.insert(agentClients).values(row);
  }
  async member(userId: string, workspaceId: string) {
    return (
      await this.tx
        .select({
          userId: users.id,
          workspaceId: workspaces.id,
          name: workspaces.name,
          sessionVersion: users.sessionVersion,
        })
        .from(users)
        .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(
          and(
            eq(users.id, userId),
            eq(workspaces.id, workspaceId),
            isNull(users.deletedAt),
            eq(users.status, "active"),
            eq(users.emailVerified, true),
            eq(workspaces.type, "buyer"),
            eq(workspaces.status, "active"),
            eq(workspaceMembers.approvalStatus, "approved"),
          ),
        )
    )[0];
  }
  async connection(id: string, lock = false) {
    const q = this.tx
      .select()
      .from(agentConnections)
      .where(eq(agentConnections.id, id));
    return (await (lock ? q.for("update") : q))[0];
  }
  async connections(userId: string, workspaceId: string) {
    return this.tx
      .select({
        id: agentConnections.id,
        name: agentClients.name,
        scopes: agentConnections.scopes,
        expiresAt: agentConnections.expiresAt,
        revokedAt: agentConnections.revokedAt,
      })
      .from(agentConnections)
      .innerJoin(agentClients, eq(agentClients.id, agentConnections.clientId))
      .where(
        and(
          eq(agentConnections.userId, userId),
          eq(agentConnections.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(agentConnections.createdAt))
      .limit(100);
  }
  async addConnection(row: typeof agentConnections.$inferInsert) {
    await this.tx.insert(agentConnections).values(row);
  }
  async revokeConnection(id: string) {
    return (
      await this.tx
        .update(agentConnections)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(agentConnections.id, id), isNull(agentConnections.revokedAt)),
        )
        .returning()
    )[0];
  }
  async code(hash: string, lock = false) {
    const q = this.tx
      .select()
      .from(agentCodes)
      .where(eq(agentCodes.hash, hash));
    return (await (lock ? q.for("update") : q))[0];
  }
  async addCode(row: typeof agentCodes.$inferInsert) {
    await this.tx.insert(agentCodes).values(row);
  }
  async useCode(hash: string) {
    return (
      (
        await this.tx
          .update(agentCodes)
          .set({ usedAt: new Date() })
          .where(and(eq(agentCodes.hash, hash), isNull(agentCodes.usedAt)))
          .returning()
      ).length === 1
    );
  }
  async token(hash: string, kind: "access" | "refresh", lock = false) {
    const q = this.tx
      .select()
      .from(agentTokens)
      .where(
        eq(
          kind === "access" ? agentTokens.accessHash : agentTokens.refreshHash,
          hash,
        ),
      );
    return (await (lock ? q.for("update") : q))[0];
  }
  async addToken(row: typeof agentTokens.$inferInsert) {
    await this.tx.insert(agentTokens).values(row);
  }
  async useRefresh(hash: string) {
    return (
      (
        await this.tx
          .update(agentTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(agentTokens.refreshHash, hash),
              isNull(agentTokens.revokedAt),
            ),
          )
          .returning()
      ).length === 1
    );
  }
  async request(id: string, lock = false) {
    const q = this.tx
      .select()
      .from(agentRequests)
      .where(eq(agentRequests.id, id));
    return (await (lock ? q.for("update") : q))[0];
  }
  async requestByKey(key: string) {
    return (
      await this.tx
        .select()
        .from(agentRequests)
        .where(eq(agentRequests.requestKey, key))
    )[0];
  }
  async addRequest(row: typeof agentRequests.$inferInsert) {
    await this.tx.insert(agentRequests).values(row);
  }
  async updateRequest(
    id: string,
    patch: Partial<typeof agentRequests.$inferInsert>,
  ) {
    await this.tx
      .update(agentRequests)
      .set(patch)
      .where(eq(agentRequests.id, id));
  }
  async event(row: typeof agentEvents.$inferInsert) {
    await this.tx.insert(agentEvents).values(row);
  }
}
