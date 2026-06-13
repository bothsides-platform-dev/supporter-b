import 'next-auth';
import 'next-auth/jwt';

type WorkspaceType = 'buyer' | 'pg';
type MemberRole = 'admin' | 'member';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      workspaceId?: string;
      workspaceType?: WorkspaceType;
      role?: MemberRole;
      /** Mirror of the JWT `sv` claim — server-side revocation comparand. */
      sessionVersion?: number;
      /** Master/operator account — derived from the MASTER_ACCOUNT_EMAILS allowlist. */
      isMaster?: boolean;
    };
  }

  interface User {
    workspaceId?: string;
    workspaceType?: WorkspaceType;
    role?: MemberRole;
    sessionVersion?: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    workspaceId?: string;
    workspaceType?: WorkspaceType;
    role?: MemberRole;
    /** users.session_version at login — see lib/auth/session-version.ts. */
    sv?: number;
    /** Master/operator account — re-derived from MASTER_ACCOUNT_EMAILS every token pass. */
    isMaster?: boolean;
  }
}
