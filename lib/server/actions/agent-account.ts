"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { agentBrowserActor } from "@/lib/server/agent/browser";
import { AgentError } from "@/lib/server/agent/account-contract";
import {
  authorizeAgent,
  revokeAgentConnection,
} from "@/lib/server/services/agent-account";
import { submitBrowserAgentRequest } from "@/lib/server/services/agent-request";

export async function authorizeAgentAction(
  query: unknown,
  workspaceId: string,
  form: FormData,
) {
  const { actor } = await agentBrowserActor(true);
  if (actor.workspaceId !== workspaceId)
    throw new AgentError("workspace_changed", 409);
  const url = await authorizeAgent(
    query,
    actor,
    form.get("decision") === "approve",
  );
  redirect(url);
}
export async function revokeAgentAction(id: string) {
  const { actor } = await agentBrowserActor(true);
  await revokeAgentConnection(id, actor);
  revalidatePath("/settings/agents");
}
export async function submitAgentRequestAction(id: string, revision: number) {
  const { actor } = await agentBrowserActor(true);
  let destination: string;
  try {
    const result = await submitBrowserAgentRequest(id, revision, actor);
    destination = `/rfp/${encodeURIComponent(result.rfpCode)}`;
  } catch (error) {
    const code =
      error instanceof AgentError && error.code === "revision_conflict"
        ? "changed"
        : "retry";
    destination = `/agent/requests/${encodeURIComponent(id)}?error=${code}`;
  }
  redirect(destination);
}
