import { and, asc, eq, getTableColumns, inArray, isNull, lt } from 'drizzle-orm';
import { attachments, chatMessages } from '@/lib/db/schema';
import type { Attachment } from '@/lib/types/common';
import type { AttachmentRecord, AttachmentStatus } from '../attachment-record';
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
    status: row.status as AttachmentStatus,
  };
}

// 공개 Attachment 필드만 — uploadedBy 등 record 전용 필드는 클라이언트로 안 보냄.
function toPublicAttachment(row: AttachRow): Attachment {
  const { id, name, size, mimeType, url } = rowToAttachment(row);
  return { id, name, size, mimeType, url };
}

export class DrizzleAttachmentRepository implements AttachmentRepo {

  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
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
      status: a.status ?? 'ready',
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
      .where(and(eq(attachments.rfpId, rfpId), eq(attachments.status, 'ready')))
      .orderBy(asc(attachments.uploadedAt));
    return rows.map(toPublicAttachment);
  }

  async findByChatMessageIds(ids: string[], tx?: Tx): Promise<(Attachment & { chatMessageId: string })[]> {
    if (ids.length === 0) return [];
    const db = this.h(tx);
    const rows: AttachRow[] = await db
      .select()
      .from(attachments)
      .where(and(inArray(attachments.chatMessageId, ids), eq(attachments.status, 'ready')))
      .orderBy(asc(attachments.uploadedAt));
    return rows.map((row) => ({ ...toPublicAttachment(row), chatMessageId: row.chatMessageId! }));
  }

  async findByConversationId(conversationId: string, tx?: Tx): Promise<Attachment[]> {
    const db = this.h(tx);
    const rows: AttachRow[] = await db
      // 테이블 스프레드({ ...attachments })는 h(): any 시절에만 타입이 통과하던
      // 형태 — 조인 셀렉트에서 한 테이블의 전 컬럼만 뽑는 정석은 getTableColumns.
      .select(getTableColumns(attachments))
      .from(attachments)
      .innerJoin(chatMessages, eq(attachments.chatMessageId, chatMessages.id))
      .where(and(eq(chatMessages.conversationId, conversationId), eq(attachments.status, 'ready')))
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
  ): Promise<string[]> {
    if (params.ids.length === 0) return []; // safe no-op
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
    // status='ready' 가드 — 검증 안 된 pending 첨부는 owner에 연결될 수 없다(fail-closed).
    const conds = [
      inArray(attachments.id, params.ids),
      isNull(attachments.rfpId),
      isNull(attachments.bidId),
      isNull(attachments.bidNoteId),
      isNull(attachments.chatMessageId),
      isNull(attachments.rfpTeamMessageId),
      eq(attachments.status, 'ready'),
    ];
    if (params.uploadedBy !== undefined) {
      conds.push(eq(attachments.uploadedBy, params.uploadedBy));
    }

    const rows: { id: string }[] = await db
      .update(attachments)
      .set(patch)
      .where(and(...conds))
      .returning({ id: attachments.id });
    return rows.map((row) => row.id);
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
          eq(attachments.status, 'ready'),
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

  async removeReadyUnclaimedByUploader(
    id: string,
    uploadedBy: string,
    tx?: Tx,
  ): Promise<boolean> {
    const db = this.h(tx);
    const rows: { id: string }[] = await db
      .delete(attachments)
      .where(and(
        eq(attachments.id, id),
        eq(attachments.uploadedBy, uploadedBy),
        eq(attachments.status, 'ready'),
        isNull(attachments.rfpId),
        isNull(attachments.bidId),
        isNull(attachments.bidNoteId),
        isNull(attachments.chatMessageId),
        isNull(attachments.rfpTeamMessageId),
      ))
      .returning({ id: attachments.id });
    return rows.length === 1;
  }

  async markReady(id: string, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);
    // Only a 'pending' row transitions — already-ready or unknown ids are a
    // no-op (returns false so the complete route can distinguish "just
    // verified" from "nothing to do").
    const rows: { id: string }[] = await db
      .update(attachments)
      .set({ status: 'ready' })
      .where(and(eq(attachments.id, id), eq(attachments.status, 'pending')))
      .returning({ id: attachments.id });
    return rows.length > 0;
  }

  async deleteStalePending(cutoff: Date, limit?: number, tx?: Tx): Promise<string[]> {
    const db = this.h(tx);
    const stale = and(eq(attachments.status, 'pending'), lt(attachments.uploadedAt, cutoff));
    // 상한이 있으면 지울 id 를 먼저 골라 그 집합만 삭제한다. DELETE 에는 LIMIT 이
    // 없어서 서브쿼리로 표현한다. 상한이 필요한 이유는 호출자가 삭제된 id 마다
    // 원격 객체를 지우기 때문 — 한 번에 다 지우면 그 루프가 함수 타임아웃을 넘고,
    // 행은 이미 커밋돼 있어 루프가 닿지 못한 객체가 통째로 고아가 된다.
    const where =
      limit === undefined
        ? stale
        : inArray(
            attachments.id,
            db.select({ id: attachments.id }).from(attachments).where(stale).limit(limit),
          );
    const rows: { id: string }[] = await db
      .delete(attachments)
      .where(where)
      .returning({ id: attachments.id });
    return rows.map((r) => r.id);
  }
}
