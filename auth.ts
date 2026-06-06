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

import authConfig from './auth.config';
import { db } from '@/lib/db/client';
import { authorizeCredentials } from '@/lib/auth/credentials';

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      // Constant-time credential check (see lib/auth/credentials.ts). Returns
      // undefined workspace fields for a membership-less user, who is then
      // bounced by app/(app)/layout.tsx.
      authorize: (creds) => authorizeCredentials(db, creds),
    }),
  ],
});
