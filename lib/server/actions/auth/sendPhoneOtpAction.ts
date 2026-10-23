'use server';

import { randomInt } from 'node:crypto';
import { getPhoneOtpRepo } from '@/lib/server/repositories/factory';
import { sendSms, sendAlimtalk } from '@/lib/server/sms/solapi';
import { type AuthActionResult } from './_shared';
import { hashOtpCode, normalizePhone } from './phoneOtpUtils';
import { PhoneOtpPurposeInput, resolvePhoneOtpBinding } from './_phoneOtpPurpose';
import type { PhoneOtpPurpose } from '@/lib/types/phone-otp';

const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const OTP_TTL_MS = 5 * 60_000;

function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function sendPhoneOtpAction(input: {
  phone: string;
  purpose?: PhoneOtpPurpose;
}): Promise<AuthActionResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: 'INVALID_PHONE' };
  const parsedPurpose = PhoneOtpPurposeInput.safeParse(input.purpose ?? 'signup');
  if (!parsedPurpose.success) return { ok: false, error: 'INVALID_INPUT' };
  const binding = await resolvePhoneOtpBinding(parsedPurpose.data);
  if (!binding.ok) return binding;

  const phoneOtpRepo = await getPhoneOtpRepo();
  const now = new Date();
  const code = generateOtp();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  const id = await phoneOtpRepo.reserveIssuance({
    phone,
    purpose: parsedPurpose.data,
    userId: binding.userId,
    codeHash: hashOtpCode(code),
    windowStart: new Date(now.getTime() - RATE_LIMIT_WINDOW_MS),
    limit: RATE_LIMIT_COUNT,
  });
  if (!id) return { ok: false, error: 'RATE_LIMITED' };

  try {
    if (process.env.PHONE_OTP_CHANNEL === 'alimtalk') {
      await sendAlimtalk(phone, process.env.SOLAPI_TEMPLATE_OTP ?? '', { '#{인증번호}': code });
    } else {
      await sendSms(phone, `서포트비 인증번호: ${code} (5분 이내 입력)`);
    }
  } catch (error) {
    // A timeout may follow provider acceptance: activate the code the user may
    // already have received, and never initiate a second send from this server.
    const unknown = error instanceof Error && 'outcome' in error && error.outcome === 'unknown';
    // A clear rejection keeps the reservation inactive; it still consumes quota.
    if (!unknown) return { ok: false, error: 'SMS_FAILED' };
  }

  await phoneOtpRepo.activate(id, expiresAt);
  return { ok: true };
}
