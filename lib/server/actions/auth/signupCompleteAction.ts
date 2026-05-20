'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '@/lib/auth/password';
import { passwordSchema } from '@/lib/auth/password-validation';
import { users } from '@/lib/db/schema';
import { createWorkspaceInTx } from '@/lib/server/actions/workspace/_createWorkspace';
import {
  actionDb,
  normalizeEmail,
  type AuthActionResult,
} from './_shared';

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
    wsKind: z.enum(['buyer', 'pg']).optional(),
    wsName: z.string().min(1).max(200).optional(),
    bizProfile: BizProfileInput.optional(),
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

  const passwordHash = await hashPassword(parsed.data.password);
  const userId = randomUUID();

  const db = actionDb();

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
          avatarColor: 'ink',
          status: 'active',
        });
      } catch {
        return { ok: false, error: 'EMAIL_TAKEN' };
      }

      // 2. Workspace branch — buyer or pg. Shared creation (workspace + admin
      //    membership + lastActiveWorkspaceId) lives in createWorkspaceInTx;
      //    bizProfile is consumed for buyer only. redirectTo differs per kind.
      if (parsed.data.wsKind === 'buyer' || parsed.data.wsKind === 'pg') {
        if (!parsed.data.wsName) {
          return { ok: false, error: 'MISSING_WS_NAME' };
        }
        await createWorkspaceInTx(tx, {
          userId,
          type: parsed.data.wsKind,
          name: parsed.data.wsName,
          bizProfile: parsed.data.bizProfile,
        });
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
