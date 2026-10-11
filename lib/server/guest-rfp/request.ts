import { z } from 'zod';
import { isValidWebsiteUrl } from '@/lib/validation/website-url';
export const guestEventSchema = z
  .object({
    draftId: z.string().uuid(),
    event: z.enum(['started', 'completed']),
    website: z.string().trim().min(1).max(500).refine(isValidWebsiteUrl),
    industry: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    contractType: z.enum(['new', 'renewal']).optional(),
    attachmentCount: z.number().int().min(0).max(5),
  })
  .strict()
  .refine(
    (d) =>
      d.event !== 'completed' ||
      (!!d.industry && !!d.title && !!d.contractType),
  );
export type GuestEvent = z.infer<typeof guestEventSchema>;
export function createGuestEventLimiter() {
  let windowStart = 0,
    total = 0;
  const ips = new Map<string, number>();
  return (ip: string, now = Date.now()) => {
    if (now - windowStart >= 60000) {
      windowStart = now;
      total = 0;
      ips.clear();
    }
    if (total >= 60 || (ips.get(ip) ?? 0) >= 10) return false;
    total++;
    ips.set(ip, (ips.get(ip) ?? 0) + 1);
    return true;
  };
}
export async function readGuestEventBody(
  request: Request,
): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const parts: Uint8Array[] = [];
  let size = 0;
  // Cancel slow streams as well as oversized streams; the endpoint is public.
  const timeout = setTimeout(() => {
    void reader.cancel().catch(() => {});
  }, 3000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return null;
      }
      parts.push(value);
    }
    return Buffer.concat(parts).toString('utf8');
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}
