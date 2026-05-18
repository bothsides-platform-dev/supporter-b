'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  getOutboxRepo,
  getVerificationTokenRepo,
} from '@/lib/server/repositories/factory';
import { addMinutes, generateToken, hashToken } from '@/lib/server/token';
import { renderAuthVerify } from '@/lib/server/outbox/templates/authVerify';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { users } from '@/lib/db/schema';
import {
  actionDb,
  baseUrl,
  bucket15Min,
  normalizeEmail,
  type AuthActionResult,
} from './_shared';

const Input = z.object({
  email: z.string().email(),
  workspaceType: z.enum(['buyer', 'pg']).optional(),
  inviteToken: z.string().min(1).max(256).optional(),
});

export type SignupEmailInput = z.infer<typeof Input>;
export type SignupEmailResult = AuthActionResult<{ email: string }>;

/**
 * P2 — issue a signup_email verification token and enqueue the outbox mail.
 *
 * - Token TTL: 15 minutes.
 * - meta.inviteToken (if present) is the only carrier of the RFP invite
 *   across the verify hop — the client puts it back into sessionStorage
 *   from `verifyEmailAction`'s response.
 * - Outbox dedupe key bucketed per 15-minute window so resend taps in the
 *   same window collapse to one outbox row.
 */
export async function signupEmailAction(
  input: SignupEmailInput,
): Promise<SignupEmailResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const email = normalizeEmail(parsed.data.email);

  const [existing] = await actionDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) return { ok: false, error: 'EMAIL_TAKEN' };

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = addMinutes(new Date(), 15);

  const verifications = await getVerificationTokenRepo();
  const metaFields = {
    ...(parsed.data.inviteToken ? { inviteToken: parsed.data.inviteToken } : {}),
    ...(parsed.data.workspaceType ? { workspaceType: parsed.data.workspaceType } : {}),
  };
  await verifications.save({
    id: randomUUID(),
    purpose: 'signup_email',
    email,
    tokenHash,
    issuedAt: new Date().toISOString(),
    expiresAt,
    meta: Object.keys(metaFields).length ? metaFields : undefined,
  });

  const verifyUrl = `${baseUrl()}/auth/verify?token=${rawToken}`;

  const outbox = await getOutboxRepo();
  const html = await renderAuthVerify({ verifyUrl, expiresMinutes: 15 });
  await outbox.enqueue({
    event: 'auth.verify',
    to: email,
    subject: '[BIDIT] 이메일 인증을 완료해 주세요',
    html,
    dedupeKey: `signup-verify:${email}:${bucket15Min()}`,
  });

  // Post-commit flush — fire-and-forget. The action runs without an
  // explicit `db.transaction()` wrapper, so "post-commit" here means
  // "after the enqueue UPDATE is durable" which is the same instant.
  flushAfterCommit();

  return { ok: true, email };
}
