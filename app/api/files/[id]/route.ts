/**
 * GET /api/files/{id} — authenticated download.
 *
 * Auth: `auth()` required. 401 if no session.
 *
 * ACL: delegated to `canAccessAttachment` (storage/permissions.ts) so
 * the same matrix applies to every read site (preview iframe, download
 * link, future inbox export). Result codes:
 *   - 401 unauthenticated
 *   - 403 authenticated but not allowed
 *   - 404 row not found
 *   - 416 invalid/unsatisfiable Range
 *
 * Headers:
 *   - Content-Type: from `attachment.mime_type` (sniffed at upload).
 *   - Content-Length: byte count of the response body (full or sliced).
 *   - Content-Disposition: `inline; filename="..."`. Never `attachment`
 *     for v0 — preview iframes need inline.
 *   - ETag: `"<attachment-id>"`. Attachment rows are immutable in v0, so
 *     the row id is a stable strong validator. Browser sends it back via
 *     `If-None-Match` and the route returns 304 — but only after ACL
 *     passes, so revoked access can't be bypassed from a stale cache.
 *   - Accept-Ranges: `bytes` (signals Range support to the PDF viewer).
 *   - Cache-Control: `private, max-age=0, must-revalidate`. Browser may
 *     keep the bytes but must revalidate on every use; ACL runs server-
 *     side before any 304. `private` keeps shared caches (CDN/proxy)
 *     from holding personal documents.
 *
 * Range support:
 *   - `bytes=N-M` (inclusive), `bytes=N-`, and `bytes=-M` (suffix length)
 *     are honored — sufficient for browser PDF viewers' incremental
 *     loading. Multi-range (comma-separated) falls through to 200.
 *
 * v0 limits:
 *   - No orphan cleanup — rows whose storage object is missing return
 *     410 so the UI can render a "missing" state (rare; v1 cron sweeper).
 */
import { auth } from '@/auth';
import { getAttachmentRepo } from '@/lib/server/repositories/factory';
import {
  canAccessAttachment,
  type RepoBundleForAttachment,
} from '@/lib/server/storage/permissions';
import { getStorage } from '@/lib/server/storage';
import { db as prodDb } from '@/lib/db/client';
import { getInvitationRepo } from '@/lib/server/repositories/factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

declare global {
   
  var __bidit_files_db_override__: unknown | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function routeDb(): any {
  return globalThis.__bidit_files_db_override__ ?? prodDb;
}

function fail(status: number, msg: string): Response {
  return new Response(msg, { status });
}

// RFC 5987 / 6266 — emit a Content-Disposition value that survives both
// HTTP header (ByteString-only) and non-ASCII filenames. We always pair
// an ASCII fallback (`filename="..."`) with a percent-encoded UTF-8
// `filename*` so modern browsers display the original name. Without the
// `filename*` arm, fetch's `Response` constructor throws
// `Cannot convert argument to a ByteString` for any Korean/CJK name.
function dispositionFilenameHeader(name: string): string {
  const safe = name.replace(/[\x00-\x1f"\\]/g, '').slice(0, 200) || 'file';
  const ascii = safe.replace(/[^\x20-\x7E]/g, '_');
  const utf8 = encodeURIComponent(safe);
  return `inline; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

// Parse a single-range `Range: bytes=N-M` header. Returns:
//   - null: no Range / not byte-range / multi-range (caller serves 200)
//   - { start, end }: validated inclusive range satisfiable against `size`
//   - 'unsatisfiable': syntactically valid but outside file bounds
//     (caller must return 416 with `Content-Range: bytes */size`)
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const rawStart = match[1];
  const rawEnd = match[2];
  if (rawStart === '' && rawEnd === '') return null;
  let start: number;
  let end: number;
  if (rawStart === '') {
    // Suffix: bytes=-N → last N bytes
    const len = Number(rawEnd);
    if (!Number.isFinite(len) || len <= 0) return 'unsatisfiable';
    start = Math.max(0, size - len);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || start >= size || end < start) return 'unsatisfiable';
  if (end >= size) end = size - 1;
  return { start, end };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return fail(401, 'Unauthorized');

  const { id } = await ctx.params;
  if (!id) return fail(400, 'Bad Request');

  const repo = await getAttachmentRepo();
  const att = await repo.findById(id);
  if (!att) return fail(404, 'Not Found');

  const repos: RepoBundleForAttachment = {
    invitation: await getInvitationRepo(),
  };

  const allowed = await canAccessAttachment(
    routeDb(),
    att,
    {
      user: {
        id: session.user.id,
        workspaceId: (session.user as { workspaceId?: string }).workspaceId,
        workspaceType: (
          session.user as { workspaceType?: 'buyer' | 'pg' }
        ).workspaceType,
      },
    },
    repos,
  );
  if (!allowed) return fail(403, 'Forbidden');

  // Strong validator — attachment rows are immutable in v0 so id alone is
  // a stable ETag. Anything that changes the bytes also mints a new row.
  const etag = `"${att.id}"`;

  // If-None-Match runs *after* ACL by design (above): a revoked user must
  // never get 304 from a cached representation they no longer can see.
  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  }

  // Parse Range against the attachment row's `size` — the row's size is
  // the authoritative byte count recorded at upload (files are immutable
  // in v0). Reading from the row lets us decide on Range *before* opening
  // the storage stream, so we never double-fetch (matters for backends
  // like Supabase whose `read()` materialises the whole blob).
  const totalSize = att.size;
  const range = parseRange(req.headers.get('range'), totalSize);

  if (range === 'unsatisfiable') {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: {
        'Content-Range': `bytes */${totalSize}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  let body: ReadableStream<Uint8Array>;
  try {
    const r = await getStorage().read(
      att.storagePath,
      range ? { start: range.start, end: range.end } : undefined,
    );
    body = r.stream;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return fail(410, 'Gone');
    }
    throw err;
  }

  const sharedHeaders = {
    'Content-Type': att.mimeType,
    'Content-Disposition': dispositionFilenameHeader(att.name),
    ETag: etag,
    'Accept-Ranges': 'bytes',
    // Browser may keep the bytes (private — never shared caches), but
    // must revalidate every use via If-None-Match. ACL is enforced
    // before 304 above so revoked access cannot be served from cache.
    'Cache-Control': 'private, max-age=0, must-revalidate',
  } satisfies Record<string, string>;

  if (range) {
    const len = range.end - range.start + 1;
    return new Response(body, {
      status: 206,
      headers: {
        ...sharedHeaders,
        'Content-Length': String(len),
        'Content-Range': `bytes ${range.start}-${range.end}/${totalSize}`,
      },
    });
  }

  return new Response(body, {
    status: 200,
    headers: {
      ...sharedHeaders,
      'Content-Length': String(totalSize),
    },
  });
}
