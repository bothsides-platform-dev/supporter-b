/**
 * Client-safe phone helpers (no node:crypto — distinct from server-side
 * `phoneOtpUtils.normalizePhone`). Used by the OTP input UI to enforce the
 * hyphenated submission format (e.g. 010-5705-8257).
 */

/** Live input mask: digits-only → hyphenated KR mobile format. */
export function formatPhoneInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** True when the value is a complete KR mobile number (010/01X, 10–11 digits). */
export function isCompletePhone(value: string): boolean {
  return /^01[0-9]\d{7,8}$/.test(value.replace(/\D/g, ''));
}
