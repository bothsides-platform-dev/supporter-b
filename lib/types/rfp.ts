import type { Attachment } from './common';
import type { BizProfile } from './biz-profile';

export type RfpStatus = 'draft' | 'sent' | 'closed' | 'cancelled' | 'awarded';

export type RFP = {
  // Surrogate uuid (PK). FKs reference this. Use `code` for URLs/display.
  id: string;
  // Human-facing RFP number P-YYMM-NNNN (unique).
  code: string;
  buyerWsId: string;
  bizProfile?: BizProfile;
  title: string;
  memo: string;
  rfpFiles: Attachment[];
  allowedPgWorkspaceIds: string[];
  deadline: string;
  status: RfpStatus;
  awardedBidId?: string;
  createdBy: string;
  createdAt: string;
  sentAt?: string;
  // RFP-scoped permanent share token (raw). Populated by the repo layer; only
  // surfaced server-side for the buyer's detail page → never serialised to PG
  // clients. Optional on type so PG-side renders that omit it stay sound.
  shareToken?: string;
};
