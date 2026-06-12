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
  }
}
