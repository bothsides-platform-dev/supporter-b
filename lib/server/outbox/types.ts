export type OutboxStatus = 'pending' | 'sent' | 'failed';

// 런타임 튜플이 SSOT — 타입은 여기서 파생한다. retryEmail 화이트리스트
// (lib/server/services/notification.ts)가 이 튜플을 그대로 소비하므로,
// 새 이벤트를 추가하면 재시도 허용 목록에 자동 반영된다(수동 나열 드리프트
// 로 requote 재시도가 NO_EMAIL 로 죽던 계열의 재발 방지).
export const OUTBOX_EVENTS = [
  'auth.verify',
  'auth.reset',
  'auth.email-change',
  'rfp.invited',
  'rfp.sent',
  'bid.submitted',
  'rfp.awarded',
  'workspace.invited',
  'workspace.approved',
  'workspace.rejected',
  'chat.message',
  'team_chat.message',
  'rfp.requote_requested',
  'signing.awaiting_template',
] as const;

export type OutboxEvent = (typeof OUTBOX_EVENTS)[number];

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
