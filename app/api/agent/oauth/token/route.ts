import { AgentError } from "@/lib/server/agent/account-contract";
import {
  accountBody,
  accountJson,
  serveAgentAccount,
  type AccountObservation,
} from "@/lib/server/agent/account-http";
import { agentErrorCode } from "@/lib/analytics/agent-contract";
import { exchangeAgentToken } from "@/lib/server/services/agent-account";
export const runtime = "nodejs";
export function POST(request: Request) {
  const observation: AccountObservation = {
    surface: "oauth",
    operation: "token",
  };
  return serveAgentAccount(
    request,
    async () => {
      if (request.headers.has("authorization"))
        throw new AgentError("invalid_client", 401);
      const body = await accountBody(request, "form");
      if (
        body &&
        typeof body === "object" &&
        "grant_type" in body &&
        body.grant_type === "refresh_token"
      )
        observation.operation = "refresh";
      const result = await exchangeAgentToken(body);
      if (result.connectionId) observation.connectionId = result.connectionId;
      if (result.status >= 400)
        observation.errorCode = agentErrorCode(result.body.error);
      return accountJson(result.body, result.status, { Pragma: "no-cache" });
    },
    observation,
  );
}
