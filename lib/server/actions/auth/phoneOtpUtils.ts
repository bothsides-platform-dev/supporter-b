import { createHash } from 'node:crypto';

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-]/g, '');
  if (!/^01[0-9]\d{7,8}$/.test(digits)) return null;
  return digits;
}

export function hashOtpCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
