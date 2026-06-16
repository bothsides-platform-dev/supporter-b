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
  | 'workspace.rejected'
  | 'chat.message'
  | 'team_chat.message'
  | 'rfp.requote_requested';

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

// SendResult — outcome of a single email send. On failure the sender classifies
// whether the error is worth retrying (`retryable`) and surfaces any server-
// requested wait (`retryAfterMs`, from a Resend rate-limit response). Both are
// optional for backward compatibility: an omitted `retryable` is treated as
// retryable (the historical default), so legacy `{ ok: false, error }` returns
// keep their existing maxAttempts-bounded retry behaviour.
export type SendResult =
  | { ok: true }
  | { ok: false; error: string; retryable?: boolean; retryAfterMs?: number };

/** Single-email sender (per-entry). Used by the digest flushers + dev fallback. */
export type Sender = (entry: OutboxEntry) => Promise<SendResult>;

/**
 * Batch sender — sends many entries in one network round-trip (Resend's
 * `batch.send`, up to 100/call), returning one SendResult per input entry,
 * aligned by index. Collapses an N-recipient fan-out from N API calls to
 * ceil(N/100), keeping bursts well under Resend's rate limit.
 */
export type BatchSender = (entries: OutboxEntry[]) => Promise<SendResult[]>;
