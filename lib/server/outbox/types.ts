export type OutboxStatus = 'pending' | 'sent' | 'failed';

export type OutboxEvent =
  | 'auth.verify'
  | 'auth.reset'
  | 'auth.email-change'
  | 'rfp.invited'
  | 'rfp.sent'
  | 'bid.submitted'
  | 'rfp.awarded'
  | 'workspace.invited'
  | 'workspace.approved'
  | 'workspace.rejected';

export type OutboxEntry = {
  id: string;
  event: OutboxEvent;
  to: string;
  subject: string;
  html: string;
  dedupeKey?: string;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  scheduledAt: string;
  sentAt?: string;
  lastError?: string;
};

export type SendResult = { ok: boolean; error?: string };
export type Sender = (entry: OutboxEntry) => Promise<SendResult>;
