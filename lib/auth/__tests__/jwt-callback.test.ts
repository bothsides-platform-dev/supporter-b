// jwt callback — workspace stamping + active-workspace switch via unstable_update.
//
// The switch path (switchWorkspaceAction) calls `unstable_update({ user: {...} })`,
// which re-runs this callback with trigger==='update' and session=the passed data.
// The callback must merge those workspace fields into the token so the active
// workspace (and its derived type/role) changes without re-login.
import { describe, expect, it, afterEach } from 'vitest';
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

describe('auth.config jwt callback — isMaster (env allowlist 유도)', () => {
  const ORIGINAL = process.env.MASTER_ACCOUNT_EMAILS;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
    else process.env.MASTER_ACCOUNT_EMAILS = ORIGINAL;
  });

  it('로그인 시 allowlist 이메일이면 token.isMaster=true (+ token.email 스탬프)', async () => {
    process.env.MASTER_ACCOUNT_EMAILS = 'help@support-b.com';
    const result = await jwt({
      token: {},
      user: { id: 'm1', email: 'help@support-b.com', sessionVersion: 1 },
    });
    expect(result.email).toBe('help@support-b.com');
    expect(result.isMaster).toBe(true);
  });

  it('로그인 시 allowlist가 아니면 token.isMaster=false', async () => {
    process.env.MASTER_ACCOUNT_EMAILS = 'help@support-b.com';
    const result = await jwt({
      token: {},
      user: { id: 'u2', email: 'buyer@example.com', sessionVersion: 1 },
    });
    expect(result.isMaster).toBe(false);
  });

  it('갱신(user 없음) 시에도 token.email에서 isMaster를 재유도한다', async () => {
    process.env.MASTER_ACCOUNT_EMAILS = 'help@support-b.com';
    const result = await jwt({ token: { id: 'm1', email: 'help@support-b.com' } });
    expect(result.isMaster).toBe(true);
  });

  it('위조 토큰(isMaster:true지만 email이 allowlist 아님)은 false로 재유도된다', async () => {
    process.env.MASTER_ACCOUNT_EMAILS = 'help@support-b.com';
    const result = await jwt({ token: { id: 'x', email: 'intruder@gmail.com', isMaster: true } });
    expect(result.isMaster).toBe(false);
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

  it('token.isMaster를 session.user.isMaster로 노출한다', async () => {
    const result = await session({
      session: { user: { id: 'm1', email: 'help@support-b.com' } },
      token: { id: 'm1', isMaster: true },
    });
    expect(result.user.isMaster).toBe(true);
  });
});

describe('auth.config session lifetime', () => {
  it('세션 maxAge는 7일이다 (기본 30일 금지 — 엔터프라이즈 요구)', () => {
    expect(authConfig.session?.maxAge).toBe(60 * 60 * 24 * 7);
  });
});
