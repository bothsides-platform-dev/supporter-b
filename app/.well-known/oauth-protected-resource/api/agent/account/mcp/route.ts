import {
  agentAccountUrls,
  AGENT_SCOPES,
} from "@/lib/server/agent/account-contract";
import {
  accountJson,
  serveAgentAccount,
} from "@/lib/server/agent/account-http";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return serveAgentAccount(request, () => {
    const urls = agentAccountUrls();
    return accountJson({
      resource: urls.resource,
      authorization_servers: [urls.issuer],
      scopes_supported: AGENT_SCOPES,
      bearer_methods_supported: ["header"],
    });
  });
}
