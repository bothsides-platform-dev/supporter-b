"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBuyerActor } from "@/lib/server/actions/_session";
import { getPlatformAgreementService } from "@/lib/server/services/platform-agreement";
import { PlatformAgreementDraftSchema } from "@/lib/types/platform-agreement";
const Id = z.object({ contractId: z.uuid() }).strict();
const Save = Id.extend({
  revision: z.number().int().nonnegative(),
  parties: PlatformAgreementDraftSchema,
}).strict();
const Send = Id.extend({ stamp: z.string().min(1).max(64) }).strict();
export async function loadPlatformAgreementAction(input: z.infer<typeof Id>) {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;
  const parsed = Id.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" };
  return (await getPlatformAgreementService()).load(
    parsed.data.contractId,
    actor,
  );
}
export async function savePlatformAgreementAction(input: z.infer<typeof Save>) {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;
  const parsed = Save.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" };
  const result = await (
    await getPlatformAgreementService()
  ).save(
    parsed.data.contractId,
    actor,
    parsed.data.revision,
    parsed.data.parties,
  );
  if (result.ok) {
    revalidatePath("/rfp", "layout");
    revalidatePath("/home");
  }
  return result;
}
export async function sendPlatformAgreementAction(input: z.infer<typeof Send>) {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;
  const parsed = Send.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" };
  const result = await (
    await getPlatformAgreementService()
  ).send(parsed.data.contractId, actor, parsed.data.stamp);
  if (result.ok) {
    revalidatePath("/rfp", "layout");
    revalidatePath("/home");
  }
  return result;
}
