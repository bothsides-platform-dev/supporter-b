// chatDigestWindowEnd — the delayed-send scheduling time for a coalesced chat
// digest. The dedupeKey buckets messages by `floor(now/WINDOW)`; the email
// fires at that bucket's END so a flurry inside the window collapses to one
// mail sent once the window closes. The two MUST agree on the same `now` so
// the key's bucket and the scheduledAt line up.
import { describe, expect, it } from 'vitest';

import {
  CHAT_DIGEST_WINDOW_MS,
  chatDigestBucket,
  chatDigestDedupeKey,
  chatDigestWindowEnd,
  parseChatDigestDedupeKey,
} from '@/lib/server/outbox/chat-digest-key';

describe('chatDigestWindowEnd', () => {
  it('returns the end of the bucket containing `now` ((bucket+1)*WINDOW)', () => {
    const now = new Date(1_780_000_123_456);
    const bucket = chatDigestBucket(now);
    const end = chatDigestWindowEnd(now);
    expect(end.getTime()).toBe((bucket + 1) * CHAT_DIGEST_WINDOW_MS);
    // Strictly in the future relative to `now`, by at most one window.
    expect(end.getTime()).toBeGreaterThan(now.getTime());
    expect(end.getTime() - now.getTime()).toBeLessThanOrEqual(CHAT_DIGEST_WINDOW_MS);
  });

  it('two `now`s in the same window share an end time (coalesce point)', () => {
    const a = new Date(1_780_000_000_000);
    const b = new Date(a.getTime() + 1000); // 1s later, same 3-min window
    expect(chatDigestBucket(a)).toBe(chatDigestBucket(b));
    expect(chatDigestWindowEnd(a).getTime()).toBe(chatDigestWindowEnd(b).getTime());
  });
});

describe('parseChatDigestDedupeKey', () => {
  it('round-trips a key minted by chatDigestDedupeKey', () => {
    const conv = '11111111-1111-4111-8111-111111111111';
    const workspace = '33333333-3333-4333-8333-333333333333';
    const user = '22222222-2222-4222-8222-222222222222';
    const key = chatDigestDedupeKey(
      conv,
      workspace,
      user,
      new Date(1_780_000_000_000),
    );
    expect(parseChatDigestDedupeKey(key)).toEqual({
      conversationId: conv,
      recipientWorkspaceId: workspace,
      recipientUserId: user,
    });
  });

  it('returns null for a malformed or non-chat key', () => {
    expect(parseChatDigestDedupeKey(undefined)).toBeNull();
    expect(parseChatDigestDedupeKey('')).toBeNull();
    expect(parseChatDigestDedupeKey('rfp:P-1:invite:x@e.com')).toBeNull();
    expect(parseChatDigestDedupeKey('chat-digest:onlythree:42')).toBeNull();
    expect(parseChatDigestDedupeKey('chat-digest:c1:w1:u1:42:extra')).toBeNull();
  });
});
