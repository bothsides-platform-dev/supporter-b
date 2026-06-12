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

  // Server-side revocation: the login-time sessionVersion rides in the token
  // as `sv` and is compared against users.session_version on every request.
  it('login stamps the sv claim from user.sessionVersion', async () => {
    const result = await jwt({
      token: {},
      user: { id: 'u9', sessionVersion: 3 },
    });
    expect(result.sv).toBe(3);
  });
});

describe('auth.config session callback', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = authConfig.callbacks!.session as (params: any) => Promise<any>;

  it('token.sv를 session.user.sessionVersion으로 노출한다 (requireSession 비교용)', async () => {
    const result = await session({
      session: { user: { id: 'u1', email: 'a@b.c' } },
      token: { id: 'u1', sv: 4 },
    });
    expect(result.user.sessionVersion).toBe(4);
  });
});

describe('auth.config session lifetime', () => {
  it('세션 maxAge는 7일이다 (기본 30일 금지 — 엔터프라이즈 요구)', () => {
    expect(authConfig.session?.maxAge).toBe(60 * 60 * 24 * 7);
  });
});
