export const CHAT_DIGEST_WINDOW_MS = 3 * 60_000;

export function chatDigestBucket(now: Date): number {
  return Math.floor(now.getTime() / CHAT_DIGEST_WINDOW_MS);
}
