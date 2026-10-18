'use server';

import { getPhoneOtpRepo } from '@/lib/server/repositories/factory';
import { hashOtpCode, normalizePhone } from './phoneOtpUtils';
import { type AuthActionResult } from './_shared';
import { PhoneOtpPurposeInput, resolvePhoneOtpBinding } from './_phoneOtpPurpose';
import type { PhoneOtpPurpose } from '@/lib/types/phone-otp';

const MAX_ATTEMPTS = 5;
const PROOF_TTL_MS = 5 * 60_000;

export async function verifyPhoneOtpAction(input: {
  phone: string;
  code: string;
  purpose?: PhoneOtpPurpose;
}): Promise<AuthActionResult<{ verificationId: string }>> {
  const phone = normalizePhone(input.phone) ?? input.phone.replace(/[\s\-]/g, '');
  const parsedPurpose = PhoneOtpPurposeInput.safeParse(input.purpose ?? 'signup');
  if (!parsedPurpose.success) return { ok: false, error: 'INVALID_INPUT' };
  const binding = await resolvePhoneOtpBinding(parsedPurpose.data);
  if (!binding.ok) return binding;

  const phoneOtpRepo = await getPhoneOtpRepo();
  const now = new Date();

  const row = await phoneOtpRepo.findActive({
    phone,
    purpose: parsedPurpose.data,
    userId: binding.userId,
    now,
  });

  if (!row) return { ok: false, error: 'INVALID_CODE' };

  if (!(await phoneOtpRepo.bumpAttempts(row.id, MAX_ATTEMPTS, now))) {
    return { ok: false, error: 'MAX_ATTEMPTS' };
  }

  if (row.codeHash !== hashOtpCode(input.code)) {
    return { ok: false, error: 'INVALID_CODE' };
  }

  const verified = await phoneOtpRepo.markVerified({
    id: row.id,
    verifiedAt: now,
    proofExpiresAt: new Date(now.getTime() + PROOF_TTL_MS),
  });
  if (!verified) return { ok: false, error: 'INVALID_CODE' };

  return { ok: true, verificationId: row.id };
}
