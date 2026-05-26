'use server';

import { z } from 'zod/v4';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  signAdminToken,
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_OPTIONS,
} from '@/lib/auth/admin-session';

const Input = z.object({
  adminId: z.string().min(1),
  password: z.string().min(1),
}).strict();

export type LoginResult = { ok: false; error: string } | { ok: true };

export async function loginAction(input: unknown): Promise<LoginResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const { adminId, password } = parsed.data;
  if (
    adminId !== process.env.ADMIN_ID ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return { ok: false, error: 'INVALID_CREDENTIALS' };
  }

  const token = await signAdminToken(adminId);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, token, ADMIN_COOKIE_OPTIONS);
  redirect('/admin');
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
  redirect('/admin/login');
}
