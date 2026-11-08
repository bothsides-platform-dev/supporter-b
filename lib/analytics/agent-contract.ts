import { z } from "zod";

export const AGENT_ANALYTICS_ENVIRONMENTS = [
  "production",
  "staging",
  "development",
  "test",
  "unknown",
] as const;
export type AgentAnalyticsEnvironment =
  (typeof AGENT_ANALYTICS_ENVIRONMENTS)[number];
export function agentAnalyticsEnvironment(): AgentAnalyticsEnvironment {
  const configured = process.env.AGENT_ANALYTICS_ENVIRONMENT;
  if (AGENT_ANALYTICS_ENVIRONMENTS.some((value) => value === configured))
    return configured as AgentAnalyticsEnvironment;
  return process.env.NODE_ENV === "test"
    ? "test"
    : process.env.NODE_ENV === "development"
      ? "development"
      : "unknown";
}
export const AGENT_OPERATIONS = [
  "catalog",
  "requirements",
  "guide",
  "tools_list",
  "tool_call",
  "resources_list",
  "resource_templates_list",
  "resource_read",
  "initialize",
  "ping",
  "notification",
  "unknown",
  "register",
  "authorize",
  "token",
  "refresh",
  "revoke",
  "get_connection",
  "recommend_pg",
  "prepare_request",
  "get_request_status",
  "review",
  "submit",
] as const;
export const AGENT_ERROR_CODES = [
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "invalid_scope",
  "invalid_target",
  "invalid_token",
  "insufficient_scope",
  "access_denied",
  "not_found",
  "request_key_conflict",
  "already_submitted",
  "revision_conflict",
  "workspace_changed",
  "temporarily_unavailable",
  "timeout",
  "method_not_allowed",
  "unsupported_service",
  "rate_limited",
  "other",
] as const;
export const AGENT_MISSING_RULES = [
  "title",
  "website-required",
  "website-format",
  "contract",
  "main-products",
  "delivery",
  "product-cash",
  "product-price",
  "product-sales",
  "industry",
  "current-pgs",
  "monthly-avg-volume",
  "payment",
  "deadline",
  "pg",
] as const;

// Never accept raw input, URLs, client names, error messages or arbitrary metadata.
export const agentObservationSchema = z
  .object({
    surface: z.enum([
      "public_rest",
      "public_mcp",
      "guide",
      "oauth",
      "account_mcp",
      "account_rest",
      "browser",
    ]),
    operation: z.enum(AGENT_OPERATIONS),
    outcome: z.enum([
      "ok",
      "invalid_request",
      "unsupported_service",
      "rejected",
      "rate_limited",
      "error",
      "blocked",
      "denied",
    ]),
    durationMs: z.number().finite().min(0).max(3_600_000),
    errorCode: z.enum(AGENT_ERROR_CODES).optional(),
    connectionId: z.string().uuid().optional(),
    requestId: z.string().uuid().optional(),
    contractType: z.enum(["new", "renewal", "unknown"]).optional(),
    missingRules: z.array(z.enum(AGENT_MISSING_RULES)).max(15).optional(),
    candidateCount: z.number().int().min(0).max(100).optional(),
  })
  .strict()
  .refine((value) => !value.requestId || Boolean(value.connectionId), {
    message: "request requires verified connection",
  });
export type AgentObservation = z.infer<typeof agentObservationSchema>;
export function agentErrorCode(
  value: unknown,
): (typeof AGENT_ERROR_CODES)[number] {
  return AGENT_ERROR_CODES.find((code) => code === value) ?? "other";
}
