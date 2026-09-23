import { cache } from "react";
import type { Session } from "next-auth";
import { getWorkspaceRepo } from "@/lib/server/repositories/factory";

// Request-local only: approval/suspension changes apply to the next request.
const findActiveWorkspace = cache(async (id: string) =>
  (await getWorkspaceRepo()).findActiveById(id),
);

/** Business requests require an existing active workspace, including operators. */
export async function isWorkspaceInactive(
  session: Session | null,
): Promise<boolean> {
  const id = session?.user?.workspaceId;
  return !id || !(await findActiveWorkspace(id));
}
