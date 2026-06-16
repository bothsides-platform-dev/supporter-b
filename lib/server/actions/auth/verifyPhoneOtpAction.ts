'use server';

import { getPhoneOtpRepo } from '@/lib/server/repositories/factory';
import { hashOtpCode, normalizePhone } from './phoneOtpUtils';
import { type AuthActionResult } from './_shared';

const MAX_ATTEMPTS = 5;

export async function verifyPhoneOtpAction(input: {
  phone: string;
  code: string;
}): Promise<AuthActionResult<{ verificationId: string }>> {
  const phone = normalizePhone(input.phone) ?? input.phone.replace(/[\s\-]/g, '');

  const phoneOtpRepo = await getPhoneOtpRepo();
  const now = new Date();

  const row = await phoneOtpRepo.findActive(phone, now);

  if (!row) return { ok: false, error: 'INVALID_CODE' };

  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: 'MAX_ATTEMPTS' };
  }

  if (row.codeHash !== hashOtpCode(input.code)) {
    await phoneOtpRepo.bumpAttempts(row.id);
    return { ok: false, error: 'INVALID_CODE' };
  }

  await phoneOtpRepo.markVerified(row.id, now);

  return { ok: true, verificationId: row.id };
}
