import type { Attachment } from '@/lib/types/common';

// Server-only attachment row shape — adds exclusive-arc owner FKs and uploader
// to the public `Attachment` contract. Never imported by client code: the
// public `url` field carries the route-resolved `/api/files/{id}` instead of
// any storage key.
//
// Exclusive-arc ownership (C3): at most one of rfpId / bidId / bidNoteId /
// chatMessageId / rfpTeamMessageId is set once linked; all undefined is a valid
// draft (uploaded before its owner row exists). Storage bytes live in
// Cloudflare R2 under `attachments/<id>` (C4), keyed by this `id` — see
// lib/server/storage/r2.ts.
export type AttachmentRecord = Attachment & {
  rfpId?: string;
  bidId?: string;
  bidNoteId?: string;
  chatMessageId?: string;
  rfpTeamMessageId?: string;
  uploadedBy: string;
};
