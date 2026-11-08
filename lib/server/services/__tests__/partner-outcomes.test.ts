import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PgliteDB } from "@/lib/db/client-pglite";
import {
  agentClients, agentConnections, agentEvents, agentRequests, bids, contracts,
  partnerOutcomeEntries, rfpInvitations, rfps, users,
} from "@/lib/db/schema";
import type { PartnerOutcomeKind, PartnerOutcomeOperator } from "@/lib/agent/partner-outcomes";
import { setupServerTestEnv, teardownServerTestEnv } from "@/lib/server/__tests__/_harness";
import { seedBuyerWorkspace, seedMembership, seedPgWorkspace, seedRfp, seedUser } from "@/lib/server/repositories/drizzle/__tests__/_seed";
import { DrizzlePartnerOutcomeRepository } from "@/lib/server/repositories/drizzle/partner-outcomes";
import { inspectPartnerOutcomes, previewPartnerOutcome, readPartnerOutcomeStatus, recordPartnerOutcome } from "../partner-outcomes";
import { readAgentRequest } from "../agent-request";
import type { AgentPrincipal } from "../agent-account";
import { partnerOutcomeReport } from "@/lib/server/repositories/drizzle/partner-outcome-report";

let db: PgliteDB;
let requestId: string;
let connectionId: string;
let rfpId: string;
let pgId: string;
let buyerId: string;
let bidId: string;
let principal: AgentPrincipal;
const operator: PartnerOutcomeOperator = { channel: "operator_cli", label: "reviewer@example.test" };
const submittedAt = new Date("2026-11-01T12:00:00Z");

beforeEach(async () => {
  vi.stubEnv("AGENT_ANALYTICS_ENVIRONMENT", "production");
  vi.stubEnv("AGENT_ANALYTICS_ENABLED", "false");
  db = await setupServerTestEnv();
  const user = await seedUser(db);
  const buyer = await seedBuyerWorkspace(db);
  const provider = await seedPgWorkspace(db, "Selected provider");
  buyerId = buyer.id; pgId = provider.id;
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
  await seedMembership(db, buyer.id, user.id);
  const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: user.id });
  rfpId = rfp.id;
  const invitationId = randomUUID();
  await db.insert(rfpInvitations).values({ id: invitationId, rfpId, pgWsId: pgId, tokenHash: randomUUID(), expiresAt: new Date("2030-01-01Z") });
  bidId = randomUUID();
  await db.insert(bids).values({ id: bidId, rfpId, pgWsId: pgId, invitationId, settleCycle: "D+1", submittedBy: user.id });
  await db.update(rfps).set({ status: "awarded", awardedBidId: bidId, sentAt: submittedAt }).where(eq(rfps.id, rfpId));
  await db.insert(contracts).values({ rfpId, bidId, awardedBy: user.id, awardedAt: new Date("2026-11-01T18:00:00Z") });
  const clientId = randomUUID();
  connectionId = randomUUID(); requestId = randomUUID();
  await db.insert(agentClients).values({ id: clientId, name: "Test client", redirectUris: ["http://localhost/callback"], expiresAt: new Date("2030-01-01Z") });
  await db.insert(agentConnections).values({ id: connectionId, clientId, userId: user.id, workspaceId: buyer.id, sessionVersion: 0, scopes: ["requests:read"], expiresAt: new Date("2030-01-01Z") });
  await db.insert(agentRequests).values({
    id: requestId, connectionId, requestKey: randomUUID(), rfpCode: rfp.code,
    submittedAt, createdAt: new Date("2026-11-01T00:00:00Z"),
    content: { title: "PG introduction", contractType: "new", allowedPgWorkspaceIds: [pgId], requiredPaymentMethods: ["card"], customPaymentMethods: [], deadline: "2026-11-02T00:00:00Z", websiteUrl: "https://example.com", mainProducts: "Clothing", deliveryServicePeriod: "D+3" },
  });
  await db.insert(agentEvents).values([
    { id: randomUUID(), connectionId, requestId, event: "draft_created", environment: "staging", createdAt: new Date("2026-11-01T00:00:00Z") },
    { id: randomUUID(), connectionId, requestId, event: "request_submitted", environment: "staging", createdAt: submittedAt },
  ]);
  const [connection] = await db.select().from(agentConnections).where(eq(agentConnections.id, connectionId));
  principal = { connection, scopes: ["requests:read"], workspaceName: "Buyer", tokenHash: "not-an-access-token" };
});
afterEach(() => { teardownServerTestEnv(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function command(kind: PartnerOutcomeKind, extra: Record<string, unknown> = {}) {
  return {
    kind, commandId: randomUUID(), requestId, providerWorkspaceId: pgId,
    reference: randomUUID(), evidenceReference: "internal/evidence-1", source: "operator_evidence",
    occurredAt: "2026-11-02T00:00:00Z", ...extra,
  };
}
async function confirmContract() {
  return recordPartnerOutcome(command("provider_contract_confirmed"), operator);
}
function commission(extra: Record<string, unknown> = {}) {
  return command("commission_confirmed", {
    amount: "0.3", currency: "KRW", agreementReference: "partner/agreement-1", calculationReference: "commission/calculation-1",
    occurredAt: "2026-11-03T00:00:00Z", periodStart: "2026-11-01", periodEnd: "2026-11-02", ...extra,
  });
}
function payment(relatedEntryId: string, amount: string, extra: Record<string, unknown> = {}) {
  return command("commission_paid", { relatedEntryId, amount, currency: "KRW", occurredAt: "2026-11-04T00:00:00Z", ...extra });
}
function voidEntry(relatedEntryId: string) {
  return command("voided", { relatedEntryId, reason: "Corrected partner evidence", occurredAt: "2026-11-05T00:00:00Z" });
}

describe("partner outcome commands", () => {
  it("previews without writing and keeps the original request attribution environment", async () => {
    const input = command("provider_contract_confirmed");
    const preview = await previewPartnerOutcome(input, operator);
    expect(preview).toMatchObject({ execute: false, idempotent: false, entry: { environment: "staging", requestId, rfpId, providerWorkspaceId: pgId } });
    expect(await db.select().from(partnerOutcomeEntries)).toHaveLength(0);
    const recorded = await recordPartnerOutcome(input, operator);
    expect(recorded).toMatchObject({ idempotent: false, entry: { environment: "staging" } });
    expect(await db.select().from(partnerOutcomeEntries)).toHaveLength(1);
  });

  it("returns the original result on retry and rejects changed input or reused evidence references", async () => {
    const input = command("provider_contract_confirmed");
    const first = await recordPartnerOutcome(input, operator);
    expect(await recordPartnerOutcome(input, operator)).toMatchObject({ idempotent: true, entry: { id: first.entry.id } });
    await expect(recordPartnerOutcome({ ...input, evidenceReference: "changed-evidence" }, operator)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(recordPartnerOutcome({ ...input, commandId: randomUUID() }, operator)).rejects.toMatchObject({ code: "REFERENCE_CONFLICT" });
    expect(await db.select().from(partnerOutcomeEntries)).toHaveLength(1);
  });

  it("requires an actual submitted request, selected provider, and matching award record", async () => {
    await expect(recordPartnerOutcome(command("provider_contract_confirmed", { providerWorkspaceId: randomUUID() }), operator)).rejects.toMatchObject({ code: "PROVIDER_MISMATCH" });
    await db.update(agentRequests).set({ submittedAt: null }).where(eq(agentRequests.id, requestId));
    await expect(confirmContract()).rejects.toMatchObject({ code: "REQUEST_NOT_SUBMITTED" });
    await db.update(agentRequests).set({ submittedAt }).where(eq(agentRequests.id, requestId));
    await db.delete(contracts).where(eq(contracts.rfpId, rfpId));
    await expect(confirmContract()).rejects.toMatchObject({ code: "AWARD_NOT_CONFIRMED" });
    expect(await db.select().from(partnerOutcomeEntries)).toHaveLength(0);
  });

  it("does not trust draft PG selection or a request link belonging to another buyer", async () => {
    const otherPg = await seedPgWorkspace(db, "Other provider");
    await db.update(agentRequests).set({ content: { ...((await db.select().from(agentRequests))[0].content), allowedPgWorkspaceIds: [otherPg.id] } }).where(eq(agentRequests.id, requestId));
    await expect(recordPartnerOutcome(command("provider_contract_confirmed", { providerWorkspaceId: otherPg.id }), operator)).rejects.toMatchObject({ code: "PROVIDER_MISMATCH" });
    const otherBuyer = await seedBuyerWorkspace(db);
    await db.update(rfps).set({ buyerWsId: otherBuyer.id }).where(eq(rfps.id, rfpId));
    await expect(confirmContract()).rejects.toThrow();
  });

  it("does not treat the internal award contract as a provider service contract", async () => {
    await expect(recordPartnerOutcome(commission(), operator)).rejects.toMatchObject({ code: "CONTRACT_NOT_CONFIRMED" });
    const status = await readPartnerOutcomeStatus(requestId, rfpId);
    expect(status.providerContract.status).toBe("not_verified");
    await confirmContract();
    expect((await readPartnerOutcomeStatus(requestId, rfpId)).providerContract.status).toBe("confirmed");
  });

  it("rejects untrusted evidence sources, future dates, out-of-order facts, and malformed operators", async () => {
    await expect(recordPartnerOutcome(command("provider_contract_confirmed", { source: "customer_report" }), operator)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(recordPartnerOutcome(command("provider_contract_confirmed", { evidenceReference: "https://private.example/file?secret=key" }), operator)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(recordPartnerOutcome(command("provider_contract_confirmed", { occurredAt: "2099-01-01T00:00:00Z" }), operator)).rejects.toMatchObject({ code: "FUTURE_OCCURRENCE" });
    await expect(recordPartnerOutcome(command("provider_contract_confirmed", { occurredAt: "2026-10-01T00:00:00Z" }), operator)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(recordPartnerOutcome(command("provider_contract_confirmed"), { channel: "operator_cli", label: "" })).rejects.toMatchObject({ code: "INVALID_OPERATOR" });
  });

  it("rolls back the outcome when mandatory audit persistence fails", async () => {
    vi.spyOn(DrizzlePartnerOutcomeRepository.prototype, "audit").mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(confirmContract()).rejects.toThrow("audit unavailable");
    expect(await db.select().from(partnerOutcomeEntries)).toHaveLength(0);
  });

  it("allows an operator to confirm a business fact after OAuth expiry or revocation", async () => {
    await db.update(agentConnections).set({ revokedAt: new Date("2026-11-01T18:00:00Z"), expiresAt: new Date("2026-11-01T18:00:00Z") }).where(eq(agentConnections.id, connectionId));
    const recorded = await confirmContract();
    expect(recorded.entry.requestId).toBe(requestId);
    expect(recorded.entry.rfpId).toBe(rfpId);
  });
});

describe("commission amount and correction integrity", () => {
  it("keeps partial payments exact and prevents overpayment or currency mismatches", async () => {
    await confirmContract();
    const confirmed = await recordPartnerOutcome(commission(), operator);
    const first = await recordPartnerOutcome(payment(confirmed.entry.id, "0.1"), operator);
    const second = await recordPartnerOutcome(payment(confirmed.entry.id, "0.2"), operator);
    expect(first.entry.amount).toBe("0.1000");
    expect(second.entry.amount).toBe("0.2000");
    await expect(recordPartnerOutcome(payment(confirmed.entry.id, "0.0001"), operator)).rejects.toMatchObject({ code: "PAYMENT_EXCEEDS_CONFIRMED" });
    await expect(recordPartnerOutcome(payment(confirmed.entry.id, "0.1", { currency: "USD" }), operator)).rejects.toMatchObject({ code: "RELATED_ENTRY_INVALID" });
    const payments = (await db.select().from(partnerOutcomeEntries)).filter(row => row.kind === "commission_paid");
    expect(payments).toHaveLength(2);
    expect(confirmed.entry.amount).toBe("0.3000");
  });

  it("keeps large decimal strings exact and rejects malformed money and incomplete periods", async () => {
    await confirmContract();
    const recorded = await recordPartnerOutcome(commission({ amount: "9999999999999999.9999" }), operator);
    expect(recorded.entry.amount).toBe("9999999999999999.9999");
    for (const amount of [0.1, "1e5", "-1", "0.00001", "10000000000000000"]) {
      await expect(recordPartnerOutcome(commission({ amount }), operator)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    await expect(recordPartnerOutcome(commission({ periodEnd: undefined }), operator)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("preserves an append-only void chain and prevents voiding parents with active dependants", async () => {
    const contract = await confirmContract();
    const confirmed = await recordPartnerOutcome(commission(), operator);
    const paid = await recordPartnerOutcome(payment(confirmed.entry.id, "0.1"), operator);
    await expect(recordPartnerOutcome(voidEntry(confirmed.entry.id), operator)).rejects.toMatchObject({ code: "DEPENDENT_ENTRIES_EXIST" });
    await expect(recordPartnerOutcome(voidEntry(contract.entry.id), operator)).rejects.toMatchObject({ code: "DEPENDENT_ENTRIES_EXIST" });
    const correction = await recordPartnerOutcome(voidEntry(paid.entry.id), operator);
    await expect(recordPartnerOutcome(voidEntry(paid.entry.id), operator)).rejects.toMatchObject({ code: "RELATED_ENTRY_INVALID" });
    await expect(recordPartnerOutcome(voidEntry(correction.entry.id), operator)).rejects.toMatchObject({ code: "RELATED_ENTRY_INVALID" });
    await recordPartnerOutcome(voidEntry(confirmed.entry.id), operator);
    await recordPartnerOutcome(voidEntry(contract.entry.id), operator);
    const rows = await db.select().from(partnerOutcomeEntries);
    expect(rows).toHaveLength(6);
    expect(rows.filter(row => row.kind === "voided")).toHaveLength(3);
    expect(rows.find(row => row.id === paid.entry.id)?.amount).toBe("0.1000");
    expect((await readPartnerOutcomeStatus(requestId, rfpId)).providerContract.status).toBe("not_verified");
  });

  it("releases payment capacity after a void without rewriting the original payment", async () => {
    await confirmContract();
    const confirmed = await recordPartnerOutcome(commission(), operator);
    const paid = await recordPartnerOutcome(payment(confirmed.entry.id, "0.3"), operator);
    await recordPartnerOutcome(voidEntry(paid.entry.id), operator);
    const replacement = await recordPartnerOutcome(payment(confirmed.entry.id, "0.3", { occurredAt: "2026-11-06T00:00:00Z" }), operator);
    expect(replacement.entry.amount).toBe("0.3000");
    expect((await db.select().from(partnerOutcomeEntries)).filter(row => row.kind === "commission_paid")).toHaveLength(2);
  });
});

describe("customer projection and durable ledger", () => {
  it("separates sandbox/live integration evidence and excludes money, evidence and operator details", async () => {
    await confirmContract();
    await recordPartnerOutcome(command("integration_verified", { integrationEnvironment: "sandbox", source: "test_result", occurredAt: "2026-11-03T00:00:00Z" }), operator);
    await recordPartnerOutcome(commission(), operator);
    const status = await readPartnerOutcomeStatus(requestId, rfpId);
    expect(status.integration.sandbox.status).toBe("verified");
    expect(status.integration.live.status).toBe("not_verified");
    const projection = JSON.stringify(status);
    for (const excluded of ["amount", "currency", "commission", "evidenceReference", "recordedBy", "reviewer@example.test", "internal/evidence-1", "agreement-1", "calculation-1"]) expect(projection).not.toContain(excluded);
    const inspected = await inspectPartnerOutcomes(requestId);
    expect(inspected.entries).toHaveLength(3);
  });

  it("keeps customer-reported integration distinct until independently verified", async () => {
    await recordPartnerOutcome(command("integration_verified", { integrationEnvironment: "live", source: "customer_report", occurredAt: "2026-11-03T00:00:00Z" }), operator);
    expect((await readPartnerOutcomeStatus(requestId, rfpId)).integration.live.status).toBe("reported");
    await recordPartnerOutcome(command("integration_verified", { integrationEnvironment: "live", source: "partner_api", occurredAt: "2026-11-04T00:00:00Z" }), operator);
    expect((await readPartnerOutcomeStatus(requestId, rfpId)).integration.live.status).toBe("verified");
    expect((await readPartnerOutcomeStatus(requestId, rfpId)).integration.sandbox.status).toBe("not_verified");
  });

  it("checks request ownership before returning the provider contract projection through MCP service", async () => {
    await confirmContract();
    const own = await readAgentRequest(principal, requestId);
    expect(own.providerContractStatus).toBe("confirmed");
    const wrong = { ...principal, connection: { ...principal.connection, id: randomUUID() } };
    await expect(readAgentRequest(wrong, requestId)).rejects.toMatchObject({ code: "not_found" });
    expect(JSON.stringify(own)).not.toContain("reviewer@example.test");
    expect(JSON.stringify(own)).not.toContain("internal/evidence-1");
    expect((await readPartnerOutcomeStatus(requestId, randomUUID())).providerContract.status).toBe("not_verified");
  });

  it("retains financial evidence after grant deletion and prevents canonical RFP removal", async () => {
    await confirmContract();
    await recordPartnerOutcome(commission(), operator);
    await db.delete(agentConnections).where(eq(agentConnections.id, connectionId));
    expect(await db.select().from(agentRequests)).toHaveLength(0);
    const entries = await db.select().from(partnerOutcomeEntries);
    expect(entries).toHaveLength(2);
    expect(entries.every(row => row.requestId === null && row.rfpId === rfpId && row.environment === "staging")).toBe(true);
    await expect(db.delete(rfps).where(eq(rfps.id, rfpId))).rejects.toThrow();
    expect(await db.select().from(partnerOutcomeEntries)).toHaveLength(2);
    expect((await db.select().from(rfps))[0].buyerWsId).toBe(buyerId);
  });
});

describe("partner outcome aggregate reports", () => {
  const range = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-09T00:00:00Z"), environment: "staging" as const };

  it("records delayed work after acquiring the RFP lock, not at transaction start", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
    const findRfp = DrizzlePartnerOutcomeRepository.prototype.rfp;
    vi.spyOn(DrizzlePartnerOutcomeRepository.prototype, "rfp")
      .mockImplementationOnce(async function (this: DrizzlePartnerOutcomeRepository, code, lock) {
        const result = await findRfp.call(this, code, lock);
        // Stand in for the database work and row-lock wait before validation.
        vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
        return result;
      });
    const recorded = await confirmContract();
    expect(recorded.entry.recordedAt.toISOString()).toBe("2026-11-03T12:00:00.000Z");
    const beforeRecording = await partnerOutcomeReport(db, { ...range, to: new Date("2026-11-03T00:00:00Z") });
    expect(beforeRecording.outcomes.provider_contracts).toBe(0);
    expect((await partnerOutcomeReport(db, range)).outcomes.provider_contracts).toBe(1);
  });

  it("keeps exact decimal totals by currency and counts distinct business requests", async () => {
    await confirmContract();
    const krw = await recordPartnerOutcome(commission(), operator);
    await recordPartnerOutcome(payment(krw.entry.id, "0.1"), operator);
    await recordPartnerOutcome(payment(krw.entry.id, "0.2"), operator);
    const usd = await recordPartnerOutcome(commission({ amount: "1.2345", currency: "USD" }), operator);
    await recordPartnerOutcome(payment(usd.entry.id, "0.2345", { currency: "USD" }), operator);
    await recordPartnerOutcome(command("integration_verified", { integrationEnvironment: "sandbox", source: "test_result" }), operator);
    await recordPartnerOutcome(command("integration_verified", { integrationEnvironment: "live", source: "customer_report" }), operator);
    const report = await partnerOutcomeReport(db, range);
    expect(report.outcomes).toEqual({ provider_contracts: 1, live_integrations: 0, sandbox_integrations: 1, customer_integration_reports: 1, requests_with_commission: 1, requests_with_payment: 1 });
    expect(report.commissions).toEqual([
      { currency: "KRW", confirmed_amount: "0.3000", paid_amount: "0.3000", outstanding_amount: "0.0000", confirmed_entries: 1, payments: 2 },
      { currency: "USD", confirmed_amount: "1.2345", paid_amount: "0.2345", outstanding_amount: "1.0000", confirmed_entries: 1, payments: 1 },
    ]);
    const serialized = JSON.stringify(report);
    for (const secret of [requestId, connectionId, rfpId, pgId, operator.label, "internal/evidence-1"]) expect(serialized).not.toContain(secret);
  });

  it("uses the request cohort and recorded attribution environment, even after OAuth deletion", async () => {
    await confirmContract();
    await recordPartnerOutcome(commission({ amount: "123.4567" }), operator);
    expect((await partnerOutcomeReport(db, { ...range, environment: "production" })).outcomes.provider_contracts).toBe(0);
    expect((await partnerOutcomeReport(db, { ...range, from: new Date("2026-11-01T00:00:00.001Z") })).outcomes.provider_contracts).toBe(0);
    const before = await partnerOutcomeReport(db, range);
    await db.delete(agentConnections).where(eq(agentConnections.id, connectionId));
    expect(await partnerOutcomeReport(db, range)).toEqual(before);
    expect(before.commissions[0].confirmed_amount).toBe("123.4567");
  });

  it("bounds both occurrence and recording time so late evidence or correction cannot rewrite prior knowledge", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
    await confirmContract();
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
    const confirmed = await recordPartnerOutcome(commission(), operator);
    vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
    const paid = await recordPartnerOutcome(payment(confirmed.entry.id, "0.1"), operator);
    const earlyRange = { ...range, to: new Date("2026-11-05T00:00:00Z") };
    const before = await partnerOutcomeReport(db, earlyRange);
    expect(before.commissions[0].paid_amount).toBe("0.1000");

    vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
    await recordPartnerOutcome(payment(confirmed.entry.id, "0.2"), operator);
    expect(await partnerOutcomeReport(db, earlyRange)).toEqual(before);
    vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
    await recordPartnerOutcome({ ...voidEntry(paid.entry.id), occurredAt: "2026-11-04T18:00:00Z" }, operator);
    expect(await partnerOutcomeReport(db, earlyRange)).toEqual(before);
    expect((await partnerOutcomeReport(db, range)).commissions[0]).toMatchObject({ confirmed_amount: "0.3000", paid_amount: "0.2000", outstanding_amount: "0.1000", payments: 1 });
  });

  it("excludes facts at the exclusive report end boundary", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
    await confirmContract();
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
    await recordPartnerOutcome(commission(), operator);
    const boundary = await partnerOutcomeReport(db, { ...range, to: new Date("2026-11-03T00:00:00Z") });
    expect(boundary.outcomes.provider_contracts).toBe(1);
    expect(boundary.commissions).toEqual([]);
  });
});
