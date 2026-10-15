"use server";
import { z } from "zod";
import { requireBuyerActor } from "./_session";
import { getGuestDraftService } from "@/lib/server/services/guest-drafts";
import {
  guestAnswersSchema,
  type ServerGuestDraft,
  type GuestAnswers,
} from "@/lib/guest-rfp/answers";
import type { Actor } from "@/lib/server/services/types";
import type { ActionResult } from "./_result";
const Identity = z
  .object({ id: z.string().uuid(), revision: z.number().int().min(1) })
  .strict();
const Save = Identity.extend({
  answers: guestAnswersSchema,
  files: z.array(z.string().uuid()).max(5),
}).strict();
async function access(expected: Actor) {
  const actor = await requireBuyerActor();
  if (!actor.ok) throw new Error(actor.error);
  if (
    actor.userId !== expected.userId ||
    actor.workspaceId !== expected.workspaceId
  )
    throw new Error("WORKSPACE_CHANGED");
  return actor;
}
function failure(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : "";
  return {
    ok: false,
    error:
      message.startsWith("GUEST_") ||
      message === "WORKSPACE_CHANGED" ||
      message === "FORBIDDEN_BUYER"
        ? message
        : "SAVE_FAILED",
  };
}
export async function resumeServerGuestDraftAction(
  id: string,
  expected: Actor,
): Promise<ActionResult<{ draft: ServerGuestDraft }>> {
  try {
    const actor = await access(expected);
    return {
      ok: true,
      draft: await (
        await getGuestDraftService()
      ).resumeOwned(z.string().uuid().parse(id), actor),
    };
  } catch (e) {
    return failure(e);
  }
}
export async function saveServerGuestDraftAction(
  input: {
    id: string;
    revision: number;
    answers: GuestAnswers;
    files: string[];
  },
  expected: Actor,
): Promise<ActionResult<{ revision: number }>> {
  try {
    const actor = await access(expected);
    return {
      ok: true,
      ...(await (
        await getGuestDraftService()
      ).saveOwned(Save.parse(input), actor)),
    };
  } catch (e) {
    return failure(e);
  }
}
export async function deleteServerGuestDraftAction(
  input: { id: string; revision: number },
  expected: Actor,
): Promise<ActionResult> {
  try {
    const actor = await access(expected);
    const parsed = Identity.parse(input);
    await (
      await getGuestDraftService()
    ).deleteOwned(parsed.id, parsed.revision, actor);
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function dismissServerGuestResumeAction(
  expected: Actor,
): Promise<ActionResult> {
  try {
    const actor = await access(expected);
    await (await getGuestDraftService()).dismissAutomaticResume(actor);
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
