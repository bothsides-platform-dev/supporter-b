import { auth } from "@/auth";
import { isSessionRevoked } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  checkGuestDraftRequestBoundary,
  checkGuestDraftRequestLimit,
  readGuestDraftBody,
  GUEST_DRAFT_COOKIE,
} from "@/lib/server/guest-rfp/draft-request";
import { getGuestRequestService } from "@/lib/server/services/guest-requests";
import { getGuestRequestRepo } from "@/lib/server/repositories/factory";
export const runtime = "nodejs";
const Input = z
  .object({
    op: z.enum([
      "recommend",
      "reserve",
      "bind",
      "status",
      "cancel",
      "effect",
      "list",
      "account",
    ]),
    id: z.string().uuid().optional(),
    revision: z.number().int().positive().optional(),
    pgId: z.string().uuid().optional(),
    days: z.union([z.literal(3), z.literal(5), z.literal(10)]).optional(),
    workspaceId: z.string().uuid().optional(),
  })
  .strict();
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(request: Request) {
  const denied = checkGuestDraftRequestBoundary(request);
  if (denied) return json({}, denied);
  try {
    const input = Input.parse(await readGuestDraftBody(request));
    const session = await auth();
    if (session?.user && (await isSessionRevoked(session)))
      return json({}, 401);
    // Authenticated account/ownership reads are regular app polling, not public intake.
    // Keep public reads and every reservation mutation on the existing abuse budget.
    const authenticatedRead = session?.user?.id &&
      (input.op === "account" || input.op === "list" || input.op === "status");
    if (!authenticatedRead) {
      const limited = checkGuestDraftRequestLimit(request);
      if (limited) return json({}, limited);
    }
    const secret = (await cookies()).get(GUEST_DRAFT_COOKIE)?.value;
    const userId = session?.user?.id;
    const workspaceId = input.workspaceId ?? session?.user?.workspaceId;
    const actor = userId && workspaceId ? { userId, workspaceId } : undefined;
    if (input.op === "account") {
      if (!userId) return json({ signedIn: false, workspaces: [] });
      return json({
        signedIn: true,
        email: session?.user?.email,
        workspaces: await (await getGuestRequestRepo()).workspaces(userId),
      });
    }
    if (!actor && !secret) return json({}, 401);
    const service = await getGuestRequestService();
    if (input.op === "list") {
      if (!actor) return json({}, 401);
      const rows = await (await getGuestRequestRepo()).owned(actor);
      return json(
        await Promise.all(rows.map((row) => service.status(row.id, { actor }))),
      );
    }
    if (!input.id) return json({}, 400);
    if (
      input.op === "recommend" ||
      input.op === "reserve" ||
      input.op === "bind" ||
      input.op === "cancel"
    ) {
      let proof:
        | { actor: { userId: string; workspaceId: string } }
        | { secret: string };
      if (actor) {
        try {
          await service.status(input.id, { actor });
          proof = { actor };
        } catch {
          if (!secret) return json({}, 401);
          proof = { secret };
        }
      } else {
        if (!secret) return json({}, 401);
        proof = { secret };
      }
      if (input.op === "cancel") {
        await service.cancel(input.id, proof);
        return json({ ok: true });
      }
      if (input.op === "recommend")
        return json(await service.recommend(input.id, proof));
      if (input.op === "reserve") {
        if (!input.revision || !input.pgId || !input.days) return json({}, 400);
        if (process.env.GUEST_RFP_AUTO_SEND_ENABLED !== "true")
          return json({ error: "AUTO_SEND_DISABLED" }, 503);
        await service.reserve(
          {
            id: input.id,
            revision: input.revision,
            pgId: input.pgId,
            days: input.days,
          },
          proof,
        );
      } else {
        if (!actor) return json({}, 401);
        await service.bind(input.id, secret ?? "", actor);
        if (process.env.GUEST_RFP_AUTO_SEND_ENABLED === "true")
          await service.dispatch(input.id);
      }
      return json({ ok: true });
    }
    if (input.op === "effect")
      return actor
        ? json({ claimed: await service.claimEffect(input.id, actor) })
        : json({}, 401);
    const access = actor ? { actor } : { secret: secret! };
    try {
      return json(await service.status(input.id, access));
    } catch (error) {
      if (actor && secret)
        return json(await service.status(input.id, { secret }));
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: "INVALID_INPUT" }, 400);
    const message = error instanceof Error ? error.message : "";
    return json(
      {
        error: /^(GUEST_|MATCHING_|INVALID_)/.test(message)
          ? message
          : "REQUEST_FAILED",
      },
      message === "BODY_TOO_LARGE"
        ? 413
        : /^(GUEST_|MATCHING_|INVALID_)/.test(message)
          ? 409
          : 500,
    );
  }
}
