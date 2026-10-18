import { headers } from 'next/headers';

// Shared by both public email probes. Bounded memory for the single PM2 fork;
// successful lookups never reset the budget. Caddy owns the final XFF hop.
let windowStart = 0;
let total = 0;
const ips = new Map<string, number>();
export async function allowEmailLookup(): Promise<boolean> {
  const now = Date.now();
  if (now - windowStart >= 60_000) {
    windowStart = now;
    total = 0;
    ips.clear();
  }
  const requestHeaders = await headers();
  const ip = requestHeaders.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
  if (total >= 300 || (ips.get(ip) ?? 0) >= 60) return false;
  total++;
  ips.set(ip, (ips.get(ip) ?? 0) + 1);
  return true;
}
