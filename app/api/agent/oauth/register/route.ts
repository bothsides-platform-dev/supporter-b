import {
  accountBody,
  accountJson,
  serveAgentAccount,
} from "@/lib/server/agent/account-http";
import { registerAgentClient } from "@/lib/server/services/agent-account";

export const runtime = "nodejs";
let windowStart = 0;
let registered = 0;
export function POST(request: Request) {
  return serveAgentAccount(
    request,
    async () => {
      const now = Date.now();
      if (now - windowStart >= 3600_000 || now < windowStart) {
        windowStart = now;
        registered = 0;
      }
      if (++registered > 100)
        return accountJson({ error: "rate_limited" }, 429, {
          "Retry-After": "3600",
        });
      return accountJson(
        await registerAgentClient(await accountBody(request, "json")),
        201,
      );
    },
    { surface: "oauth", operation: "register" },
  );
}
