import { AgentError } from "@/lib/server/agent/account-contract";
import {
  accountBody,
  accountJson,
  serveAgentAccount,
} from "@/lib/server/agent/account-http";
import { exchangeAgentToken } from "@/lib/server/services/agent-account";
export const runtime = "nodejs";
export function POST(request: Request) {
  return serveAgentAccount(request, async () => {
    if (request.headers.has("authorization"))
      throw new AgentError("invalid_client", 401);
    const result = await exchangeAgentToken(await accountBody(request, "form"));
    return accountJson(result.body, result.status, { Pragma: "no-cache" });
  });
}
