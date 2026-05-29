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
});
