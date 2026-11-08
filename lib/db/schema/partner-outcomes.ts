import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  date,
  integer,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { rfps } from "./rfps";
import { workspaces } from "./workspaces";
import { agentRequests } from "./agent";
import type { PartnerOutcomeKind } from "@/lib/agent/partner-outcomes";
import type { AgentAnalyticsEnvironment } from "@/lib/analytics/agent-contract";

/** Internal evidence ledger. Financial facts outlive OAuth grants and attribution. */
export const partnerOutcomeEntries = pgTable(
  "partner_outcome_entries",
  {
    id: uuid("id").primaryKey(),
    commandId: uuid("command_id").notNull().unique(),
    inputHash: text("input_hash").notNull(),
    requestId: uuid("request_id").references(() => agentRequests.id, {
      onDelete: "set null",
    }),
    requestCreatedAt: timestamp("request_created_at", {
      withTimezone: true,
    }).notNull(),
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "restrict" }),
    providerWorkspaceId: uuid("provider_workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    environment: text("environment")
      .$type<AgentAnalyticsEnvironment>()
      .notNull(),
    kind: text("kind").$type<PartnerOutcomeKind>().notNull(),
    source: text("source").notNull(),
    reference: text("reference").notNull(),
    evidenceReference: text("evidence_reference").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    recordedBy: text("recorded_by").notNull(),
    amount: numeric("amount", { precision: 20, scale: 4 }),
    currency: text("currency"),
    agreementReference: text("agreement_reference"),
    calculationReference: text("calculation_reference"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    integrationEnvironment: text("integration_environment").$type<
      "sandbox" | "live"
    >(),
    relatedEntryId: uuid("related_entry_id").references(
      (): AnyPgColumn => partnerOutcomeEntries.id,
      { onDelete: "restrict" },
    ),
    reason: text("reason"),
    schemaVersion: integer("schema_version").notNull().default(1),
  },
  (t) => [
    uniqueIndex("partner_outcome_reference_unique").on(
      t.providerWorkspaceId,
      t.kind,
      t.reference,
    ),
    uniqueIndex("partner_outcome_void_unique")
      .on(t.relatedEntryId)
      .where(sql`${t.kind} = 'voided'`),
    index("partner_outcome_rfp_idx").on(t.rfpId, t.recordedAt),
    index("partner_outcome_request_idx").on(t.requestId),
    index("partner_outcome_related_idx").on(t.relatedEntryId),
    index("partner_outcome_cohort_idx").on(t.environment, t.requestCreatedAt),
    check(
      "partner_outcome_kind_check",
      sql`${t.kind} IN ('provider_contract_confirmed','integration_verified','commission_confirmed','commission_paid','voided')`,
    ),
    check(
      "partner_outcome_amount_check",
      sql`(${t.kind} IN ('commission_confirmed','commission_paid') AND ${t.amount} IS NOT NULL AND ${t.amount} >= 0 AND ${t.currency} IS NOT NULL AND ${t.currency} ~ '^[A-Z]{3}$') OR (${t.kind} NOT IN ('commission_confirmed','commission_paid') AND ${t.amount} IS NULL AND ${t.currency} IS NULL)`,
    ),
    check(
      "partner_outcome_related_check",
      sql`(${t.kind} IN ('commission_paid','voided') AND ${t.relatedEntryId} IS NOT NULL) OR (${t.kind} NOT IN ('commission_paid','voided') AND ${t.relatedEntryId} IS NULL)`,
    ),
    check(
      "partner_outcome_payment_check",
      sql`${t.kind} <> 'commission_paid' OR ${t.amount} > 0`,
    ),
    check(
      "partner_outcome_basis_check",
      sql`${t.kind} <> 'commission_confirmed' OR (${t.agreementReference} IS NOT NULL AND ${t.calculationReference} IS NOT NULL)`,
    ),
    check(
      "partner_outcome_integration_check",
      sql`(${t.kind} = 'integration_verified' AND ${t.integrationEnvironment} IS NOT NULL AND ${t.integrationEnvironment} IN ('sandbox','live')) OR (${t.kind} <> 'integration_verified' AND ${t.integrationEnvironment} IS NULL)`,
    ),
    check(
      "partner_outcome_void_reason_check",
      sql`${t.kind} <> 'voided' OR (${t.reason} IS NOT NULL AND length(btrim(${t.reason})) > 0)`,
    ),
    check(
      "partner_outcome_period_check",
      sql`(${t.periodStart} IS NULL AND ${t.periodEnd} IS NULL) OR (${t.periodStart} IS NOT NULL AND ${t.periodEnd} IS NOT NULL AND ${t.periodStart} <= ${t.periodEnd})`,
    ),
  ],
);
