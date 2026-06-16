import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { attachments, chatMessages } from '@/lib/db/schema';
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
    rfpTeamMessageId: row.rfpTeamMessageId ?? undefined,
    uploadedBy: row.uploadedBy,
  };
}

// 공개 Attachment 필드만 — uploadedBy 등 record 전용 필드는 클라이언트로 안 보냄.
function toPublicAttachment(row: AttachRow): Attachment {
  const { id, name, size, mimeType, url } = rowToAttachment(row);
  return { id, name, size, mimeType, url };
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
    return rows.map(toPublicAttachment);
  }

  async findByChatMessageIds(ids: string[], tx?: Tx): Promise<(Attachment & { chatMessageId: string })[]> {
    if (ids.length === 0) return [];
    const db = this.h(tx);
    const rows: AttachRow[] = await db
      .select()
      .from(attachments)
      .where(inArray(attachments.chatMessageId, ids))
      .orderBy(asc(attachments.uploadedAt));
    return rows.map((row) => ({ ...toPublicAttachment(row), chatMessageId: row.chatMessageId! }));
  }

  async findByConversationId(conversationId: string, tx?: Tx): Promise<Attachment[]> {
    const db = this.h(tx);
    const rows: AttachRow[] = await db
      .select({ ...attachments })
      .from(attachments)
      .innerJoin(chatMessages, eq(attachments.chatMessageId, chatMessages.id))
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(attachments.uploadedAt));
    return rows.map(toPublicAttachment);
  }

  async claim(
    params: {
      ids: string[];
      owner: {
        rfpId?: string;
        bidId?: string;
        bidNoteId?: string;
        chatMessageId?: string;
        rfpTeamMessageId?: string;
      };
      uploadedBy?: string;
    },
    tx?: Tx,
  ): Promise<void> {
    if (params.ids.length === 0) return; // safe no-op
    const db = this.h(tx);
    const { owner } = params;
    // owner 는 정확히 한 키만 가진다 — 설정된 컬럼만 patch.
    const patch: Partial<AttachRow> = {};
    if (owner.rfpId !== undefined) patch.rfpId = owner.rfpId;
    if (owner.bidId !== undefined) patch.bidId = owner.bidId;
    if (owner.bidNoteId !== undefined) patch.bidNoteId = owner.bidNoteId;
    if (owner.chatMessageId !== undefined) patch.chatMessageId = owner.chatMessageId;
    if (owner.rfpTeamMessageId !== undefined) patch.rfpTeamMessageId = owner.rfpTeamMessageId;

    // 모든 owner 컬럼 IS NULL 가드 — 이미 링크된 행 re-parent 방지.
    const conds = [
      inArray(attachments.id, params.ids),
      isNull(attachments.rfpId),
      isNull(attachments.bidId),
      isNull(attachments.bidNoteId),
      isNull(attachments.chatMessageId),
      isNull(attachments.rfpTeamMessageId),
    ];
    if (params.uploadedBy !== undefined) {
      conds.push(eq(attachments.uploadedBy, params.uploadedBy));
    }

    await db.update(attachments).set(patch).where(and(...conds));
  }

  async findUnclaimedByIds(
    ids: string[],
    tx?: Tx,
  ): Promise<Pick<AttachmentRecord, 'id' | 'rfpId' | 'bidId' | 'bidNoteId' | 'uploadedBy'>[]> {
    if (ids.length === 0) return [];
    const db = this.h(tx);
    const rows: AttachRow[] = await db
      .select()
      .from(attachments)
      .where(
        and(
          inArray(attachments.id, ids),
          isNull(attachments.rfpId),
          isNull(attachments.bidId),
          isNull(attachments.bidNoteId),
          isNull(attachments.chatMessageId),
          isNull(attachments.rfpTeamMessageId),
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      rfpId: row.rfpId ?? undefined,
      bidId: row.bidId ?? undefined,
      bidNoteId: row.bidNoteId ?? undefined,
      uploadedBy: row.uploadedBy,
    }));
  }

  async remove(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(attachments).where(eq(attachments.id, id));
  }
}
