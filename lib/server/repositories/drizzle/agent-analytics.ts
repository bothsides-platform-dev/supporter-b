import { sql } from "drizzle-orm";
import { agentObservations } from "@/lib/db/schema";
import type { AgentAnalyticsEnvironment } from "@/lib/analytics/agent-contract";
import type { Tx } from "../types";
import { partnerOutcomeReport } from "./partner-outcome-report";

export type AgentAnalyticsRange = {
  from: Date;
  to: Date;
  environment: AgentAnalyticsEnvironment;
};

export class DrizzleAgentAnalyticsRepository {
  constructor(readonly db: Tx) {}

  async record(row: typeof agentObservations.$inferInsert) {
    await this.db.transaction(async (tx: Tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '500ms'`);
      await tx.execute(sql`SET LOCAL lock_timeout = '200ms'`);
      await tx.insert(agentObservations).values(row).onConflictDoNothing();
    });
  }

  /** Aggregates only. Never expose raw grants, draft bodies, or customer identities. */
  async report({ from, to, environment }: AgentAnalyticsRange) {
    const start = from.toISOString();
    const end = to.toISOString();
    return this.db.transaction(async (tx: Tx) => {
      await tx.execute(
        sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`,
      );
      await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
      const result = await tx.execute(sql`
        WITH consent_cohort AS (
          SELECT connection_id, min(created_at) AS consent_at FROM agent_events
          WHERE environment = ${environment} AND event = 'connected'
            AND created_at >= ${start}::timestamptz AND created_at < ${end}::timestamptz
          GROUP BY connection_id
        ), stages AS (
          SELECT c.connection_id,
            EXISTS(SELECT 1 FROM agent_events e WHERE e.connection_id=c.connection_id AND e.environment=${environment}
              AND e.event='token_issued' AND e.created_at>=c.consent_at AND e.created_at<${end}::timestamptz) AS issued,
            EXISTS(SELECT 1 FROM agent_events e WHERE e.connection_id=c.connection_id AND e.environment=${environment}
              AND e.event='draft_created' AND e.created_at>=c.consent_at AND e.created_at<${end}::timestamptz) AS prepared,
            EXISTS(SELECT 1 FROM agent_events e WHERE e.connection_id=c.connection_id AND e.environment=${environment}
              AND e.event='request_submitted' AND e.created_at>=c.consent_at AND e.created_at<${end}::timestamptz) AS submitted,
            EXISTS(SELECT 1 FROM agent_observations o WHERE o.connection_id=c.connection_id AND o.environment=${environment}
              AND o.outcome='ok' AND o.operation IN ('get_connection','recommend_pg','prepare_request','get_request_status')
              AND o.occurred_at>=c.consent_at AND o.occurred_at<${end}::timestamptz) AS used
          FROM consent_cohort c
        ) SELECT count(*)::int AS consents,
          count(*) FILTER (WHERE issued)::int AS tokens_issued,
          count(*) FILTER (WHERE used)::int AS tool_users_observed,
          count(*) FILTER (WHERE prepared)::int AS connections_with_drafts,
          count(*) FILTER (WHERE submitted)::int AS connections_with_submissions FROM stages
      `);
      const requests = await tx.execute(sql`
        SELECT CASE WHEN r.content->>'contractType' IN ('new','renewal') THEN r.content->>'contractType' ELSE 'unknown' END AS contract_type,
          count(*)::int AS drafts,
          count(*) FILTER (WHERE r.submitted_at < ${end}::timestamptz)::int AS submitted,
          count(*) FILTER (WHERE r.submitted_at IS NULL OR r.submitted_at >= ${end}::timestamptz)::int AS pending,
          avg(extract(epoch FROM r.submitted_at-r.created_at)) FILTER (WHERE r.submitted_at < ${end}::timestamptz)::float AS average_seconds_to_submit
        FROM agent_requests r WHERE EXISTS (
          SELECT 1 FROM agent_events e WHERE e.request_id=r.id AND e.event='draft_created' AND e.environment=${environment}
            AND e.created_at>=${start}::timestamptz AND e.created_at<${end}::timestamptz
        ) GROUP BY 1 ORDER BY 1
      `);
      const activity = await tx.execute(sql`
        SELECT to_char(occurred_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS day,
          surface, operation, outcome, error_code, count(*)::int AS calls,
          round(avg(duration_ms))::int AS average_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::float AS p95_ms
        FROM agent_observations WHERE environment=${environment}
          AND occurred_at>=${start}::timestamptz AND occurred_at<${end}::timestamptz
        GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4,5
      `);
      const missing = await tx.execute(sql`
        SELECT rule, count(*)::int AS observations FROM agent_observations o,
          LATERAL jsonb_array_elements_text(coalesce(o.dimensions->'missingRules', '[]'::jsonb)) rule
        WHERE o.environment=${environment} AND o.occurred_at>=${start}::timestamptz AND o.occurred_at<${end}::timestamptz
        GROUP BY rule ORDER BY observations DESC, rule
      `);
      const coverage = await tx.execute(sql`
        SELECT min(occurred_at) AS first_observation, max(occurred_at) AS last_observation,
          count(*)::int AS observations FROM agent_observations
        WHERE environment=${environment} AND occurred_at>=${start}::timestamptz AND occurred_at<${end}::timestamptz
      `);
      // postgres-js returns an array; the PGlite test adapter returns { rows }.
      const rows = <T>(value: unknown): T[] =>
        (Array.isArray(value) ? value : (value as { rows: T[] }).rows) as T[];
      return {
        ...(await partnerOutcomeReport(tx, { from, to, environment })),
        funnel: rows<{
          consents: number;
          tokens_issued: number;
          tool_users_observed: number;
          connections_with_drafts: number;
          connections_with_submissions: number;
        }>(result)[0],
        requests: rows<{
          contract_type: string;
          drafts: number;
          submitted: number;
          pending: number;
          average_seconds_to_submit: number | null;
        }>(requests),
        activity: rows<{
          day: string;
          surface: string;
          operation: string;
          outcome: string;
          error_code: string | null;
          calls: number;
          average_ms: number;
          p95_ms: number;
        }>(activity),
        missing: rows<{ rule: string; observations: number }>(missing),
        coverage: rows<{
          first_observation: string | null;
          last_observation: string | null;
          observations: number;
        }>(coverage)[0],
      };
    });
  }

  /** Fixed retention; preview unless the operator explicitly requests deletion. */
  async pruneObservations(cutoff: Date, execute: boolean) {
    return this.db.transaction(async (tx: Tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
      const result = execute
        ? await tx.execute(sql`WITH expired AS (SELECT id FROM agent_observations WHERE occurred_at<${cutoff.toISOString()}::timestamptz ORDER BY occurred_at LIMIT 5000),
            removed AS (DELETE FROM agent_observations WHERE id IN (SELECT id FROM expired) RETURNING id)
            SELECT count(*)::int AS count FROM removed`)
        : await tx.execute(
            sql`SELECT count(*)::int AS count FROM agent_observations WHERE occurred_at<${cutoff.toISOString()}::timestamptz`,
          );
      return (Array.isArray(result) ? result : result.rows)[0].count as number;
    });
  }
}
