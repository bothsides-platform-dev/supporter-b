import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { AgentError } from "./account-contract";
import { prepareAgentRequestInput } from "./request-input";
import {
  accountOutcome,
  observeAgentSummary,
  type AccountObservation,
} from "./account-http";
import { agentErrorCode } from "@/lib/analytics/agent-contract";
import { authenticateAgent } from "@/lib/server/services/agent-account";
import {
  prepareAgentRequest,
  readAgentRequest,
  recommendAgentPg,
  recommendAgentPgInput,
} from "@/lib/server/services/agent-request";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}
async function call(
  fn: () => Promise<unknown>,
  observation?: AccountObservation,
) {
  try {
    return result(await fn());
  } catch (error) {
    if (observation) {
      observation.errorCode =
        error instanceof AgentError
          ? agentErrorCode(error.code)
          : "temporarily_unavailable";
      observation.outcome = accountOutcome(
        error instanceof AgentError ? error.status : 503,
      );
    }
    return {
      ...result({
        error:
          error instanceof AgentError ? error.code : "temporarily_unavailable",
      }),
      isError: true,
    };
  }
}

// A request-local server closes over one bearer token; clients never share auth.
export function createAccountMcpHandler(
  token: string,
  observation?: AccountObservation,
) {
  return createMcpHandler(
    () => {
      const server = new McpServer(
        { name: "support-b-account", version: "0.1.0" },
        { capabilities: { tools: { listChanged: false } } },
      );
      server.registerTool(
        "get_connection",
        {
          inputSchema: z.object({}).strict(),
          annotations: readOnly,
          description:
            "Check the connected buyer workspace and granted permissions. Each connection is bound to one workspace.",
        },
        () =>
          call(async () => {
            const principal = await authenticateAgent(token);
            return {
              workspaceName: principal.workspaceName,
              scopes: principal.scopes,
              expiresAt: principal.connection.expiresAt.toISOString(),
            };
          }, observation),
      );
      server.registerTool(
        "recommend_pg",
        {
          inputSchema: recommendAgentPgInput,
          annotations: readOnly,
          description:
            "Get PG consultation candidates for the connected buyer using current industry policy. Select one PG. Provider review determines final terms.",
        },
        (input) =>
          call(async () => {
            const data = await recommendAgentPg(
              await authenticateAgent(token),
              input,
            );
            if (observation)
              observation.candidateCount = data.candidates.length;
            return data;
          }, observation),
      );
      server.registerTool(
        "prepare_request",
        {
          inputSchema: prepareAgentRequestInput,
          annotations: { ...readOnly, readOnlyHint: false },
          description:
            "Save or replace a PG consultation draft. Reuse requestKey after response loss. Updates require requestId and expectedRevision. Does not send to any PG. Return the browser review URL to the user for final confirmation; never open or submit that form on their behalf.",
        },
        (input) =>
          call(async () => {
            const summary = await prepareAgentRequest(token, input);
            if (observation) observeAgentSummary(observation, summary);
            return summary;
          }, observation),
      );
      server.registerTool(
        "get_request_status",
        {
          inputSchema: z.object({ requestId: z.string().uuid() }).strict(),
          annotations: readOnly,
          description:
            "Read a draft or consultation created by this connection. Returns progress and next action. Platform agreement signing is not evidence of the provider service contract.",
        },
        (input) =>
          call(async () => {
            const summary = await readAgentRequest(
              await authenticateAgent(token),
              input.requestId,
            );
            if (observation) observeAgentSummary(observation, summary);
            return summary;
          }, observation),
      );
      return server;
    },
    {
      legacy: "stateless",
      maxSubscriptions: 0,
      keepAliveMs: 0,
      maxRequestBodySize: 65_536,
    },
  );
}
