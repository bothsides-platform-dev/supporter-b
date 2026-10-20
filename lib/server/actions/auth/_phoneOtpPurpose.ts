import { z } from 'zod';

import { requireSession } from '@/lib/auth/session';
import { PHONE_OTP_PURPOSES, type PhoneOtpPurpose } from '@/lib/types/phone-otp';

export const PhoneOtpPurposeInput = z.enum(PHONE_OTP_PURPOSES);

export async function resolvePhoneOtpBinding(
  purpose: PhoneOtpPurpose,
): Promise<
  | { ok: true; userId: string | null }
  | { ok: false; error: 'UNAUTHENTICATED' }
> {
  if (purpose === 'signup') return { ok: true, userId: null };

  try {
    const session = await requireSession({ allowInactiveWorkspace: true });
    return { ok: true, userId: session.user.id };
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }
}
