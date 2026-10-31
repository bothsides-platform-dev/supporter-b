import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { quoteContextSchema } from '@/lib/guest-rfp/quote-context';
import {
  guestAnswersSchema,
  guestFileInputSchema,
} from "@/lib/guest-rfp/answers";
import {
  checkGuestDraftRequest,
  readGuestDraftBody,
  GUEST_DRAFT_COOKIE,
} from "@/lib/server/guest-rfp/draft-request";
import { getGuestDraftService } from "@/lib/server/services/guest-drafts";
import { getStorage } from "@/lib/server/storage";
export const runtime = "nodejs";
const Input = z.discriminatedUnion("op", [
  z.object({ op: z.literal("session") }).strict(),
  z.object({ op: z.literal('read'), id: z.string().uuid() }).strict(),
  z
    .object({
      op: z.literal("save"),
      id: z.string().uuid(),
      revision: z.number().int().min(0),
      answers: guestAnswersSchema,
      quoteContext: quoteContextSchema.optional(),
      files: z
        .array(z.string().uuid())
        .max(5)
        .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict(),
  z
    .object({
      op: z.literal("file"),
      id: z.string().uuid(),
      file: guestFileInputSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal("complete"),
      id: z.string().uuid(),
      fileId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      op: z.literal("finish"),
      id: z.string().uuid(),
      revision: z.number().int().min(1),
    })
    .strict(),
]);
export async function POST(request: Request) {
  const denied = checkGuestDraftRequest(request);
  if (denied) return new Response(null, { status: denied });
  try {
    const parsed = Input.safeParse(await readGuestDraftBody(request));
    if (!parsed.success) return new Response(null, { status: 400 });
    const input = parsed.data,
      jar = await cookies();
    let secret = jar.get(GUEST_DRAFT_COOKIE)?.value;
    if (input.op === "session") {
      secret ||= randomBytes(32).toString("hex");
      jar.set(GUEST_DRAFT_COOKIE, secret, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 86400,
      });
      return Response.json({ ok: true });
    }
    if (!secret) return new Response(null, { status: 403 });
    const service = await getGuestDraftService();
    if (input.op === 'read') return Response.json(await service.readPublic(input.id, secret), { headers: { 'Cache-Control': 'no-store' } });
    if (input.op === "save")
      return Response.json(await service.savePublic(input, secret));
    if (input.op === "file") {
      const file = await service.reservePublicFile(
        input.id,
        secret,
        input.file,
      );
      if (file.status === "ready")
        return Response.json({ id: file.id, ready: true });
      const uploadUrl = await getStorage().presignPut(`pending/${file.id}`, {
        mime: file.mime,
        size: file.size,
        expiresInSeconds: 600,
      });
      return Response.json({ id: file.id, uploadUrl });
    }
    if (input.op === "finish")
      return Response.json(
        await service.finishPublic(input.id, secret, input.revision),
      );
    const result = await service.completePublicFile(
      input.id,
      secret,
      input.fileId,
    );
    return Response.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return Response.json(
      { error: message.startsWith("GUEST_") ? message : "SAVE_FAILED" },
      {
        status:
          message === "BODY_TOO_LARGE"
            ? 413
            : message.startsWith("GUEST_")
              ? 409
              : error instanceof SyntaxError
                ? 400
                : 500,
      },
    );
  }
}
