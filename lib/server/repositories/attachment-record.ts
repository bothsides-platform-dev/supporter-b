import type { Attachment } from '@/lib/types/common';

// Server-only attachment row shape — adds owner polymorphism, storagePath, and
// uploader to the public `Attachment` contract. Never imported by client code:
// `storagePath` is the on-disk key and must not leak to the browser (the public
// `url` field carries the route-resolved `/api/files/{id}` instead).
//
// Repositories return this expanded record for server-internal callers (ACL,
// file route, storage). Client-facing repos (BidRepo) project to plain
// `Attachment` before returning.
export type AttachmentRecord = Attachment & {
  ownerKind: 'rfp' | 'bid_proposal';
  ownerId: string;
  storagePath: string;
  uploadedBy: string;
};
