import { asc, eq } from 'drizzle-orm';
import { attachments } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { Attachment } from '@/lib/types/common';
import type { AttachmentRecord } from '../attachment-record';
import type { AttachmentRepo, Tx } from '../types';

type AttachRow = typeof attachments.$inferSelect;

function rowToAttachment(row: AttachRow): AttachmentRecord {
  return {
    id: row.id,
    name: row.name,
    size: row.size,
    mimeType: row.mimeType,
    // Public `url` is the authenticated route — never the storage key.
    url: `/api/files/${row.id}`,
    rfpId: row.rfpId ?? undefined,
    bidId: row.bidId ?? undefined,
    bidNoteId: row.bidNoteId ?? undefined,
    chatMessageId: row.chatMessageId ?? undefined,
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
      name: a.name,
      size: a.size,
      mimeType: a.mimeType,
      uploadedBy: a.uploadedBy,
      rfpId: a.rfpId ?? null,
      bidId: a.bidId ?? null,
      bidNoteId: a.bidNoteId ?? null,
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

  async findByRfp(rfpId: string, tx?: Tx): Promise<Attachment[]> {
    const db = this.h(tx);
    const rows: AttachRow[] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.rfpId, rfpId))
      .orderBy(asc(attachments.uploadedAt));
    // 공개 Attachment 필드만 노출 — uploadedBy 등 record 전용 필드는 클라이언트로 안 보냄.
    return rows.map((row) => {
      const { id, name, size, mimeType, url } = rowToAttachment(row);
      return { id, name, size, mimeType, url };
    });
  }
}
