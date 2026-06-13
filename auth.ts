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
import Google from 'next-auth/providers/google';

import authConfig from './auth.config';
import { db } from '@/lib/db/client';
import { authorizeCredentials } from '@/lib/auth/credentials';
import { allowSignIn, makeNodeJwtCallback } from '@/lib/auth/master-login';

// Google is wired only when its OAuth client is configured (master/operator
// sign-in). Local dev / test without AUTH_GOOGLE_ID omit it entirely.
const googleEnabled = !!process.env.AUTH_GOOGLE_ID;

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
    ...(googleEnabled ? [Google] : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Default-deny: only a Google-verified email on the MASTER_ACCOUNT_EMAILS
    // allowlist may sign in via Google. Credentials sign-ins (already validated
    // by `authorize`) pass through.
    async signIn({ user, account, profile }) {
      return allowSignIn({
        provider: account?.provider,
        emailVerified: (profile as { email_verified?: boolean } | undefined)?.email_verified,
        email: profile?.email ?? user?.email,
      });
    },
    // On Google sign-in, provision/resolve the master `users` row and stamp our
    // DB id + active workspace before delegating to the edge-safe stamping.
    jwt: makeNodeJwtCallback(db, authConfig.callbacks!.jwt!),
  },
});
