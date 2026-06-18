'use server';

import { z } from 'zod';
import { passwordSchema } from '@/lib/auth/password-validation';
import { normalizeEmail, type AuthActionResult } from './_shared';
import { normalizePhone } from './phoneOtpUtils';
import { getAuthService } from '@/lib/server/services/auth';
import { adminBaseUrl } from '@/lib/server/env';
import { notifyAdminNewMembershipAfterCommit } from '@/lib/server/notifications/admin-signup';

const Input = z
  .object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
    password: passwordSchema,
    phone: z.string().min(9).max(15),
    phoneVerificationId: z.string().uuid(),
    selectedPgWorkspaceId: z.string().uuid(),
  })
  .strict();

export type JoinCanonicalPgWorkspaceInput = z.input<typeof Input>;
export type JoinCanonicalPgWorkspaceResult = AuthActionResult<{
  redirectTo: string;
  email: string;
  password: string;
}>;

export async function joinCanonicalPgWorkspaceAction(
  input: JoinCanonicalPgWorkspaceInput,
): Promise<JoinCanonicalPgWorkspaceResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    const weak = parsed.error.issues.some(
      (i) => i.path[0] === 'password' && i.message === 'WEAK_PASSWORD',
    );
    return { ok: false, error: weak ? 'WEAK_PASSWORD' : 'INVALID_INPUT' };
  }

  const email = normalizeEmail(parsed.data.email);
  const normalizedPhone = normalizePhone(parsed.data.phone);
  if (!normalizedPhone) return { ok: false, error: 'INVALID_INPUT' };

  const svc = await getAuthService();
  const result = await svc.joinCanonicalPgWorkspace({
    email,
    name: parsed.data.name,
    plainPassword: parsed.data.password,
    phone: normalizedPhone,
    phoneVerificationId: parsed.data.phoneVerificationId,
    selectedPgWorkspaceId: parsed.data.selectedPgWorkspaceId,
  });

  if (!result.ok) return result;

  notifyAdminNewMembershipAfterCommit({
    userName: parsed.data.name,
    workspaceName: result.workspaceName,
    reviewUrl: `${adminBaseUrl()}/admin/pg-members`,
  });

  return {
    ok: true,
    redirectTo: '/home',
    email: result.email,
    password: parsed.data.password,
  };
}
