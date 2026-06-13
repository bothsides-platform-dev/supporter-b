import { eq } from 'drizzle-orm';

import { users } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { resolveInitialMembership } from '@/lib/auth/active-workspace';
import { isMasterEmail } from '@/lib/auth/master-allowlist';

// A real cost-12 bcrypt hash of a throwaway string. When the email is unknown
// we still run verifyPassword against this so an absent account costs roughly
// the same wall-clock as a wrong password on a real account — closing the
// user-enumeration timing side-channel (F3).
const DUMMY_HASH = '$2b$12$vvQLHtnZhKuUx/ikAu2Tru7O8MCD8V90/wPfxbymt/.D.VXUHJlEi';

export interface AuthorizedUser {
  id: string;
  email: string;
  name: string;
  /** Stamped into the JWT as `sv` — server-side revocation comparand. */
  sessionVersion: number;
  workspaceId?: string;
  workspaceType?: 'buyer' | 'pg';
  role?: 'admin' | 'member';
}

interface Creds {
  email?: unknown;
  password?: unknown;
}

/**
 * Credentials verification for Auth.js's `authorize` callback. Extracted from
 * auth.ts so the constant-time behaviour is unit-testable.
 *
 * Exactly one bcrypt compare runs on every path where both fields are present
 * (real hash for a known user, dummy hash otherwise), so response time does
 * not reveal whether an account exists.
 */
export async function authorizeCredentials(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  creds: Creds | undefined,
): Promise<AuthorizedUser | null> {
  if (!creds?.email || !creds?.password) return null;
  const email = String(creds.email).toLowerCase().trim();
  const password = String(creds.password);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    // Spend a compare so the unknown-email path isn't measurably faster.
    await verifyPassword(password, DUMMY_HASH);
    return null;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  if (user.deletedAt) return null; // 탈퇴 계정 로그인 차단
  // 마스터/운영자 계정은 비밀번호 로그인 불가 — Google OAuth(/login/ops)로만 진입.
  // (compare 이후에 체크해 상수시간 보존. 마스터 이메일로 가입해 비번 로그인하는 우회도 차단.)
  if (isMasterEmail(user.email)) return null;

  // Land in the remembered active workspace if still a member, else the
  // earliest-joined one. A user with no membership gets undefined fields and
  // is bounced by app/(app)/layout.tsx.
  const member = await resolveInitialMembership(
    db,
    user.id,
    user.lastActiveWorkspaceId,
  );

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    sessionVersion: user.sessionVersion ?? 1,
    workspaceId: member?.workspaceId,
    workspaceType: member?.workspaceType,
    role: member?.role,
  };
}
