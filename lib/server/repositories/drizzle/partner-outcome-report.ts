import { sql } from "drizzle-orm";
import type { Tx } from "../types";
import type { AgentAnalyticsRange } from "./agent-analytics";

/** Immutable attribution survives OAuth deletion; both fact and knowledge times are bounded. */
export async function partnerOutcomeReport(
  tx: Tx,
  { from, to, environment }: AgentAnalyticsRange,
) {
  const end = to.toISOString();
  const active = sql`SELECT e.* FROM partner_outcome_entries e
    WHERE e.environment=${environment} AND e.request_created_at>=${from.toISOString()}::timestamptz
      AND e.request_created_at<${end}::timestamptz AND e.occurred_at<${end}::timestamptz AND e.recorded_at<${end}::timestamptz
      AND e.kind<>'voided' AND NOT EXISTS (
        SELECT 1 FROM partner_outcome_entries v WHERE v.related_entry_id=e.id AND v.kind='voided'
          AND v.occurred_at<${end}::timestamptz AND v.recorded_at<${end}::timestamptz
      )`;
  const counts = await tx.execute(sql`WITH active AS (${active}) SELECT
    count(DISTINCT rfp_id) FILTER (WHERE kind='provider_contract_confirmed')::int AS provider_contracts,
    count(DISTINCT rfp_id) FILTER (WHERE kind='integration_verified' AND source<>'customer_report' AND integration_environment='live')::int AS live_integrations,
    count(DISTINCT rfp_id) FILTER (WHERE kind='integration_verified' AND source<>'customer_report' AND integration_environment='sandbox')::int AS sandbox_integrations,
    count(DISTINCT rfp_id) FILTER (WHERE kind='integration_verified' AND source='customer_report')::int AS customer_integration_reports,
    count(DISTINCT rfp_id) FILTER (WHERE kind='commission_confirmed')::int AS requests_with_commission,
    count(DISTINCT rfp_id) FILTER (WHERE kind='commission_paid')::int AS requests_with_payment
    FROM active`);
  const amounts =
    await tx.execute(sql`WITH active AS (${active}) SELECT currency,
    round(coalesce(sum(amount) FILTER (WHERE kind='commission_confirmed'),0),4)::text AS confirmed_amount,
    round(coalesce(sum(amount) FILTER (WHERE kind='commission_paid'),0),4)::text AS paid_amount,
    round(coalesce(sum(amount) FILTER (WHERE kind='commission_confirmed'),0)-coalesce(sum(amount) FILTER (WHERE kind='commission_paid'),0),4)::text AS outstanding_amount,
    count(*) FILTER (WHERE kind='commission_confirmed')::int AS confirmed_entries,
    count(*) FILTER (WHERE kind='commission_paid')::int AS payments
    FROM active WHERE kind IN ('commission_confirmed','commission_paid') GROUP BY currency ORDER BY currency`);
  const rows = <T>(value: unknown): T[] =>
    (Array.isArray(value) ? value : (value as { rows: T[] }).rows) as T[];
  return {
    outcomes: rows<{
      provider_contracts: number;
      live_integrations: number;
      sandbox_integrations: number;
      customer_integration_reports: number;
      requests_with_commission: number;
      requests_with_payment: number;
    }>(counts)[0],
    commissions: rows<{
      currency: string;
      confirmed_amount: string;
      paid_amount: string;
      outstanding_amount: string;
      confirmed_entries: number;
      payments: number;
    }>(amounts),
  };
}
