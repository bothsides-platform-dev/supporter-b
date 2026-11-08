import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireBuyerSession } from "@/lib/auth/session";
import {
  AgentError,
  agentAccountUrls,
  agentChannelEnabled,
} from "./account-contract";
import { getAgentRepo } from "@/lib/server/repositories/factory";

export async function agentBrowserActor(mutation = false) {
  if (!agentChannelEnabled()) throw new AgentError("not_found", 404);
  const h = await headers();
  const origin = agentAccountUrls().issuer;
  if (h.get("host")?.toLowerCase() !== new URL(origin).host.toLowerCase()) {
    throw new AgentError("wrong_origin", 404);
  }
  if (mutation && h.get("origin") !== origin)
    throw new AgentError("access_denied", 403);
  const session = await requireBuyerSession();
  const actor = {
    userId: session.user.id,
    workspaceId: session.user.workspaceId,
  };
  const member = await (
    await getAgentRepo()
  ).member(actor.userId, actor.workspaceId);
  if (!member) throw new AgentError("access_denied", 403);
  return { actor, workspaceName: member.name };
}

/** Page-only error presentation. Mutations keep the strict, throwing guard. */
export async function agentBrowserPageActor() {
  try {
    return { ok: true as const, ...(await agentBrowserActor()) };
  } catch (error) {
    if (error instanceof AgentError) {
      if (error.code === "not_found") notFound();
      if (error.code === "wrong_origin")
        return {
          ok: false as const,
          reason: "wrong_origin" as const,
          origin: agentAccountUrls().issuer,
          currentHost: (await headers()).get("host") ?? "",
        };
      if (error.code === "access_denied")
        return { ok: false as const, reason: "access_denied" as const };
    }
    if (error instanceof Error && error.message === "FORBIDDEN_BUYER")
      return { ok: false as const, reason: "access_denied" as const };
    throw error;
  }
}

/** Only the configured origin and a caller-owned page path form the destination. */
export function agentBrowserRecoveryUrl(
  path: "/agent/authorize" | "/settings/agents" | `/agent/requests/${string}`,
  query: Record<string, string | string[] | undefined> = {},
) {
  const url = new URL(agentAccountUrls().issuer);
  url.pathname = path;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value])
      url.searchParams.append(key, item);
  }
  return url.href;
}
