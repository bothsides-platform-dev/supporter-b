import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { appOrigins } from "@/lib/site-routing";

export const AGENT_SCOPES = ["requests:read", "requests:write"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];
export const ACCOUNT_MCP_PATH = "/api/agent/account/mcp";
export const ACCESS_TTL_SECONDS = 900;
export const CONNECTION_TTL_SECONDS = 30 * 24 * 3600;
export const agentChannelEnabled = () =>
  process.env.AGENT_ACCOUNT_CHANNEL_ENABLED === "true";
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const newSecret = () => randomBytes(32).toString("base64url");
export const agentAccountUrls = () => {
  const issuer = new URL(appOrigins().buyer).origin;
  return {
    issuer,
    resource: `${issuer}${ACCOUNT_MCP_PATH}`,
    metadata: `${issuer}/.well-known/oauth-protected-resource${ACCOUNT_MCP_PATH}`,
    authorize: `${issuer}/agent/authorize`,
    token: `${issuer}/api/agent/oauth/token`,
    register: `${issuer}/api/agent/oauth/register`,
    revoke: `${issuer}/api/agent/oauth/revoke`,
  };
};

// Registered callbacks are compared exactly. No remote metadata fetch or wildcard.
export function validAgentRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash || value.length > 2048)
      return false;
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export const registrationSchema = z
  .object({
    client_name: z.string().trim().min(1).max(100).default("코딩 에이전트"),
    redirect_uris: z.array(z.string().refine(validAgentRedirect)).min(1).max(5),
    grant_types: z
      .array(z.enum(["authorization_code", "refresh_token"]))
      .default(["authorization_code", "refresh_token"]),
    response_types: z.array(z.literal("code")).default(["code"]),
    token_endpoint_auth_method: z.literal("none").default("none"),
    scope: z.string().max(100).optional(),
  })
  .strip();

export function parseAgentScopes(value: string | undefined): AgentScope[] {
  const parts = [
    ...new Set((value ?? "requests:read").split(" ").filter(Boolean)),
  ];
  if (
    !parts.length ||
    parts.some((s) => !AGENT_SCOPES.includes(s as AgentScope))
  )
    throw new Error("invalid_scope");
  if (!parts.includes("requests:read")) throw new Error("invalid_scope");
  return parts as AgentScope[];
}

export const authorizationSchema = z
  .object({
    response_type: z.literal("code"),
    client_id: z.string().uuid(),
    redirect_uri: z.string().max(2048).refine(validAgentRedirect),
    code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code_challenge_method: z.literal("S256"),
    state: z.string().min(1).max(1024),
    resource: z.string().max(2048),
    scope: z.string().max(100).optional(),
  })
  .strict();
export type AgentAuthorization = z.infer<typeof authorizationSchema>;

export class AgentError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
  }
}
