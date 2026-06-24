import { describe, expect, it } from 'vitest';
import { CHAT_DIGEST_WINDOW_MS, chatDigestBucket } from '../_chat-constants';

describe('CHAT_DIGEST_WINDOW_MS', () => {
  it('3분(180_000 ms)이다', () => {
    expect(CHAT_DIGEST_WINDOW_MS).toBe(3 * 60_000);
  });
});

describe('chatDigestBucket', () => {
  it('같은 창 안의 두 시각은 동일한 버킷을 반환한다', () => {
    const base = new Date('2024-01-01T00:00:00Z');
    const within = new Date('2024-01-01T00:02:59Z');
    expect(chatDigestBucket(base)).toBe(chatDigestBucket(within));
  });

  it('창이 바뀌면 다른 버킷을 반환한다', () => {
    const before = new Date('2024-01-01T00:02:59Z');
    const after = new Date('2024-01-01T00:03:00Z');
    expect(chatDigestBucket(before)).not.toBe(chatDigestBucket(after));
  });
});
