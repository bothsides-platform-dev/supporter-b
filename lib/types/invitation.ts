export type InvitationStatus =
  | 'draft'
  | 'sent'
  | 'opened'
  | 'accepted'
  | 'declined'
  | 'expired';

export type RfpInvitation = {
  id: string;
  rfpId: string;
  pgWsId: string;
  acceptedByUserId?: string;
  uniqueToken: string;
  sentAt: string;
  openedAt?: string;
  expiresAt: string;
  status: InvitationStatus;
  // Unified kanban (pg pipeline board): explicit custom-column placement;
  // null/undefined ⇒ classifier-derived lifecycle column.
  boardColumnId?: string | null;
};
