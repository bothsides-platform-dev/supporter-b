import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { attachmentOwnerKindEnum } from './_enums';
import { users } from './users';

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerKind: attachmentOwnerKindEnum('owner_kind').notNull(),
  // Polymorphic owner — owner_id is a string because RFP ids are text (P-YYMM-NNNN).
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  size: integer('size').notNull(),
  mimeType: text('mime_type').notNull(),
  storagePath: text('storage_path').notNull(),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().default(sql`now()`),
});
