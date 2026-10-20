import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { isSessionRevoked } from "@/lib/auth/session";
import { GUEST_DRAFT_COOKIE } from "./draft-request";
import { guestSecretHash } from "@/lib/server/services/guest-drafts";
import { getGuestJourneyRepo } from "@/lib/server/repositories/factory";
import {
  guestJourneyEnabled,
  flushGuestJourneys,
} from "@/lib/server/services/guest-journey";
import type { JourneyInput } from "@/lib/guest-rfp/journey-contract";
export async function handleJourneyRequest(
  input: JourneyInput,
): Promise<Response> {
  if (!guestJourneyEnabled()) return Response.json({ enabled: false });
  const jar = await cookies();
  let secret = jar.get(GUEST_DRAFT_COOKIE)?.value;
  const session = await auth();
  const repo = await getGuestJourneyRepo();
  let actor: { userId: string; workspaceId: string } | null = null;
  if (session?.user) {
    if (
      !session.user.id ||
      !session.user.workspaceId ||
      session.user.isMaster ||
      session.user.workspaceType !== "buyer" ||
      (await isSessionRevoked(session))
    )
      return new Response(null, { status: 403 });
    actor = { userId: session.user.id, workspaceId: session.user.workspaceId };
    if (!(await repo.buyerAccess(actor, false)))
      return new Response(null, { status: 403 });
  }
  if (input.op === "start") {
    if (actor) return new Response(null, { status: 403 });
    const hadProof = !!secret;
    secret ||= randomBytes(32).toString("hex");
    jar.set(GUEST_DRAFT_COOKIE, secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 86400,
    });
    // A lost response before the cookie arrives must not commit an unclaimable root.
    if (!hadProof) return Response.json({ enabled: true, ready: false });
    const accepted = await repo.start(
      input.draftId,
      guestSecretHash(secret),
      input.attachmentCount,
      new Date(),
    );
    if (accepted) await flushGuestJourneys(1);
    return Response.json({ enabled: accepted });
  }
  if (input.op === "bind" && actor && !(await repo.buyerAccess(actor, true))) {
    // Signup-bound journeys remain observable during email verification/approval.
    if (!(await repo.isOwner(input.draftId, actor)))
      return new Response(null, { status: 403 });
  }
  const accepted = await repo.ingest(
    input,
    secret ? guestSecretHash(secret) : "",
    actor,
    new Date(),
  );
  return Response.json({ enabled: accepted }, { status: accepted ? 200 : 403 });
}
