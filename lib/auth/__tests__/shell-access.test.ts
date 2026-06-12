import { describe, it, expect } from 'vitest';
import {
  resolveShellAccess,
  INCOMPLETE_SESSION_REDIRECT,
} from '../shell-access';
import type { WorkspaceMembershipSummary } from '@/lib/types/workspace';

function ws(
  over: Partial<WorkspaceMembershipSummary> = {},
): WorkspaceMembershipSummary {
  return {
    id: 'ws-1',
    name: 'Acme',
    type: 'buyer',
    status: 'active',
    role: 'admin',
    unreadCount: 0,
    hasLogo: false,
    ...over,
  };
}

const completeUser = {
  id: 'u-1',
  workspaceId: 'ws-1',
  workspaceType: 'buyer' as const,
};

describe('resolveShellAccess — (app) shell auth guard contract', () => {
  it('genuinely unauthenticated (null session) → /login', () => {
    expect(resolveShellAccess(null, [])).toEqual({
      kind: 'redirect',
      to: '/login',
    });
  });

  it('session without user.id → /login', () => {
    expect(resolveShellAccess({ user: {} }, [])).toEqual({
      kind: 'redirect',
      to: '/login',
    });
  });

  // The loop-safety contract: an authenticated JWT missing its workspace claim
  // must go to /logout, NOT /login — proxy.ts bounces any authenticated user off
  // /login back to /home, so /login would loop forever (ERR_TOO_MANY_REDIRECTS).
  it('authenticated but missing workspaceId → /logout (not /login)', () => {
    const d = resolveShellAccess(
      { user: { id: 'u-1', workspaceType: 'buyer' } },
      [],
    );
    expect(d).toEqual({ kind: 'redirect', to: INCOMPLETE_SESSION_REDIRECT });
    expect(d).toEqual({ kind: 'redirect', to: '/logout' });
  });

  it('authenticated but missing workspaceType → /logout (not /login)', () => {
    expect(
      resolveShellAccess({ user: { id: 'u-1', workspaceId: 'ws-1' } }, []),
    ).toEqual({ kind: 'redirect', to: INCOMPLETE_SESSION_REDIRECT });
  });

  it('complete token but DB shows no live membership → /logout (not /login)', () => {
    expect(resolveShellAccess({ user: completeUser }, [])).toEqual({
      kind: 'redirect',
      to: INCOMPLETE_SESSION_REDIRECT,
    });
  });

  it('healthy session → render with the JWT-matched active workspace', () => {
    const a = ws({ id: 'ws-1', name: 'Buyer Co' });
    const b = ws({ id: 'ws-2', name: 'Other', type: 'pg' });
    expect(resolveShellAccess({ user: completeUser }, [b, a])).toEqual({
      kind: 'render',
      active: a,
    });
  });

  it('JWT workspaceId not among memberships → render, fall back to first membership', () => {
    const first = ws({ id: 'ws-9', name: 'First' });
    const d = resolveShellAccess(
      { user: { id: 'u-1', workspaceId: 'stale-ws', workspaceType: 'buyer' } },
      [first],
    );
    expect(d).toEqual({ kind: 'render', active: first });
  });

  it('active workspace pending approval → /pending-approval', () => {
    expect(
      resolveShellAccess({ user: completeUser }, [ws({ status: 'pending' })]),
    ).toEqual({ kind: 'redirect', to: '/pending-approval' });
  });

  it('active workspace suspended → /suspended', () => {
    expect(
      resolveShellAccess({ user: completeUser }, [ws({ status: 'suspended' })]),
    ).toEqual({ kind: 'redirect', to: '/suspended' });
  });

  // Server-side revocation (C3): a JWT whose sv claim trails users.session_version
  // (bumped on password reset / email change / deletion) is dead. Same loop-safety
  // contract as the other authenticated-but-invalid branches: /logout, never /login.
  describe('sessionVersion revocation', () => {
    it('토큰 sv가 DB보다 낮으면(비번 변경 후 옛 토큰) → /logout', () => {
      expect(
        resolveShellAccess({ user: completeUser }, [ws()], {
          token: 1,
          db: 2,
        }),
      ).toEqual({ kind: 'redirect', to: INCOMPLETE_SESSION_REDIRECT });
    });

    it('토큰 sv와 DB가 일치하면 정상 렌더', () => {
      const a = ws();
      expect(
        resolveShellAccess({ user: completeUser }, [a], { token: 2, db: 2 }),
      ).toEqual({ kind: 'render', active: a });
    });

    it('sv claim 없는 레거시 토큰 + DB 기본값 1 → 정상 렌더 (배포 시 강제 로그아웃 없음)', () => {
      const a = ws();
      expect(
        resolveShellAccess({ user: completeUser }, [a], {
          token: undefined,
          db: 1,
        }),
      ).toEqual({ kind: 'render', active: a });
    });

    it('DB에 사용자 행이 없으면(null) → /logout', () => {
      expect(
        resolveShellAccess({ user: completeUser }, [ws()], {
          token: 1,
          db: null,
        }),
      ).toEqual({ kind: 'redirect', to: INCOMPLETE_SESSION_REDIRECT });
    });
  });
});
