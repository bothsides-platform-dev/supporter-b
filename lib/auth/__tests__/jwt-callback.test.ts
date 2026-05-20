// jwt callback — workspace stamping + active-workspace switch via unstable_update.
//
// The switch path (switchWorkspaceAction) calls `unstable_update({ user: {...} })`,
// which re-runs this callback with trigger==='update' and session=the passed data.
// The callback must merge those workspace fields into the token so the active
// workspace (and its derived type/role) changes without re-login.
import { describe, expect, it } from 'vitest';
import authConfig from '@/auth.config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jwt = authConfig.callbacks!.jwt as (params: any) => Promise<any>;

describe('auth.config jwt callback', () => {
  it('trigger=update merges session.user workspace fields into the token', async () => {
    const token = { id: 'u1', workspaceId: 'wsA', workspaceType: 'buyer', role: 'admin' };
    const result = await jwt({
      token,
      trigger: 'update',
      session: { user: { workspaceId: 'wsB', workspaceType: 'pg', role: 'member' } },
    });
    expect(result).toMatchObject({
      id: 'u1',
      workspaceId: 'wsB',
      workspaceType: 'pg',
      role: 'member',
    });
  });

  it('no trigger leaves existing token workspace fields unchanged', async () => {
    const token = { id: 'u1', workspaceId: 'wsA', workspaceType: 'buyer', role: 'admin' };
    const result = await jwt({ token });
    expect(result).toMatchObject({ workspaceId: 'wsA', workspaceType: 'buyer', role: 'admin' });
  });

  it('user present (login) stamps workspace fields from the user', async () => {
    const result = await jwt({
      token: {},
      user: { id: 'u9', workspaceId: 'wsX', workspaceType: 'pg', role: 'admin' },
    });
    expect(result).toMatchObject({
      id: 'u9',
      workspaceId: 'wsX',
      workspaceType: 'pg',
      role: 'admin',
    });
  });
});
