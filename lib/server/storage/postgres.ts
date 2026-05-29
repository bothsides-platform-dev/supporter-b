import { eq } from 'drizzle-orm';
import { attachmentBlobs } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { ReadRange, Storage } from './types';

class EnoentError extends Error {
  code = 'ENOENT' as const;
  constructor(key: string) {
    super(`PostgresStorage: no object at key ${key}`);
  }
}

/**
 * Postgres bytea-backed Storage. Attachment bytes live in `attachment_blobs`
 * keyed by `attachment_id` (C4) with a FK cascade, so the whole stack runs on
 * one Postgres with no external object store and deleting an attachment auto-
 * removes its bytes. `read()` materialises the whole blob and slices in memory
 * — fine under the route's 20MB cap, and keeps `size` reporting the total byte
 * count for Content-Range. The storage `key` is the attachment id.
 *
 * ── SCALING CEILING (known debt, acceptable at M0) ───────────────────────────
 * Every `read()` materialises the FULL blob into a Uint8Array even for Range
 * requests — there is no streaming straight off bytea. At the 20MB/file cap this
 * is bounded per request, but the cost is per CONCURRENT request: N simultaneous
 * 20MB reads ≈ N×20MB of serverless heap, which is the real limit (not file
 * size). Bytea also bloats the primary DB, inflating backup/restore time and
 * coupling attachment volume to DB storage.
 *
 * MIGRATION TRIGGER — move attachment bytes to an external object store (S3 /
 * R2 / Supabase Storage, served via signed URL) when ANY of:
 *   • the attachment_blobs table approaches ~a few GB, or
 *   • concurrent large-file reads cause function memory pressure / OOM, or
 *   • the per-file cap is raised above ~20MB.
 * `getStorage()` already hides the backend, so only this class + the metadata
 * row's URL resolution change; routes keep calling the Storage interface.
 */
export class PostgresStorage implements Storage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  async save(key: string, buffer: Buffer, mime: string): Promise<void> {
    // key === attachments.id (C4). The metadata row must already exist (FK),
    // so callers write the attachment row before saving its bytes.
    await this._db
      .insert(attachmentBlobs)
      .values({ attachmentId: key, mime, bytes: buffer })
      .onConflictDoUpdate({
        target: attachmentBlobs.attachmentId,
        set: { mime, bytes: buffer },
      });
  }

  async read(
    key: string,
    range?: ReadRange,
  ): Promise<{ stream: ReadableStream<Uint8Array>; size: number }> {
    const [row] = await this._db
      .select({ bytes: attachmentBlobs.bytes })
      .from(attachmentBlobs)
      .where(eq(attachmentBlobs.attachmentId, key))
      .limit(1);
    if (!row) throw new EnoentError(key);

    const bytes = new Uint8Array(row.bytes);
    const total = bytes.byteLength;
    const slice =
      range && (range.start !== undefined || range.end !== undefined)
        ? bytes.slice(
            range.start ?? 0,
            range.end === undefined ? total : range.end + 1,
          )
        : bytes;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(slice);
        controller.close();
      },
    });
    return { stream, size: total };
  }

  async delete(key: string): Promise<void> {
    await this._db
      .delete(attachmentBlobs)
      .where(eq(attachmentBlobs.attachmentId, key));
  }
}
