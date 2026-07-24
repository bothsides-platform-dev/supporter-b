import { eq } from 'drizzle-orm';
import { workspaceLogoBlobs } from '@/lib/db/schema';
import type { WorkspaceLogoRepo, Tx } from '../types';

export class DrizzleWorkspaceLogoRepository implements WorkspaceLogoRepo {

  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async find(
    workspaceId: string,
    tx?: Tx,
  ): Promise<{ bytes: Buffer; mime: string } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ bytes: workspaceLogoBlobs.bytes, mime: workspaceLogoBlobs.mime })
      .from(workspaceLogoBlobs)
      .where(eq(workspaceLogoBlobs.workspaceId, workspaceId))
      .limit(1);
    if (!row) return undefined;
    // The bytea customType fromDriver already returns a Buffer, but normalise
    // defensively so callers never see a raw Uint8Array.
    return { bytes: Buffer.from(row.bytes), mime: row.mime };
  }

  async exists(workspaceId: string, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .select({ workspaceId: workspaceLogoBlobs.workspaceId })
      .from(workspaceLogoBlobs)
      .where(eq(workspaceLogoBlobs.workspaceId, workspaceId))
      .limit(1);
    return rows.length > 0;
  }

  async upsert(
    workspaceId: string,
    bytes: Buffer,
    mime: string,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .insert(workspaceLogoBlobs)
      .values({ workspaceId, bytes, mime })
      .onConflictDoUpdate({
        target: workspaceLogoBlobs.workspaceId,
        set: { bytes, mime, updatedAt: new Date() },
      });
  }

  async remove(workspaceId: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .delete(workspaceLogoBlobs)
      .where(eq(workspaceLogoBlobs.workspaceId, workspaceId));
  }
}
