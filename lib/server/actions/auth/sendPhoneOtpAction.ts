'use server';

import { createHash, randomInt } from 'node:crypto';
import { and, gte, count, eq } from 'drizzle-orm';
import { phoneOtps } from '@/lib/db/schema';
import { sendSms } from '@/lib/server/sms/solapi';
import { actionDb, type AuthActionResult } from './_shared';

const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const OTP_TTL_MS = 5 * 60_000;

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-]/g, '');
  if (!/^01[0-9]\d{7,8}$/.test(digits)) return null;
  return digits;
}

function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtpCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export async function sendPhoneOtpAction(input: {
  phone: string;
}): Promise<AuthActionResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: 'INVALID_PHONE' };

  const db = actionDb();
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

  const [{ value: recentCount }] = await db
    .select({ value: count() })
    .from(phoneOtps)
    .where(and(eq(phoneOtps.phone, phone), gte(phoneOtps.createdAt, windowStart)));

  if (Number(recentCount) >= RATE_LIMIT_COUNT) {
    return { ok: false, error: 'RATE_LIMITED' };
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await db.insert(phoneOtps).values({
    phone,
    codeHash: hashOtpCode(code),
    expiresAt,
  });

  await sendSms(phone, `bidit 인증번호: ${code} (5분 이내 입력)`);

  return { ok: true };
}
