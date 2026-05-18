'use client';

// Buyer-side kanban + history store. Mock/v0 single source of truth for:
//   - Bid.buyerStage overrides (kanban column membership)
//   - BidNote list per bid (manual memos + attachments)
//
// Persists to localStorage under `bidit:bid-board:v1`. Attachments use
// URL.createObjectURL — blob URLs do not survive a page reload, so the modal
// renders a fallback for entries whose `Attachment.url` is unreachable.
//
// Post-v0 cutover: replace this store with server actions
//   updateBuyerStageAction(bidId, to)
//   addBidNoteAction(bidId, body, attachmentIds[])
//   removeBidNoteAction(noteId)
// backed by BidRepo.updateBuyerStage + BidNoteRepo + AttachmentRepo
// (owner_kind='bid_note').

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Bid, BuyerStage } from '@/lib/types/bid';
import type { BidNote } from '@/lib/types/bid-note';

type BidBoardState = {
  stages: Record<string, BuyerStage>;
  notes: Record<string, BidNote[]>;
};

type BidBoardActions = {
  moveStage: (bidId: string, to: BuyerStage) => void;
  addNote: (note: BidNote) => void;
  removeNote: (bidId: string, noteId: string) => void;
};

type BidBoardSelectors = {
  getStage: (bid: Bid) => BuyerStage;
  getNotes: (bidId: string) => BidNote[];
};

export type BidBoardStore = BidBoardState & BidBoardActions & BidBoardSelectors;

const initialState: BidBoardState = { stages: {}, notes: {} };

export const useBidBoardStore = create<BidBoardStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      moveStage: (bidId, to) =>
        set((s) => ({ stages: { ...s.stages, [bidId]: to } })),

      addNote: (note) =>
        set((s) => {
          const list = s.notes[note.bidId] ?? [];
          return { notes: { ...s.notes, [note.bidId]: [...list, note] } };
        }),

      removeNote: (bidId, noteId) =>
        set((s) => {
          const list = s.notes[bidId];
          if (!list) return s;
          const next = list.filter((n) => n.id !== noteId);
          return { notes: { ...s.notes, [bidId]: next } };
        }),

      getStage: (bid) => get().stages[bid.id] ?? bid.buyerStage ?? 'pending',
      getNotes: (bidId) => get().notes[bidId] ?? [],
    }),
    {
      name: 'bidit:bid-board:v1',
      storage: createJSONStorage(() => localStorage),
      // SSR-safe: only persist serializable state, not selectors
      partialize: (s) => ({ stages: s.stages, notes: s.notes }),
      skipHydration: true,
    },
  ),
);

// Demo seed for dev only. Idempotent — runs once when store is empty.
// Decision sample: buyer marks 토스 as "협상중" with one negotiation note.
export function seedDemoBidBoard(opts: {
  bids: Pick<Bid, 'id' | 'pgWsId'>[];
  pgWsNameMap: Record<string, string>;
  authorId: string;
  authorName: string;
}): void {
  if (process.env.NODE_ENV === 'production') return;
  const s = useBidBoardStore.getState();
  if (Object.keys(s.notes).length > 0 || Object.keys(s.stages).length > 0) {
    return;
  }
  const findByName = (needle: string) =>
    opts.bids.find((b) =>
      (opts.pgWsNameMap[b.pgWsId] ?? '').includes(needle),
    );
  const toss = findByName('토스');
  if (toss) {
    s.moveStage(toss.id, 'negotiating');
    s.addNote({
      id: `seed-${toss.id}-1`,
      bidId: toss.id,
      authorId: opts.authorId,
      authorName: opts.authorName,
      body: '셋업비 0원 가능 여부 영업담당과 통화 — 본사 컨펌 후 회신 예정.',
      attachments: [],
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    });
  }
}
