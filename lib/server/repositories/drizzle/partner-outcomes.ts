import { and, asc, eq, sql } from "drizzle-orm";
import {
  adminAuditLogs,
  agentConnections,
  agentEvents,
  agentRequests,
  bids,
  contracts,
  partnerOutcomeEntries,
  rfps,
  workspaces,
} from "@/lib/db/schema";
import type { PartnerOutcomeKind } from "@/lib/agent/partner-outcomes";
import type { Tx } from "../types";

export type PartnerOutcomeEntry = typeof partnerOutcomeEntries.$inferSelect;

/** Internal ledger access. Callers must use the service's transaction boundary. */
export class DrizzlePartnerOutcomeRepository {
  constructor(readonly tx: Tx) {}

  async command(commandId: string) {
    return (
      await this.tx
        .select()
        .from(partnerOutcomeEntries)
        .where(eq(partnerOutcomeEntries.commandId, commandId))
        .limit(1)
    )[0];
  }

  async reference(
    providerWorkspaceId: string,
    kind: PartnerOutcomeKind,
    reference: string,
  ) {
    return (
      await this.tx
        .select()
        .from(partnerOutcomeEntries)
        .where(
          and(
            eq(partnerOutcomeEntries.providerWorkspaceId, providerWorkspaceId),
            eq(partnerOutcomeEntries.kind, kind),
            eq(partnerOutcomeEntries.reference, reference),
          ),
        )
        .limit(1)
    )[0];
  }

  // Deliberately no active-token, grant-expiry, or membership predicate: a sent
  // business request remains a business fact after its OAuth grant is revoked.
  async request(requestId: string) {
    return (
      await this.tx
        .select({
          id: agentRequests.id,
          connectionId: agentRequests.connectionId,
          rfpCode: agentRequests.rfpCode,
          submittedAt: agentRequests.submittedAt,
          createdAt: agentRequests.createdAt,
          buyerWorkspaceId: agentConnections.workspaceId,
        })
        .from(agentRequests)
        .innerJoin(
          agentConnections,
          eq(agentConnections.id, agentRequests.connectionId),
        )
        .where(eq(agentRequests.id, requestId))
        .limit(1)
    )[0];
  }

  async rfp(code: string, lock = false) {
    const query = this.tx
      .select({
        id: rfps.id,
        buyerWorkspaceId: rfps.buyerWsId,
        awardedBidId: rfps.awardedBidId,
        status: rfps.status,
      })
      .from(rfps)
      .where(eq(rfps.code, code));
    return (await (lock ? query.for("update") : query))[0];
  }

  async award(rfpId: string) {
    return (
      await this.tx
        .select({
          bidId: contracts.bidId,
          bidRfpId: bids.rfpId,
          providerWorkspaceId: bids.pgWsId,
          providerType: workspaces.type,
        })
        .from(contracts)
        .innerJoin(bids, eq(bids.id, contracts.bidId))
        .innerJoin(workspaces, eq(workspaces.id, bids.pgWsId))
        .where(eq(contracts.rfpId, rfpId))
        .limit(1)
    )[0];
  }

  async requestEnvironment(requestId: string, connectionId: string) {
    return (
      await this.tx
        .select({ environment: agentEvents.environment })
        .from(agentEvents)
        .where(
          and(
            eq(agentEvents.requestId, requestId),
            eq(agentEvents.connectionId, connectionId),
            eq(agentEvents.event, "draft_created"),
          ),
        )
        .orderBy(asc(agentEvents.createdAt), asc(agentEvents.id))
        .limit(1)
    )[0]?.environment;
  }

  async entries(rfpId: string) {
    return this.tx
      .select()
      .from(partnerOutcomeEntries)
      .where(eq(partnerOutcomeEntries.rfpId, rfpId))
      .orderBy(
        asc(partnerOutcomeEntries.recordedAt),
        asc(partnerOutcomeEntries.id),
      );
  }

  async requestEntries(requestId: string) {
    return this.tx
      .select()
      .from(partnerOutcomeEntries)
      .where(eq(partnerOutcomeEntries.requestId, requestId))
      .orderBy(
        asc(partnerOutcomeEntries.recordedAt),
        asc(partnerOutcomeEntries.id),
      );
  }

  async recordingTime(): Promise<Date> {
    // now() is the transaction start, which can precede a dependency committed
    // while this transaction waits for its RFP lock. Use the database wall clock
    // after validation, independently of the operator machine's clock.
    const result = await this.tx.execute(
      sql`SELECT clock_timestamp() AS recorded_at`,
    );
    const rows = Array.isArray(result) ? result : result.rows;
    const value = rows[0].recorded_at;
    return value instanceof Date ? value : new Date(String(value));
  }

  async append(entry: PartnerOutcomeEntry) {
    return (
      await this.tx.insert(partnerOutcomeEntries).values(entry).returning()
    )[0];
  }

  async audit(entry: PartnerOutcomeEntry) {
    await this.tx.insert(adminAuditLogs).values({
      actor: entry.recordedBy,
      action: `partner_outcome.${entry.kind}`,
      entityType: "partner_outcome",
      entityId: entry.id,
      payloadJson: {
        after: {
          channel: "operator_cli",
          commandId: entry.commandId,
          inputHash: entry.inputHash,
          requestId: entry.requestId,
          rfpId: entry.rfpId,
          providerWorkspaceId: entry.providerWorkspaceId,
          kind: entry.kind,
          relatedEntryId: entry.relatedEntryId,
          environment: entry.environment,
        },
      },
      occurredAt: entry.recordedAt,
    });
  }
}
