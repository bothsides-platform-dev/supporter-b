import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE_NAME = 'admin-token';
const EXPIRY = '8h';

function getSecret(): Uint8Array {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('ADMIN_SESSION_SECRET must be at least 32 chars');
  return new TextEncoder().encode(s);
}

export async function signAdminToken(adminId: string): Promise<string> {
  return new SignJWT({ adminId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifyAdminToken(
  token: string,
): Promise<{ adminId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return { adminId: payload.adminId as string };
  } catch {
    return null;
  }
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;

export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 8 * 60 * 60,
  path: '/',
};

export type AdminCookieOptions = typeof ADMIN_COOKIE_OPTIONS;

export async function requireAdminSession(): Promise<{ adminId: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) redirect('/admin/login');
  const session = await verifyAdminToken(token);
  if (!session) redirect('/admin/login');
  return session;
}
