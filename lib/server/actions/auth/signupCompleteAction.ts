'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth/password';
import { passwordSchema } from '@/lib/auth/password-validation';
import { users, phoneOtps, pgProfiles } from '@/lib/db/schema';
import { createWorkspaceInTx } from '@/lib/server/actions/workspace/_createWorkspace';
import {
  actionDb,
  isUniqueViolation,
  normalizeEmail,
  type AuthActionResult,
} from './_shared';

const PgProfileInput = z
  .object({
    bizNo: z.string().optional(),
    serviceScope: z.object({
      paymentMethods: z.array(z.string()),
      industries: z.array(z.string()),
      volumeRange: z.string(),
      integrationTypes: z.array(z.string()),
    }),
    salesContact: z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().min(9),
    }),
    backupContact: z
      .object({
        name: z.string(),
        email: z.string(),
        phone: z.string(),
      })
      .optional(),
    slaDays: z.number().int().min(1).max(30).optional(),
  })
  .strict();

const BizProfileInput = z
  .object({
    bizNo: z.string().min(8).max(20),
    taxType: z.enum(['general', 'simple', 'exempt']),
    status: z.enum(['active', 'suspended', 'closed']),
    grade: z.enum(['small', 'sme1', 'sme2', 'sme3', 'general']).optional(),
    gradeSource: z.enum(['user_confirmed', 'user_overridden']).default(
      'user_confirmed',
    ),
  })
  .strict();

const Input = z
  .object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
    password: passwordSchema,
    phone: z.string().min(9).max(15),
    phoneVerificationId: z.string().uuid(),
    wsKind: z.enum(['buyer', 'pg']).optional(),
    wsName: z.string().min(1).max(200).optional(),
    bizProfile: BizProfileInput.optional(),
    pgProfile: PgProfileInput.optional(),
  })
  .strict();

export type SignupCompleteInput = z.infer<typeof Input>;
export type SignupCompleteResult = AuthActionResult<{
  redirectTo: string;
  email: string;
  password: string;
}>;

/**
 * P6 — finalise signup.
 *
 * Branches:
 *   - wsKind='buyer' → insert biz_profiles + workspaces(type='buyer') +
 *     member(role='admin'). Returns redirectTo=/rfp.
 *   - wsKind='pg' → create new PG workspace with wsName +
 *     member(role='admin'). Returns redirectTo=/inbox.
 *
 * Auth.js v5 + Next 16 makes server-side signIn flaky (cookies can't be set
 * from a server action without a route response). Per advisor block C the
 * action returns `{ password }` so the client immediately calls
 * signIn('credentials', { email, password, redirect: false }) and pushes.
 *
 * Note: invite token claiming is handled separately via claimInviteTokenAction
 * after the user is authenticated.
 */
export async function signupCompleteAction(
  input: SignupCompleteInput,
): Promise<SignupCompleteResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    // passwordSchema's refine() carries message 'WEAK_PASSWORD' so policy
    // violations surface a dedicated error code the form can map to inline
    // rule guidance — distinct from generic INVALID_INPUT (bad email etc).
    const weak = parsed.error.issues.some(
      (i) => i.path[0] === 'password' && i.message === 'WEAK_PASSWORD',
    );
    return { ok: false, error: weak ? 'WEAK_PASSWORD' : 'INVALID_INPUT' };
  }

  const email = normalizeEmail(parsed.data.email);

  const db = actionDb();

  // Verify phone OTP before starting the user-creation transaction.
  const [otpRow] = await db
    .select()
    .from(phoneOtps)
    .where(
      and(
        eq(phoneOtps.id, parsed.data.phoneVerificationId),
        eq(phoneOtps.phone, parsed.data.phone),
        isNotNull(phoneOtps.verifiedAt),
      ),
    )
    .limit(1);

  if (!otpRow) return { ok: false, error: 'PHONE_NOT_VERIFIED' };

  const passwordHash = await hashPassword(parsed.data.password);
  const userId = randomUUID();

  return await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<SignupCompleteResult> => {
      // 1. Insert user. Email UNIQUE — collision means an account already
      //    exists for the address; surface that explicitly.
      try {
        await tx.insert(users).values({
          id: userId,
          email,
          passwordHash,
          name: parsed.data.name,
          phone: parsed.data.phone,
          avatarColor: 'ink',
          status: 'active',
        });
      } catch (err) {
        // Email UNIQUE collision → expected. Anything else is unexpected and
        // must propagate (onRequestError → Sentry) rather than masquerade as
        // EMAIL_TAKEN.
        if (isUniqueViolation(err)) return { ok: false, error: 'EMAIL_TAKEN' };
        throw err;
      }

      // 2. Workspace branch — buyer or pg. Shared creation (workspace + admin
      //    membership + lastActiveWorkspaceId) lives in createWorkspaceInTx;
      //    bizProfile is consumed for buyer only. redirectTo differs per kind.
      if (parsed.data.wsKind === 'buyer' || parsed.data.wsKind === 'pg') {
        if (!parsed.data.wsName) {
          return { ok: false, error: 'MISSING_WS_NAME' };
        }
        const { workspaceId } = await createWorkspaceInTx(tx, {
          userId,
          type: parsed.data.wsKind,
          name: parsed.data.wsName,
          bizProfile: parsed.data.bizProfile,
        });

        if (parsed.data.wsKind === 'pg' && parsed.data.pgProfile) {
          await tx.insert(pgProfiles).values({
            workspaceId,
            bizNo: parsed.data.pgProfile.bizNo ?? null,
            serviceScope: parsed.data.pgProfile.serviceScope,
            salesContact: parsed.data.pgProfile.salesContact,
            backupContact: parsed.data.pgProfile.backupContact ?? null,
            slaDays: parsed.data.pgProfile.slaDays ?? null,
          });
        }

        return {
          ok: true,
          redirectTo: parsed.data.wsKind === 'buyer' ? '/rfp' : '/inbox',
          email,
          password: parsed.data.password,
        };
      }

      return { ok: false, error: 'MISSING_WS_KIND' };
    },
  );
}
