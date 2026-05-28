import { describe, it, expect } from 'vitest';
import { resolvePageAccess } from '../page-access';

const buyer = {
  user: { id: 'u-1', workspaceId: 'ws-1', workspaceType: 'buyer' as const },
};
const pg = {
  user: { id: 'u-2', workspaceId: 'ws-2', workspaceType: 'pg' as const },
};

describe('resolvePageAccess — single-workspace-type page guard', () => {
  it('unauthenticated → /login?next=<path> (carries the return path)', () => {
    expect(resolvePageAccess(null, 'buyer', '/rfp')).toBe('/login?next=/rfp');
    expect(resolvePageAccess({ user: {} }, 'pg', '/inbox')).toBe(
      '/login?next=/inbox',
    );
  });

  // Loop-safety: an authenticated session missing its workspace claim must NOT
  // go to /login (proxy bounces it back) — it goes to /logout, same contract as
  // the (app) shell guard.
  it('authenticated but no workspace claim → /logout (not /login)', () => {
    expect(
      resolvePageAccess({ user: { id: 'u-1' } }, 'buyer', '/rfp'),
    ).toBe('/logout');
  });

  // Wrong workspace type (e.g. a PG user opening a buyer page) is authenticated
  // and complete — sending to /login would loop; send to the neutral /home.
  it('wrong workspace type → /home (not /login, not /logout)', () => {
    expect(resolvePageAccess(pg, 'buyer', '/rfp')).toBe('/home');
    expect(resolvePageAccess(buyer, 'pg', '/inbox')).toBe('/home');
  });

  it('correct type + complete session → null (allowed)', () => {
    expect(resolvePageAccess(buyer, 'buyer', '/rfp')).toBeNull();
    expect(resolvePageAccess(pg, 'pg', '/inbox')).toBeNull();
  });
});
