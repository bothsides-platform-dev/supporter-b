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
      issuer: urls.issuer,
      authorization_endpoint: urls.authorize,
      token_endpoint: urls.token,
      registration_endpoint: urls.register,
      revocation_endpoint: urls.revoke,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: AGENT_SCOPES,
      authorization_response_iss_parameter_supported: true,
    });
  });
}
