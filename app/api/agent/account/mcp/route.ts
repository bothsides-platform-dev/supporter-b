import { createAccountMcpHandler } from "@/lib/server/agent/account-mcp";
import {
  accountBody,
  accountJson,
  ACCOUNT_HEADERS,
  bearerToken,
  serveAgentAccount,
} from "@/lib/server/agent/account-http";
import { AgentError } from "@/lib/server/agent/account-contract";
import { authenticateAgent } from "@/lib/server/services/agent-account";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return serveAgentAccount(request, async () => {
    const token = bearerToken(request);
    await authenticateAgent(token);
    const message = await accountBody(request, "json");
    if (!message || typeof message !== "object" || Array.isArray(message))
      throw new AgentError("invalid_request");
    if (
      "method" in message &&
      message.method === "tools/call" &&
      "params" in message &&
      message.params &&
      typeof message.params === "object" &&
      "name" in message.params &&
      message.params.name === "prepare_request"
    ) {
      await authenticateAgent(token, "requests:write");
    }
    const handler = createAccountMcpHandler(token);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AgentError("temporarily_unavailable", 503));
      }, 10_000);
    });
    try {
      const result = await Promise.race([
        timeout,
        (async () => {
          const response = await handler.fetch(
            new Request(request.url, {
              method: "POST",
              headers: request.headers,
              body: JSON.stringify(message),
              signal: AbortSignal.any([request.signal, controller.signal]),
            }),
          );
          const body = await response.text();
          return { response, body };
        })(),
      ]);
      const headers = new Headers(result.response.headers);
      for (const [key, value] of Object.entries(ACCOUNT_HEADERS))
        headers.set(key, value);
      return new Response(result.response.status === 202 ? null : result.body, {
        status: result.response.status,
        headers,
      });
    } finally {
      clearTimeout(timer);
      await handler.close();
    }
  });
}
export function GET(request: Request) {
  return serveAgentAccount(request, async () => {
    await authenticateAgent(bearerToken(request));
    return accountJson({ error: "method_not_allowed" }, 405, { Allow: "POST" });
  });
}
export const DELETE = GET;
