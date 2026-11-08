import {
  accountBody,
  accountJson,
  bearerToken,
  serveAgentAccount,
} from "@/lib/server/agent/account-http";
import { authenticateAgent } from "@/lib/server/services/agent-account";
import { prepareAgentRequest } from "@/lib/server/services/agent-request";
export const runtime = "nodejs";
export function POST(request: Request) {
  return serveAgentAccount(request, async () => {
    const token = bearerToken(request);
    await authenticateAgent(token, "requests:write");
    return accountJson(
      await prepareAgentRequest(token, await accountBody(request, "json")),
    );
  });
}
