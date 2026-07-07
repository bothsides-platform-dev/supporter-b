'use server';

import { randomInt } from 'node:crypto';
import { getPhoneOtpRepo } from '@/lib/server/repositories/factory';
import { sendSms } from '@/lib/server/sms/solapi';
import { type AuthActionResult } from './_shared';
import { hashOtpCode, normalizePhone } from './phoneOtpUtils';

const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const OTP_TTL_MS = 5 * 60_000;

function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function sendPhoneOtpAction(input: {
  phone: string;
}): Promise<AuthActionResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: 'INVALID_PHONE' };

  const phoneOtpRepo = await getPhoneOtpRepo();
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

  const recentCount = await phoneOtpRepo.countRecent(phone, windowStart);

  if (recentCount >= RATE_LIMIT_COUNT) {
    return { ok: false, error: 'RATE_LIMITED' };
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  const id = await phoneOtpRepo.create({
    phone,
    codeHash: hashOtpCode(code),
    expiresAt,
  });

  try {
    await sendSms(phone, `서포트비 인증번호: ${code} (5분 이내 입력)`);
  } catch {
    await phoneOtpRepo.remove(id);
    return { ok: false, error: 'SMS_FAILED' };
  }

  return { ok: true };
}
