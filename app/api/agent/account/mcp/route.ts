import { createAccountMcpHandler } from "@/lib/server/agent/account-mcp";
import {
  accountBody,
  accountJson,
  ACCOUNT_HEADERS,
  bearerToken,
  serveAgentAccount,
  type AccountObservation,
} from "@/lib/server/agent/account-http";
import {
  accountMcpOperation,
  mcpResponseFailed,
} from "@/lib/server/agent/mcp-observation";
import { AgentError } from "@/lib/server/agent/account-contract";
import { authenticateAgent } from "@/lib/server/services/agent-account";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  const observation: AccountObservation = {
    surface: "account_mcp",
    operation: "unknown",
  };
  return serveAgentAccount(
    request,
    async () => {
      const token = bearerToken(request);
      const principal = await authenticateAgent(token);
      observation.connectionId = principal.connection.id;
      const message = await accountBody(request, "json");
      observation.operation = accountMcpOperation(message);
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
      // Merge tool details only if the exchange finishes before its deadline.
      // A late tool can still settle after abort without changing the timeout event.
      const handlerObservation = { ...observation };
      const handler = createAccountMcpHandler(token, handlerObservation);
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          observation.errorCode = "timeout";
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
            if (
              response.ok &&
              !handlerObservation.outcome &&
              (await mcpResponseFailed(
                new Response(response.status === 202 ? null : body, {
                  status: response.status,
                  headers: response.headers,
                }),
              ))
            ) {
              handlerObservation.outcome = "invalid_request";
              handlerObservation.errorCode = "invalid_request";
            }
            return { response, body };
          })(),
        ]);
        Object.assign(observation, handlerObservation);
        const headers = new Headers(result.response.headers);
        for (const [key, value] of Object.entries(ACCOUNT_HEADERS))
          headers.set(key, value);
        return new Response(
          result.response.status === 202 ? null : result.body,
          {
            status: result.response.status,
            headers,
          },
        );
      } finally {
        clearTimeout(timer);
        await handler.close();
      }
    },
    observation,
  );
}
export function GET(request: Request) {
  const observation: AccountObservation = {
    surface: "account_mcp",
    operation: "unknown",
  };
  return serveAgentAccount(
    request,
    async () => {
      const principal = await authenticateAgent(bearerToken(request));
      observation.connectionId = principal.connection.id;
      observation.errorCode = "method_not_allowed";
      return accountJson({ error: "method_not_allowed" }, 405, {
        Allow: "POST",
      });
    },
    observation,
  );
}
export const DELETE = GET;
