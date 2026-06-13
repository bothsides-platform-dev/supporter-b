/**
 * Edge-safe Auth.js v5 base config.
 *
 * Imported by both `auth.ts` (Node runtime — full config with DB-touching
 * `authorize`) and `proxy.ts` (Edge runtime — token-only, no DB).
 *
 * Hard rule: this file MUST NOT import anything that pulls a Node-only
 * driver into the bundle (postgres-js, bcryptjs, fs, etc.). It only
 * declares the JWT shape, callbacks, pages, and an empty Credentials
 * shell so the matcher in `proxy.ts` recognises the provider type.
 */
import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { sessionCookie } from '@/lib/auth/cookie-config';
import { isMasterEmail } from '@/lib/auth/master-allowlist';

export default {
  providers: [
    // Empty shell — the real `authorize` lives in `auth.ts`.
    // Kept here so `proxy.ts` can run the JWT-only `auth()` wrapper without
    // triggering edge-incompatible imports.
    Credentials({ credentials: {}, authorize: async () => null }),
  ],
  // 7-day cap (rolling — activity refreshes expiry). The next-auth default
  // would be 30d. Server-side revocation rides the `sv` claim stamped below.
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  cookies: { sessionToken: sessionCookie() },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.email = user.email ?? token.email;
        token.workspaceId = user.workspaceId;
        token.workspaceType = user.workspaceType;
        token.role = user.role;
        // Revocation comparand — `authorize` reads users.session_version at
        // login; requireSession()/the shell guard compare it every request.
        token.sv = user.sessionVersion;
      }
      // Active-workspace switch: `switchWorkspaceAction` validates membership in
      // DB then calls `unstable_update({ user: {...} })`, which re-runs this
      // callback with trigger==='update'. Merge the (already DB-validated)
      // workspace id/type/role into the token. No DB access here — this file is
      // edge-safe (shared with proxy.ts).
      if (
        trigger === 'update' &&
        session &&
        typeof session === 'object' &&
        'user' in session
      ) {
        const u = (session as { user?: Record<string, unknown> }).user;
        if (u) {
          if (typeof u.workspaceId === 'string') token.workspaceId = u.workspaceId;
          if (u.workspaceType === 'buyer' || u.workspaceType === 'pg') {
            token.workspaceType = u.workspaceType;
          }
          if (u.role === 'admin' || u.role === 'member') token.role = u.role;
        }
      }
      // Master/operator flag — re-derived from the server-only MASTER_ACCOUNT_EMAILS
      // allowlist on EVERY token pass (login + refresh). Derived, never trusted from
      // the inbound token, so a tampered `isMaster` claim cannot escalate; there is no
      // DB flag to drift. Edge-safe (pure env read).
      token.isMaster = isMasterEmail(token.email);
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? session.user.id;
        session.user.workspaceId = token.workspaceId;
        session.user.workspaceType = token.workspaceType;
        session.user.role = token.role;
        session.user.sessionVersion = token.sv;
        session.user.isMaster = token.isMaster;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
