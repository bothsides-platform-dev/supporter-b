import { eq } from 'drizzle-orm';
import { userAvatarBlobs } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { UserAvatarRepo, Tx } from '../types';

export class DrizzleUserAvatarRepository implements UserAvatarRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async find(
    userId: string,
    tx?: Tx,
  ): Promise<{ bytes: Buffer; mime: string } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ bytes: userAvatarBlobs.bytes, mime: userAvatarBlobs.mime })
      .from(userAvatarBlobs)
      .where(eq(userAvatarBlobs.userId, userId))
      .limit(1);
    if (!row) return undefined;
    // The bytea customType fromDriver already returns a Buffer, but normalise
    // defensively so callers never see a raw Uint8Array.
    return { bytes: Buffer.from(row.bytes), mime: row.mime };
  }

  async exists(userId: string, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .select({ userId: userAvatarBlobs.userId })
      .from(userAvatarBlobs)
      .where(eq(userAvatarBlobs.userId, userId))
      .limit(1);
    return rows.length > 0;
  }

  async upsert(
    userId: string,
    bytes: Buffer,
    mime: string,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .insert(userAvatarBlobs)
      .values({ userId, bytes, mime })
      .onConflictDoUpdate({
        target: userAvatarBlobs.userId,
        set: { bytes, mime, updatedAt: new Date() },
      });
  }

  async remove(userId: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(userAvatarBlobs).where(eq(userAvatarBlobs.userId, userId));
  }
}
