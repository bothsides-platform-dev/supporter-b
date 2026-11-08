import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  getDb,
  getRfpRepo,
  getAgentRepo,
  getBusinessCalendarRepo,
} from "@/lib/server/repositories/factory";
import {
  DrizzleAgentRepository,
  type AgentRequestRow,
} from "@/lib/server/repositories/drizzle/agent";
import type { Tx } from "@/lib/server/repositories/types";
import {
  AgentError,
  agentAccountUrls,
} from "@/lib/server/agent/account-contract";
import {
  agentRequestContent,
  prepareAgentRequestInput,
} from "@/lib/server/agent/request-input";
import {
  authenticateAgent,
  activeAgentConnection,
  type AgentPrincipal,
} from "./agent-account";
import { sendReadinessIssues } from "@/lib/rfp/send-readiness";
import { parseCreateRfpInput } from "@/lib/rfp/intake/parse";
import { normalizeNewRfpTerms } from "@/lib/rfp/intake/normalize";
import { getRfpService } from "./rfp";
import { getPgRecommendationService } from "./pg-recommendation";
import { industrySelectionSchema } from "@/lib/rfp/industry-selection";
import { currentPgsSchema } from "@/lib/rfp/current-pgs";
import { z } from "zod";
import type { Actor } from "./types";
import { businessDeadline } from "@/lib/rfp/business-deadline";
import { kstDateOf } from "@/lib/utils/deadline";

function requireId(id: string) {
  if (!z.string().uuid().safeParse(id).success)
    throw new AgentError("not_found", 404);
}

export function agentRequestSummary(row: AgentRequestRow) {
  const content = agentRequestContent.parse(row.content);
  const missing = sendReadinessIssues({
    ...content,
    deadline: content.deadline ?? "",
  });
  return {
    requestId: row.id,
    revision: row.revision,
    status: row.rfpCode ? "submitted" : "draft",
    content,
    missing: missing.map(({ rule, path, message }) => ({
      field: path,
      rule,
      message,
    })),
    nextAction: row.rfpCode
      ? {
          type: "open_request",
          url: `${agentAccountUrls().issuer}/rfp/${row.rfpCode}`,
        }
      : {
          type: "review_in_browser",
          url: `${agentAccountUrls().issuer}/agent/requests/${row.id}`,
        },
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function prepareAgentRequest(rawToken: string, input: unknown) {
  const parsed = prepareAgentRequestInput.safeParse(input);
  if (!parsed.success) throw new AgentError("invalid_request");
  const data = parsed.data;
  const content = JSON.parse(
    JSON.stringify(normalizeNewRfpTerms(data.content)),
  ) as Record<string, unknown>;
  const db = await getDb();
  return db.transaction(async (tx: Tx) => {
    const repo = new DrizzleAgentRepository(tx);
    const { connection } = await authenticateAgent(
      rawToken,
      "requests:write",
      repo,
      true,
    );
    const existing = await repo.requestByKey(data.requestKey);
    if (existing && existing.connectionId !== connection.id)
      throw new AgentError("request_key_conflict", 409);
    if (data.requestId && (!existing || existing.id !== data.requestId))
      throw new AgentError("not_found", 404);
    if (existing) {
      if (isDeepStrictEqual(existing.content, content))
        return agentRequestSummary(existing);
      if (existing.rfpCode) throw new AgentError("already_submitted", 409);
      if (!data.requestId || data.expectedRevision !== existing.revision)
        throw new AgentError("revision_conflict", 409);
      const row = {
        ...existing,
        content,
        revision: existing.revision + 1,
        updatedAt: new Date(),
      };
      await repo.updateRequest(row.id, {
        content,
        revision: row.revision,
        updatedAt: row.updatedAt,
      });
      await repo.event({
        id: randomUUID(),
        connectionId: connection.id,
        requestId: row.id,
        event: "draft_updated",
        revision: row.revision,
      });
      return agentRequestSummary(row);
    }
    if (data.expectedRevision !== undefined)
      throw new AgentError("revision_conflict", 409);
    const now = new Date();
    const row: AgentRequestRow = {
      id: randomUUID(),
      requestKey: data.requestKey,
      connectionId: connection.id,
      revision: 1,
      content,
      createdAt: now,
      updatedAt: now,
      rfpCode: null,
      submittedAt: null,
    };
    await repo.addRequest(row);
    await repo.event({
      id: randomUUID(),
      connectionId: connection.id,
      requestId: row.id,
      event: "draft_created",
      revision: 1,
    });
    return agentRequestSummary(row);
  });
}

export async function readAgentRequest(principal: AgentPrincipal, id: string) {
  requireId(id);
  const repo = await getAgentRepo();
  const row = await repo.request(id);
  if (!row || row.connectionId !== principal.connection.id)
    throw new AgentError("not_found", 404);
  const summary = agentRequestSummary(row);
  const rfp = row.rfpCode
    ? await (await getRfpRepo()).findByCode(row.rfpCode)
    : undefined;
  if (rfp && rfp.buyerWsId !== principal.connection.workspaceId)
    throw new AgentError("not_found", 404);
  await repo.event({
    id: randomUUID(),
    connectionId: principal.connection.id,
    requestId: id,
    event: "status_read",
    revision: row.revision,
  });
  return {
    ...summary,
    requestStatus: rfp?.status ?? null,
    deadline: rfp?.deadline ?? null,
    providerContractStatus: "not_verified",
    checkedAt: new Date().toISOString(),
    guidance: rfp
      ? "견적과 합의서의 자세한 내용은 웹에서 확인해요. PG 서비스 계약 완료는 별도로 확인해요."
      : "브라우저에서 내용을 확인하고 상담 요청을 보내요.",
  };
}

export const recommendAgentPgInput = z
  .object({
    industry: industrySelectionSchema,
    currentPgs: currentPgsSchema.default([]),
  })
  .strict();
export async function recommendAgentPg(
  principal: AgentPrincipal,
  input: unknown,
) {
  const parsed = recommendAgentPgInput.safeParse(input);
  if (!parsed.success) throw new AgentError("invalid_request");
  const result = await (
    await getPgRecommendationService()
  ).recommend({
    kind: "selection",
    ...parsed.data,
    buyerWorkspaceId: principal.connection.workspaceId,
    includeTestPg: false,
  });
  if (!result.ok) throw new AgentError(result.error);
  const now = new Date();
  const calendar = await (
    await getBusinessCalendarRepo()
  ).read(kstDateOf(now), kstDateOf(new Date(now.getTime() + 30 * 86400_000)));
  const suggestedDeadline = calendar
    ? businessDeadline(now, 5, calendar)
    : null;
  return {
    industryName: result.recommendation.industryName,
    suggestedDeadline,
    candidates: result.recommendation.candidates.map((c) => ({
      pgWorkspaceId: c.pgWorkspaceId,
      name: c.name,
      reason: c.reason,
      feeRate: c.feeRate,
      feeNote: c.feeNote,
    })),
    guidance: "한 PG사를 선택해요. 최종 조건은 PG사 검토와 계약에서 확인해요.",
  };
}

export async function browserAgentRequest(id: string, actor: Actor) {
  requireId(id);
  const repo = await getAgentRepo();
  const row = await repo.request(id);
  if (!row) throw new AgentError("not_found", 404);
  const { connection, member } = await activeAgentConnection(
    repo,
    row.connectionId,
  );
  if (
    connection.userId !== actor.userId ||
    connection.workspaceId !== actor.workspaceId
  )
    throw new AgentError("not_found", 404);
  return { row, summary: agentRequestSummary(row), workspaceName: member.name };
}

/** Browser confirmation owns the send. The same transaction records the RFP,
 * agent linkage and event; response loss cannot send a second consultation. */
export async function submitBrowserAgentRequest(
  id: string,
  revision: number,
  actor: Actor,
) {
  requireId(id);
  const db = await getDb();
  const afterCommit: (() => void)[] = [];
  const result = await db.transaction(async (tx: Tx) => {
    const repo = new DrizzleAgentRepository(tx);
    const initial = await repo.request(id);
    if (!initial) throw new AgentError("not_found", 404);
    const { connection } = await activeAgentConnection(
      repo,
      initial.connectionId,
      true,
    );
    if (
      connection.userId !== actor.userId ||
      connection.workspaceId !== actor.workspaceId
    )
      throw new AgentError("not_found", 404);
    if (!connection.scopes.includes("requests:write"))
      throw new AgentError("insufficient_scope", 403);
    const row = (await repo.request(id, true))!;
    if (row.revision !== revision)
      throw new AgentError("revision_conflict", 409);
    if (row.rfpCode) return { rfpCode: row.rfpCode };
    const input = parseCreateRfpInput({
      ...row.content,
      title: row.content.title ?? "",
      requestKey: row.requestKey,
      send: true,
      boardVisible: false,
      bizProfileMode: "inherit",
    });
    if (!input.ok) throw new AgentError(input.error);
    const sent = await (
      await getRfpService()
    ).createRfp(input.data, actor, false, { tx, afterCommit });
    if (!sent.ok) throw new AgentError(sent.error);
    await repo.updateRequest(id, {
      rfpCode: sent.rfpId,
      submittedAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.event({
      id: randomUUID(),
      connectionId: connection.id,
      requestId: id,
      event: "request_submitted",
      revision,
    });
    return { rfpCode: sent.rfpId };
  });
  for (const run of afterCommit) run();
  return result;
}
