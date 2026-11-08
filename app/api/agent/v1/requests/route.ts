import {
  accountBody,
  accountJson,
  bearerToken,
  serveAgentAccount,
  observeAgentSummary,
  type AccountObservation,
} from "@/lib/server/agent/account-http";
import { authenticateAgent } from "@/lib/server/services/agent-account";
import { prepareAgentRequest } from "@/lib/server/services/agent-request";
export const runtime = "nodejs";
export function POST(request: Request) {
  const observation: AccountObservation = {
    surface: "account_rest",
    operation: "prepare_request",
  };
  return serveAgentAccount(
    request,
    async () => {
      const token = bearerToken(request);
      const principal = await authenticateAgent(token, "requests:write");
      observation.connectionId = principal.connection.id;
      const summary = await prepareAgentRequest(
        token,
        await accountBody(request, "json"),
      );
      observeAgentSummary(observation, summary);
      return accountJson(summary);
    },
    observation,
  );
}
