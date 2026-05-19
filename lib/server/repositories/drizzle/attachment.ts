import { eq } from 'drizzle-orm';
import { attachments } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { AttachmentRecord } from '../attachment-record';
import type { AttachmentRepo, Tx } from '../types';

type AttachRow = typeof attachments.$inferSelect;

function rowToAttachment(row: AttachRow): AttachmentRecord {
  return {
    id: row.id,
    name: row.name,
    size: row.size,
    mimeType: row.mimeType,
    // Public `url` is the authenticated route — never the storage key. See
    // contract in app/api/files/upload/route.ts:169.
    url: `/api/files/${row.id}`,
    ownerKind: row.ownerKind,
    ownerId: row.ownerId,
    storagePath: row.storagePath,
    uploadedBy: row.uploadedBy,
  };
}

export class DrizzleAttachmentRepository implements AttachmentRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async save(a: AttachmentRecord, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.insert(attachments).values({
      id: a.id,
      ownerKind: a.ownerKind,
      ownerId: a.ownerId,
      name: a.name,
      size: a.size,
      mimeType: a.mimeType,
      storagePath: a.storagePath,
      uploadedBy: a.uploadedBy,
    });
  }

  async findById(id: string, tx?: Tx): Promise<AttachmentRecord | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);
    return row ? rowToAttachment(row) : undefined;
  }
}
