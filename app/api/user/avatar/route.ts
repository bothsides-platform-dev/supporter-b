import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { getUserAvatarRepo, getUserRepo } from '@/lib/server/repositories/factory';
import { sniffMime } from '@/lib/server/storage/sniff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
// SVG는 의도적으로 제외(워크스페이스 로고와 동일한 XSS 사유).
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg']);

function fail(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'UNAUTHENTICATED');
  if (await isSessionRevoked(session)) return fail(401, 'UNAUTHENTICATED');
  if (await isEmailUnverified(session)) return fail(403, 'FORBIDDEN');
  const userId = session.user.id;

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

  await (await getUserAvatarRepo()).upsert(userId, buffer, sniffed);
  await (await getUserRepo()).setAvatarUpdatedAt(userId, new Date());

  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'UNAUTHENTICATED');
  if (await isSessionRevoked(session)) return fail(401, 'UNAUTHENTICATED');
  if (await isEmailUnverified(session)) return fail(403, 'FORBIDDEN');
  const userId = session.user.id;

  await (await getUserAvatarRepo()).remove(userId);
  await (await getUserRepo()).setAvatarUpdatedAt(userId, null);

  return NextResponse.json({ ok: true });
}
