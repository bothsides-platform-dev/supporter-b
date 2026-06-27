import { pgTable, uuid, text, timestamp, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

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

export const userAvatarBlobs = pgTable('user_avatar_blobs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  bytes: bytea('bytes').notNull(),
  mime: text('mime').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
