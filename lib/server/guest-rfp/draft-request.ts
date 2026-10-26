import { appOrigins } from "@/lib/site-routing";
export const GUEST_DRAFT_COOKIE = "support-b-guest-draft-proof";
const ips = new Map<string, number>();
let start = 0,
  total = 0;
export function checkGuestDraftRequestBoundary(request: Request): number | null {
  const buyer = new URL(appOrigins().buyer);
  if (
    request.headers.get("origin") !== buyer.origin ||
    (request.headers.get("host") ?? new URL(request.url).host) !== buyer.host ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return 403;
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return 415;
  return null;
}
export function checkGuestDraftRequestLimit(request: Request): number | null {
  const now = Date.now();
  if (now - start >= 60000) {
    start = now;
    total = 0;
    ips.clear();
  }
  const ip =
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
    "unknown";
  if (total >= 240 || (ips.get(ip) ?? 0) >= 60) return 429;
  total++;
  ips.set(ip, (ips.get(ip) ?? 0) + 1);
  return null;
}
export function checkGuestDraftRequest(request: Request): number | null {
  return checkGuestDraftRequestBoundary(request) ?? checkGuestDraftRequestLimit(request);
}
export async function readGuestDraftBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_INPUT");
  let size = 0,
    expired = false;
  const parts: Uint8Array[] = [];
  const timeout = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, 3000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (expired) throw new Error("BODY_TOO_LARGE");
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}
