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
};
