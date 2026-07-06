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
// Two-phase presigned upload (Stage 2): 'pending' until the complete route
// verifies the R2 object exists, then 'ready'. Callers writing a record may
// omit this — save() defaults it to 'ready' for pre-Stage-2 call sites.
export type AttachmentStatus = 'pending' | 'ready';

export type AttachmentRecord = Attachment & {
  rfpId?: string;
  bidId?: string;
  bidNoteId?: string;
  chatMessageId?: string;
  rfpTeamMessageId?: string;
  uploadedBy: string;
  // Optional on write (save() defaults to 'ready' for pre-Stage-2 call sites
  // that don't yet know about two-phase upload); always populated on read.
  status?: AttachmentStatus;
};
