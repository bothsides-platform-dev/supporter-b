import {
  accountJson,
  bearerToken,
  serveAgentAccount,
} from "@/lib/server/agent/account-http";
import { authenticateAgent } from "@/lib/server/services/agent-account";
import { readAgentRequest } from "@/lib/server/services/agent-request";
export const runtime = "nodejs";
export function GET(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  return serveAgentAccount(request, async () =>
    accountJson(
      await readAgentRequest(
        await authenticateAgent(bearerToken(request)),
        (await context.params).requestId,
      ),
    ),
  );
}
