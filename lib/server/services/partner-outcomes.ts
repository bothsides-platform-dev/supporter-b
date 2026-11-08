import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  amountUnits,
  operatorLabel,
  partnerOutcomeInput,
  PartnerOutcomeError,
  PARTNER_EVIDENCE_SOURCES,
  type PartnerOutcomeInput,
  type PartnerOutcomeOperator,
} from "@/lib/agent/partner-outcomes";
import { AGENT_ANALYTICS_ENVIRONMENTS } from "@/lib/analytics/agent-contract";
import {
  getDb,
  getPartnerOutcomeRepo,
} from "@/lib/server/repositories/factory";
import {
  DrizzlePartnerOutcomeRepository,
  type PartnerOutcomeEntry,
} from "@/lib/server/repositories/drizzle/partner-outcomes";
import type { Tx } from "@/lib/server/repositories/types";

function parse(input: unknown, operator: PartnerOutcomeOperator) {
  const actor = z
    .object({ channel: z.literal("operator_cli"), label: operatorLabel })
    .strict()
    .safeParse(operator);
  if (!actor.success) throw new PartnerOutcomeError("INVALID_OPERATOR");
  const parsed = partnerOutcomeInput.safeParse(input);
  if (!parsed.success) throw new PartnerOutcomeError("INVALID_INPUT");
  const data = {
    ...parsed.data,
    commandId: parsed.data.commandId.toLowerCase(),
    requestId: parsed.data.requestId.toLowerCase(),
    providerWorkspaceId: parsed.data.providerWorkspaceId.toLowerCase(),
    occurredAt: new Date(parsed.data.occurredAt).toISOString(),
    ...("relatedEntryId" in parsed.data
      ? { relatedEntryId: parsed.data.relatedEntryId.toLowerCase() }
      : {}),
  } as PartnerOutcomeInput;
  // The operator label is an audit annotation from the privileged CLI, not a
  // verified application user. Retrying under another operator never rewrites it.
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(data).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
  return {
    data,
    actor: actor.data,
    inputHash: createHash("sha256").update(canonical).digest("hex"),
  };
}

function retry(entry: PartnerOutcomeEntry, inputHash: string) {
  if (entry.inputHash !== inputHash)
    throw new PartnerOutcomeError("IDEMPOTENCY_CONFLICT");
  return { entry, idempotent: true };
}

function activeEntries(entries: PartnerOutcomeEntry[]) {
  const voided = new Set(
    entries
      .filter((entry) => entry.kind === "voided")
      .map((entry) => entry.relatedEntryId),
  );
  return entries.filter(
    (entry) => entry.kind !== "voided" && !voided.has(entry.id),
  );
}

async function submittedRequest(
  repo: DrizzlePartnerOutcomeRepository,
  requestId: string,
  lock: boolean,
) {
  const request = await repo.request(requestId);
  if (!request) throw new PartnerOutcomeError("REQUEST_NOT_FOUND");
  if (!request.rfpCode || !request.submittedAt)
    throw new PartnerOutcomeError("REQUEST_NOT_SUBMITTED");
  const rfp = await repo.rfp(request.rfpCode, lock);
  if (!rfp || rfp.buyerWorkspaceId !== request.buyerWorkspaceId)
    throw new PartnerOutcomeError("REQUEST_NOT_FOUND");
  const award = await repo.award(rfp.id);
  if (
    rfp.status !== "awarded" ||
    !rfp.awardedBidId ||
    !award ||
    award.bidId !== rfp.awardedBidId ||
    award.bidRfpId !== rfp.id ||
    award.providerType !== "pg"
  )
    throw new PartnerOutcomeError("AWARD_NOT_CONFIRMED");
  return { request, rfp, award };
}

function notBefore(occurredAt: Date, parentAt: Date) {
  if (occurredAt < parentAt) throw new PartnerOutcomeError("INVALID_INPUT");
}

async function prepare(
  repo: DrizzlePartnerOutcomeRepository,
  parsed: ReturnType<typeof parse>,
) {
  const { data, actor, inputHash } = parsed;
  const existing = await repo.command(data.commandId);
  if (existing) return retry(existing, inputHash);
  const { request, rfp, award } = await submittedRequest(
    repo,
    data.requestId,
    true,
  );
  if (award.providerWorkspaceId !== data.providerWorkspaceId)
    throw new PartnerOutcomeError("PROVIDER_MISMATCH");
  // Every write for an RFP holds the same row lock. Recheck command identity
  // after acquiring it, so concurrent retries do not create duplicate facts.
  const concurrent = await repo.command(data.commandId);
  if (concurrent) return retry(concurrent, inputHash);
  if (await repo.reference(data.providerWorkspaceId, data.kind, data.reference))
    throw new PartnerOutcomeError("REFERENCE_CONFLICT");
  const occurredAt = new Date(data.occurredAt);
  notBefore(occurredAt, request.submittedAt!);
  const entries = await repo.entries(rfp.id);
  const active = activeEntries(entries).filter(
    (entry) => entry.providerWorkspaceId === award.providerWorkspaceId,
  );
  const contract = active.find(
    (entry) => entry.kind === "provider_contract_confirmed",
  );
  if (data.kind === "provider_contract_confirmed" && contract)
    throw new PartnerOutcomeError("ALREADY_CONFIRMED");
  if (
    data.kind === "integration_verified" &&
    active.some(
      (entry) =>
        entry.kind === "integration_verified" &&
        entry.integrationEnvironment === data.integrationEnvironment &&
        (entry.source === "customer_report") ===
          (data.source === "customer_report"),
    )
  )
    throw new PartnerOutcomeError("ALREADY_CONFIRMED");
  if (data.kind === "commission_confirmed") {
    if (!contract) throw new PartnerOutcomeError("CONTRACT_NOT_CONFIRMED");
    notBefore(occurredAt, contract.occurredAt);
  }
  if (data.kind === "commission_paid" || data.kind === "voided") {
    const parent = active.find((entry) => entry.id === data.relatedEntryId);
    if (!parent) throw new PartnerOutcomeError("RELATED_ENTRY_INVALID");
    notBefore(occurredAt, parent.occurredAt);
    if (data.kind === "commission_paid") {
      if (
        parent.kind !== "commission_confirmed" ||
        parent.currency !== data.currency ||
        parent.amount === null
      )
        throw new PartnerOutcomeError("RELATED_ENTRY_INVALID");
      const paid = active
        .filter(
          (entry) =>
            entry.kind === "commission_paid" &&
            entry.relatedEntryId === parent.id,
        )
        .reduce((sum, entry) => sum + amountUnits(entry.amount!), BigInt(0));
      if (paid + amountUnits(data.amount) > amountUnits(parent.amount))
        throw new PartnerOutcomeError("PAYMENT_EXCEEDS_CONFIRMED");
    } else {
      if (
        parent.kind === "provider_contract_confirmed" &&
        active.some((entry) => entry.kind === "commission_confirmed")
      )
        throw new PartnerOutcomeError("DEPENDENT_ENTRIES_EXIST");
      if (
        parent.kind === "commission_confirmed" &&
        active.some(
          (entry) =>
            entry.kind === "commission_paid" &&
            entry.relatedEntryId === parent.id,
        )
      )
        throw new PartnerOutcomeError("DEPENDENT_ENTRIES_EXIST");
    }
  }
  const attributedEnvironment = await repo.requestEnvironment(
    request.id,
    request.connectionId,
  );
  const environment = z
    .enum(AGENT_ANALYTICS_ENVIRONMENTS)
    .safeParse(attributedEnvironment);
  // Capture the storage clock only after the RFP lock and dependency checks.
  // A transaction that waited for a parent must never appear earlier than it
  // in the report's recordedAt cutoff.
  const recordedAt = await repo.recordingTime();
  if (occurredAt > recordedAt)
    throw new PartnerOutcomeError("FUTURE_OCCURRENCE");
  const entry: PartnerOutcomeEntry = {
    id: randomUUID(),
    commandId: data.commandId,
    inputHash,
    requestId: request.id,
    requestCreatedAt: request.createdAt,
    rfpId: rfp.id,
    providerWorkspaceId: award.providerWorkspaceId,
    environment: environment.success ? environment.data : "unknown",
    kind: data.kind,
    source: data.source,
    reference: data.reference,
    evidenceReference: data.evidenceReference,
    occurredAt,
    recordedAt,
    recordedBy: actor.label,
    schemaVersion: 1,
    amount: "amount" in data ? data.amount : null,
    currency: "currency" in data ? data.currency : null,
    agreementReference:
      data.kind === "commission_confirmed" ? data.agreementReference : null,
    calculationReference:
      data.kind === "commission_confirmed" ? data.calculationReference : null,
    periodStart:
      data.kind === "commission_confirmed" ? (data.periodStart ?? null) : null,
    periodEnd:
      data.kind === "commission_confirmed" ? (data.periodEnd ?? null) : null,
    integrationEnvironment:
      data.kind === "integration_verified" ? data.integrationEnvironment : null,
    relatedEntryId: "relatedEntryId" in data ? data.relatedEntryId : null,
    reason: data.kind === "voided" ? data.reason : null,
  };
  return { entry, idempotent: false };
}

/** Trusted server/CLI only. This does not grant application-user permissions. */
export async function previewPartnerOutcome(
  input: unknown,
  operator: PartnerOutcomeOperator,
) {
  const parsed = parse(input, operator);
  const result = await (
    await getDb()
  ).transaction(async (tx: Tx) =>
    prepare(new DrizzlePartnerOutcomeRepository(tx), parsed),
  );
  return { ...result, execute: false as const };
}

function uniqueViolation(error: unknown): boolean {
  const value = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return value?.code === "23505" || value?.cause?.code === "23505";
}

/** RFP row lock, immutable append and audit commit together. No external payment occurs. */
export async function recordPartnerOutcome(
  input: unknown,
  operator: PartnerOutcomeOperator,
) {
  const parsed = parse(input, operator);
  try {
    return await (
      await getDb()
    ).transaction(async (tx: Tx) => {
      const repo = new DrizzlePartnerOutcomeRepository(tx);
      const result = await prepare(repo, parsed);
      if (result.idempotent) return result;
      const entry = await repo.append(result.entry);
      await repo.audit(entry);
      return { entry, idempotent: false };
    });
  } catch (error) {
    if (!uniqueViolation(error)) throw error;
    // A command/reference reused across different RFPs is arbitrated by the DB
    // unique constraint. Resolve it once after rollback, without retry loops.
    const repo = await getPartnerOutcomeRepo();
    const existing = await repo.command(parsed.data.commandId);
    if (existing) return retry(existing, parsed.inputHash);
    throw new PartnerOutcomeError("REFERENCE_CONFLICT");
  }
}

function requireId(value: string) {
  if (!z.string().uuid().safeParse(value).success)
    throw new PartnerOutcomeError("INVALID_INPUT");
  return value.toLowerCase();
}

function projection(
  entry: PartnerOutcomeEntry | undefined,
  integrationEnvironment?: "sandbox" | "live",
) {
  return {
    status: !entry
      ? "not_verified"
      : entry.source === "customer_report"
        ? "reported"
        : integrationEnvironment
          ? "verified"
          : "confirmed",
    occurredAt: entry?.occurredAt.toISOString() ?? null,
    recordedAt: entry?.recordedAt.toISOString() ?? null,
    source: entry?.source ?? null,
    ...(integrationEnvironment ? { environment: integrationEnvironment } : {}),
  };
}
function emptyStatus() {
  return {
    providerContract: projection(undefined),
    integration: {
      sandbox: projection(undefined, "sandbox"),
      live: projection(undefined, "live"),
    },
  };
}

/** Caller first authorizes request ownership. Never returns financial or evidence data. */
export async function readPartnerOutcomeStatus(
  requestId: string,
  rfpId?: string,
) {
  const id = requireId(requestId);
  const expectedRfpId = rfpId === undefined ? undefined : requireId(rfpId);
  const repo = await getPartnerOutcomeRepo();
  let context: Awaited<ReturnType<typeof submittedRequest>>;
  try {
    context = await submittedRequest(repo, id, false);
  } catch (error) {
    if (
      error instanceof PartnerOutcomeError &&
      [
        "REQUEST_NOT_FOUND",
        "REQUEST_NOT_SUBMITTED",
        "AWARD_NOT_CONFIRMED",
      ].includes(error.code)
    )
      return emptyStatus();
    throw error;
  }
  if (expectedRfpId && context.rfp.id !== expectedRfpId) return emptyStatus();
  const entries = activeEntries(await repo.entries(context.rfp.id)).filter(
    (entry) =>
      entry.requestId === id &&
      entry.providerWorkspaceId === context.award.providerWorkspaceId &&
      PARTNER_EVIDENCE_SOURCES.some((source) => source === entry.source),
  );
  const integration = (environment: "sandbox" | "live") => {
    const candidates = entries.filter(
      (entry) =>
        entry.kind === "integration_verified" &&
        entry.integrationEnvironment === environment,
    );
    return projection(
      candidates.find((entry) => entry.source !== "customer_report") ??
        candidates.find((entry) => entry.source === "customer_report"),
      environment,
    );
  };
  return {
    providerContract: projection(
      entries.find(
        (entry) =>
          entry.kind === "provider_contract_confirmed" &&
          entry.source !== "customer_report" &&
          entry.source !== "test_result",
      ),
    ),
    integration: { sandbox: integration("sandbox"), live: integration("live") },
  };
}

/** Internal operator inspection; not an MCP/public endpoint. */
export async function inspectPartnerOutcomes(requestId: string) {
  const id = requireId(requestId);
  const repo = await getPartnerOutcomeRepo();
  if (!(await repo.request(id)))
    throw new PartnerOutcomeError("REQUEST_NOT_FOUND");
  return { requestId: id, entries: await repo.requestEntries(id) };
}
