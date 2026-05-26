'use server';

import { and, eq, isNull, gt } from 'drizzle-orm';
import { phoneOtps } from '@/lib/db/schema';
import { normalizePhone, hashOtpCode } from './sendPhoneOtpAction';
import { actionDb, type AuthActionResult } from './_shared';

const MAX_ATTEMPTS = 5;

export async function verifyPhoneOtpAction(input: {
  phone: string;
  code: string;
}): Promise<AuthActionResult<{ verificationId: string }>> {
  const phone = normalizePhone(input.phone) ?? input.phone.replace(/[\s\-]/g, '');

  const db = actionDb();
  const now = new Date();

  const [row] = await db
    .select()
    .from(phoneOtps)
    .where(
      and(
        eq(phoneOtps.phone, phone),
        isNull(phoneOtps.verifiedAt),
        gt(phoneOtps.expiresAt, now),
      ),
    )
    .orderBy(phoneOtps.createdAt)
    .limit(1);

  if (!row) return { ok: false, error: 'INVALID_CODE' };

  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: 'MAX_ATTEMPTS' };
  }

  if (row.codeHash !== hashOtpCode(input.code)) {
    await db
      .update(phoneOtps)
      .set({ attempts: row.attempts + 1 })
      .where(eq(phoneOtps.id, row.id));
    return { ok: false, error: 'INVALID_CODE' };
  }

  await db
    .update(phoneOtps)
    .set({ verifiedAt: now })
    .where(eq(phoneOtps.id, row.id));

  return { ok: true, verificationId: row.id };
}
