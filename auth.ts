/**
 * Node-runtime Auth.js v5 entry point.
 *
 * Exports `handlers`, `auth`, `signIn`, `signOut` — the full config with
 * a DB-touching `authorize` callback. Used by:
 * - `app/api/auth/[...nextauth]/route.ts` (route handler GET/POST)
 * - Server components / server actions via `auth()` and `lib/auth/session.ts`
 * - `app/logout/route.ts` via `signOut`
 *
 * `proxy.ts` must NOT import this module — it imports `auth.config.ts`
 * directly to stay edge-safe.
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { eq } from 'drizzle-orm';

import authConfig from './auth.config';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { resolveInitialMembership } from '@/lib/auth/active-workspace';

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null;
        const email = String(creds.email).toLowerCase().trim();
        const password = String(creds.password);

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!user) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        // Land in the remembered active workspace if still a member, else the
        // earliest-joined one. A user with no membership gets undefined fields
        // and is bounced by app/(app)/layout.tsx.
        const member = await resolveInitialMembership(
          db,
          user.id,
          user.lastActiveWorkspaceId,
        );

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          workspaceId: member?.workspaceId,
          workspaceType: member?.workspaceType,
          role: member?.role,
        };
      },
    }),
  ],
});
