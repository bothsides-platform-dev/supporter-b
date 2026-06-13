import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { isSessionRevoked } from '@/lib/auth/session';
import { workspaces, workspaceLogoBlobs } from '@/lib/db/schema';
import { db as prodDb } from '@/lib/db/client';
import { sniffMime } from '@/lib/server/storage/sniff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg']);

declare global {
  // eslint-disable-next-line no-var -- global augmentation requires var
  var __bidit_avatar_db_override__: unknown | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function routeDb(): any {
  return globalThis.__bidit_avatar_db_override__ ?? prodDb;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function __setAvatarDbForTest(db: any | undefined): void {
  globalThis.__bidit_avatar_db_override__ = db;
}

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  const db = routeDb();

  const [row] = await db
    .select()
    .from(workspaceLogoBlobs)
    .where(eq(workspaceLogoBlobs.workspaceId, id))
    .limit(1);

  if (!row) return fail(404, 'NOT_FOUND');

  return new Response(row.bytes, {
    headers: {
      'Content-Type': row.mime,
      'Content-Length': String(row.bytes.length),
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

export async function POST(req: Request, ctx: RouteContext): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'UNAUTHENTICATED');

  // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
  if (await isSessionRevoked(session)) return fail(401, 'UNAUTHENTICATED');

  const { id } = await ctx.params;
  const wsId = (session.user as { workspaceId?: string }).workspaceId;
  if (wsId !== id) return fail(403, 'FORBIDDEN');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'INVALID_MULTIPART');
  }

  const rawFile = form.get('file');
  if (!(rawFile instanceof File)) return fail(400, 'FILE_REQUIRED');

  if (rawFile.size <= 0) return fail(400, 'EMPTY_FILE');
  if (rawFile.size > MAX_BYTES) return fail(413, 'FILE_TOO_LARGE');

  if (!ALLOWED_MIMES.has(rawFile.type)) return fail(415, 'MIME_NOT_ALLOWED');

  const buffer = Buffer.from(await rawFile.arrayBuffer());
  const sniffed = sniffMime(buffer);
  if (!sniffed || sniffed !== rawFile.type) return fail(415, 'MIME_MISMATCH');

  const db = routeDb();
  await db
    .insert(workspaceLogoBlobs)
    .values({ workspaceId: id, bytes: buffer, mime: sniffed })
    .onConflictDoUpdate({
      target: workspaceLogoBlobs.workspaceId,
      set: { bytes: buffer, mime: sniffed, updatedAt: new Date() },
    });

  await db
    .update(workspaces)
    .set({ hasLogo: true })
    .where(eq(workspaces.id, id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: RouteContext,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'UNAUTHENTICATED');

  // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
  if (await isSessionRevoked(session)) return fail(401, 'UNAUTHENTICATED');

  const { id } = await ctx.params;
  const wsId = (session.user as { workspaceId?: string }).workspaceId;
  if (wsId !== id) return fail(403, 'FORBIDDEN');

  const db = routeDb();
  await db
    .delete(workspaceLogoBlobs)
    .where(eq(workspaceLogoBlobs.workspaceId, id));

  await db
    .update(workspaces)
    .set({ hasLogo: false })
    .where(eq(workspaces.id, id));

  return NextResponse.json({ ok: true });
}
