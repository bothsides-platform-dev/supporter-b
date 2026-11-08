import {
  AgentError,
  agentAccountUrls,
  agentChannelEnabled,
} from "./account-contract";
import { guardPublicAgentRequest } from "./public-guard";
import { readBoundedBody } from "@/lib/server/http/bounded-body";
import {
  AGENT_MISSING_RULES,
  agentErrorCode,
  type AgentObservation,
} from "@/lib/analytics/agent-contract";
import { recordAgentObservation } from "@/lib/server/services/agent-analytics";

export type AccountObservation = Omit<
  AgentObservation,
  "durationMs" | "outcome"
> & {
  outcome?: AgentObservation["outcome"];
};

export function accountOutcome(status: number): AgentObservation["outcome"] {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "error";
  if (status === 401 || status === 403 || status === 404) return "rejected";
  if (status === 409) return "blocked";
  return status >= 400 ? "invalid_request" : "ok";
}

/** Project only validated service results; never copy input or response content. */
export function observeAgentSummary(
  observation: AccountObservation,
  summary: {
    requestId: string;
    content: { contractType?: "new" | "renewal" | null };
    missing: { rule: string }[];
  },
) {
  observation.requestId = summary.requestId;
  observation.contractType = summary.content.contractType ?? "unknown";
  observation.missingRules = summary.missing
    .map((item) => item.rule)
    .filter(
      (rule): rule is NonNullable<AgentObservation["missingRules"]>[number] =>
        AGENT_MISSING_RULES.some((allowed) => allowed === rule),
    );
}

export const ACCOUNT_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
export const accountJson = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) => Response.json(body, { status, headers: { ...ACCOUNT_HEADERS, ...extra } });
export function accountChallenge(write = false) {
  return `Bearer ${write ? 'error="insufficient_scope", ' : ""}resource_metadata="${agentAccountUrls().metadata}", scope="requests:read${write ? " requests:write" : ""}"`;
}
export function accountFailure(error: unknown) {
  if (error instanceof AgentError)
    return accountJson(
      { error: error.code },
      error.status,
      error.status === 401 || error.code === "insufficient_scope"
        ? {
            "WWW-Authenticate": accountChallenge(
              error.code === "insufficient_scope",
            ),
          }
        : {},
    );
  return accountJson({ error: "temporarily_unavailable" }, 503);
}
export async function serveAgentAccount(
  request: Request,
  fn: () => Promise<Response> | Response,
  observation?: AccountObservation,
) {
  // The disabled channel must remain independent of authentication and storage,
  // including optional analytics when its own flag is enabled.
  if (!agentChannelEnabled()) return accountJson({ error: "not_found" }, 404);
  const started = performance.now();
  let response: Response;
  try {
    response = guardPublicAgentRequest(request) ?? (await fn());
  } catch (error) {
    response = accountFailure(error);
    if (observation) {
      observation.errorCode =
        observation.errorCode === "timeout"
          ? "timeout"
          : error instanceof AgentError
            ? agentErrorCode(error.code)
            : "temporarily_unavailable";
      observation.outcome = accountOutcome(response.status);
    }
  }
  if (observation) {
    // Snapshot before awaiting the sink: a timed-out tool may still finish later.
    const event = {
      ...observation,
      outcome: observation.outcome ?? accountOutcome(response.status),
      durationMs: Math.max(0, performance.now() - started),
      ...(observation.missingRules
        ? { missingRules: [...observation.missingRules] }
        : {}),
    };
    try {
      await recordAgentObservation(event);
    } catch {
      /* Observation never changes the response. */
    }
  }
  return response;
}
export async function accountBody(
  request: Request,
  format: "json" | "form",
): Promise<unknown> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (
    mediaType !==
    (format === "json"
      ? "application/json"
      : "application/x-www-form-urlencoded")
  )
    throw new AgentError("invalid_request", 415);
  const body = await readBoundedBody(request);
  if (typeof body === "number") throw new AgentError("invalid_request", body);
  if (format === "json") {
    try {
      return JSON.parse(body);
    } catch {
      throw new AgentError("invalid_request");
    }
  }
  const params = new URLSearchParams(body);
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
    throw new AgentError("invalid_request");
  return Object.fromEntries(params);
}
export function bearerToken(request: Request) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match) throw new AgentError("invalid_token", 401);
  return match[1];
}
