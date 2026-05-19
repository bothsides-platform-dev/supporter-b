import { and, asc, eq, inArray } from 'drizzle-orm';
import { attachments, bidNotes, users } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { Attachment } from '@/lib/types/common';
import type { BidNoteRecord, BidNoteRepo, Tx } from '../types';

type NoteRow = typeof bidNotes.$inferSelect;
type AttRow = typeof attachments.$inferSelect;

function attRowToAttachment(row: AttRow): Attachment {
  return {
    id: row.id,
    name: row.name,
    size: row.size,
    mimeType: row.mimeType,
    // Same contract as the bid proposal route (see attachment.ts header).
    url: `/api/files/${row.id}`,
  };
}

export class DrizzleBidNoteRepository implements BidNoteRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async save(note: BidNoteRecord, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.insert(bidNotes).values({
      id: note.id,
      bidId: note.bidId,
      authorId: note.authorId,
      body: note.body,
      createdAt: note.createdAt,
    });
  }

  async findByBid(
    bidId: string,
    tx?: Tx,
  ): Promise<Required<BidNoteRecord>[]> {
    const db = this.h(tx);
    // Notes joined with their author (for authorName) — ordered oldest →
    // newest so the modal can render in creation order.
    const noteRows: { note: NoteRow; authorName: string | null }[] = await db
      .select({ note: bidNotes, authorName: users.name })
      .from(bidNotes)
      .leftJoin(users, eq(bidNotes.authorId, users.id))
      .where(eq(bidNotes.bidId, bidId))
      .orderBy(asc(bidNotes.createdAt));

    if (noteRows.length === 0) return [];

    // Single batch fetch of attachments for all returned notes — owner_id ∈
    // {note ids} && owner_kind='bid_note'. Simpler than per-note round-trips.
    const noteIds = noteRows.map((r) => r.note.id);
    const attRows: AttRow[] = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.ownerKind, 'bid_note'),
          inArray(attachments.ownerId, noteIds),
        ),
      );

    const byNote = new Map<string, Attachment[]>();
    for (const row of attRows) {
      const list = byNote.get(row.ownerId) ?? [];
      list.push(attRowToAttachment(row));
      byNote.set(row.ownerId, list);
    }

    return noteRows.map((r) => ({
      id: r.note.id,
      bidId: r.note.bidId,
      authorId: r.note.authorId,
      body: r.note.body,
      createdAt: new Date(r.note.createdAt),
      authorName: r.authorName ?? '',
      attachments: byNote.get(r.note.id) ?? [],
    }));
  }

  async remove(noteId: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(bidNotes).where(eq(bidNotes.id, noteId));
  }
}
