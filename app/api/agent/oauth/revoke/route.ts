import { z } from "zod";
import { AgentError } from "@/lib/server/agent/account-contract";
import {
  accountBody,
  accountJson,
  serveAgentAccount,
} from "@/lib/server/agent/account-http";
import { revokeAgentToken } from "@/lib/server/services/agent-account";
export const runtime = "nodejs";
export function POST(request: Request) {
  return serveAgentAccount(
    request,
    async () => {
      const parsed = z
        .object({
          token: z.string().max(256),
          client_id: z.string().uuid(),
          token_type_hint: z.string().optional(),
        })
        .strict()
        .safeParse(await accountBody(request, "form"));
      if (!parsed.success) throw new AgentError("invalid_request");
      await revokeAgentToken(parsed.data.token, parsed.data.client_id);
      return accountJson({});
    },
    { surface: "oauth", operation: "revoke" },
  );
}
