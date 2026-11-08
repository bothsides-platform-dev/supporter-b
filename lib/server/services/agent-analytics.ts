import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  agentObservationSchema,
  agentAnalyticsEnvironment,
  AGENT_ANALYTICS_ENVIRONMENTS,
  type AgentObservation,
} from "@/lib/analytics/agent-contract";
import { getAgentAnalyticsRepo } from "@/lib/server/repositories/factory";
import { logger } from "@/lib/observability/logger";

export const MAX_AGENT_OBSERVATIONS_PER_MINUTE = 2400;
export const AGENT_OBSERVATION_RETENTION_DAYS = 30;
let windowStart = 0;
let admitted = 0;
let inFlight = 0;
let unavailableUntil = 0;
let lastWarning = -Infinity;
function warning(reason: "budget" | "database") {
  if (Date.now() - lastWarning < 60_000) return;
  lastWarning = Date.now();
  try {
    logger.warn("agent.analytics.omitted", { reason });
  } catch {
    /* Optional telemetry. */
  }
}

/** Optional observation never rolls back or changes a business operation. */
export async function recordAgentObservation(
  input: AgentObservation,
): Promise<void> {
  const parsed = agentObservationSchema.safeParse(input);
  if (!parsed.success) return;
  const now = Date.now();
  if (now < windowStart || now - windowStart >= 60_000) {
    windowStart = now;
    admitted = 0;
  }
  if (admitted >= MAX_AGENT_OBSERVATIONS_PER_MINUTE) {
    warning("budget");
    return;
  }
  admitted++;
  const {
    connectionId,
    requestId,
    contractType,
    missingRules,
    candidateCount,
    ...observation
  } = parsed.data;
  const environment = agentAnalyticsEnvironment();
  const id = randomUUID();
  const occurredAt = new Date(now);
  const dimensions = {
    ...(contractType !== undefined ? { contractType } : {}),
    ...(missingRules !== undefined
      ? { missingRules: [...new Set(missingRules)] }
      : {}),
    ...(candidateCount !== undefined ? { candidateCount } : {}),
  };
  try {
    // Internal join IDs stay in Postgres, not in third-party operational logs.
    logger.info("agent.analytics", {
      ...observation,
      ...dimensions,
      eventId: id,
      environment,
      occurredAt: occurredAt.toISOString(),
      schemaVersion: 1,
    });
  } catch {
    /* The database sink is independent of log delivery. */
  }
  if (process.env.AGENT_ANALYTICS_ENABLED !== "true") return;
  if (inFlight >= 8 || now < unavailableUntil) {
    warning("database");
    return;
  }
  inFlight++;
  const pending = (async () => {
    try {
      await (
        await getAgentAnalyticsRepo()
      ).record({
        id,
        occurredAt,
        environment,
        connectionId,
        requestId,
        ...observation,
        durationMs: Math.round(observation.durationMs),
        dimensions,
      });
    } catch {
      unavailableUntil = Date.now() + 30_000;
      warning("database");
    } finally {
      inFlight--;
    }
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Pool acquisition can outlast statement_timeout. Release the HTTP caller,
    // but keep the slot until the pending write settles; never retry this event.
    await Promise.race([
      pending,
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          unavailableUntil = Date.now() + 30_000;
          warning("database");
          resolve();
        }, 750);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const rangeSchema = z
  .object({
    from: z.date(),
    to: z.date(),
    environment: z.enum(AGENT_ANALYTICS_ENVIRONMENTS),
  })
  .strict()
  .refine(
    (value) =>
      value.to > value.from &&
      value.to.getTime() - value.from.getTime() <= 93 * 86400_000,
    { message: "Report range must be positive and at most 93 days" },
  );

/** Internal operator/CLI API. No public route; an admin UI must enforce data.view. */
export async function agentAnalyticsReport(input: z.input<typeof rangeSchema>) {
  const range = rangeSchema.parse(input);
  const data = await (await getAgentAnalyticsRepo()).report(range);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      environment: range.environment,
      dayTimezone: "Asia/Seoul",
    },
    ...data,
    unmeasured: [
      "recommendation_impressions",
      "anonymous_unique_users",
      "unsupported_demand",
      "verified_harness",
    ],
    notes: [
      "연결 퍼널은 기간 내 동의한 연결을 기준으로 종료 시각까지 확인한 결과예요. 토큰 발급은 클라이언트의 응답 수신을 보장하지 않아요.",
      "호출 관측은 저장 제한·장애·보관 정리로 누락될 수 있어요. 도구 이용 관측과 업무 원장의 전환 수는 수집 범위가 달라요.",
      "초안은 기간 내 생성한 요청을 기준으로 집계해요. 미발송 요청은 준비 중이며 실패로 세지 않아요.",
      "신규/변경 분류는 현재 초안의 계약 유형을 사용해요. 과거 시점의 답변 스냅샷은 아니에요.",
      "공개 조회는 추천 노출이나 고유 고객 수가 아니에요. 계약·연동·수수료는 별도로 확인해 입력한 결과만 집계해요.",
      "제휴 결과는 요청 생성 기간을 기준으로 종료 시각 전에 발생하고 기록된 사실만 집계해요. 나중에 입력한 확인이나 정정으로 과거 시점의 보고서를 바꾸지 않아요.",
      "수수료는 통화별 확정·실제 입금·미입금 금액을 구분해요. 환산하거나 PG 거래액·구매사 수수료율로 계산하지 않아요. 연결을 삭제해도 회계 기록은 보존돼요.",
      "연결을 물리 삭제하면 연결·초안 집계는 줄지만 제휴 결과는 남아요. 두 집계를 단순히 나눠 전환율로 사용하지 않아요.",
    ],
  };
}
export async function pruneAgentObservations(
  execute = false,
  now = new Date(),
) {
  const cutoff = new Date(
    now.getTime() - AGENT_OBSERVATION_RETENTION_DAYS * 86400_000,
  );
  const count = await (
    await getAgentAnalyticsRepo()
  ).pruneObservations(cutoff, execute);
  return {
    execute,
    cutoff: cutoff.toISOString(),
    count,
    batchLimit: execute ? 5000 : null,
  };
}
export function __resetAgentAnalyticsForTest() {
  windowStart = 0;
  admitted = 0;
  inFlight = 0;
  unavailableUntil = 0;
  lastWarning = -Infinity;
}
