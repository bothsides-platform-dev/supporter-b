import {
  AgentError,
  agentAccountUrls,
  agentChannelEnabled,
} from "./account-contract";
import { guardPublicAgentRequest } from "./public-guard";
import { readBoundedBody } from "@/lib/server/http/bounded-body";

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
) {
  if (!agentChannelEnabled()) return accountJson({ error: "not_found" }, 404);
  const rejected = guardPublicAgentRequest(request);
  if (rejected) return rejected;
  try {
    return await fn();
  } catch (error) {
    return accountFailure(error);
  }
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
