import {
  accountJson,
  bearerToken,
  serveAgentAccount,
  observeAgentSummary,
  type AccountObservation,
} from "@/lib/server/agent/account-http";
import { authenticateAgent } from "@/lib/server/services/agent-account";
import { readAgentRequest } from "@/lib/server/services/agent-request";
export const runtime = "nodejs";
export function GET(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const observation: AccountObservation = {
    surface: "account_rest",
    operation: "get_request_status",
  };
  return serveAgentAccount(
    request,
    async () => {
      const principal = await authenticateAgent(bearerToken(request));
      observation.connectionId = principal.connection.id;
      const summary = await readAgentRequest(
        principal,
        (await context.params).requestId,
      );
      observeAgentSummary(observation, summary);
      return accountJson(summary);
    },
    observation,
  );
}
