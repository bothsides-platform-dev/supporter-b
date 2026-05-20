import { pgTable, uuid, text, timestamp, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { attachments } from './attachments';

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

// Attachment payload bytes (C4) — 1:1 with attachments, keyed by attachment_id
// with ON DELETE CASCADE so deleting an attachment auto-removes its bytes (no
// orphans). Bytes stay in a separate table so metadata scans never touch the
// bytea column. Upload writes the attachment metadata row first, then the blob.
export const attachmentBlobs = pgTable('attachment_blobs', {
  attachmentId: uuid('attachment_id')
    .primaryKey()
    .references(() => attachments.id, { onDelete: 'cascade' }),
  mime: text('mime').notNull(),
  bytes: bytea('bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
