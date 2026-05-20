import { pgTable, text, timestamp, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// bytea column. postgres-js returns bytea as a Buffer; pglite returns a
// Uint8Array. Normalize on read so callers always get a Buffer regardless
// of driver.
const bytea = customType<{
  data: Buffer;
  driverData: Buffer | Uint8Array;
  default: false;
}>({
  dataType() {
    return 'bytea';
  },
  fromDriver(value) {
    return Buffer.from(value as Uint8Array);
  },
});

// Attachment payload bytes, keyed by the storage path produced by
// `newAttachmentPath`. The `attachments` table holds metadata + this path;
// the bytes live here so the whole stack runs on Postgres with no external
// object store. There is no FK to `attachments` — the path is the join key
// and uploads write the blob before the metadata row exists.
export const attachmentBlobs = pgTable('attachment_blobs', {
  path: text('path').primaryKey(),
  mime: text('mime').notNull(),
  bytes: bytea('bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
