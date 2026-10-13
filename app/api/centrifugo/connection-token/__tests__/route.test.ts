/**
 * @vitest-environment node
 */
// POST /api/centrifugo/connection-token — issues a short-lived Centrifugo
// connection JWT for the authenticated user. 401 when no session.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jwtVerify } from 'jose';

const SECRET = 'route-test-hmac-secret';
const encode = (s: string) => new TextEncoder().encode(s);

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({
  auth: () => Promise.resolve(sessionRef.value),
}));
// 폐기 세션(sv stale) 차단용 — requireSession 미사용 라우트도 동일 기준 적용.
const getDbSessionVersionMock = vi.hoisted(() => vi.fn());
const getDbEmailVerifiedMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session-version-db', () => ({
  getDbSessionVersion: (...a: unknown[]) => getDbSessionVersionMock(...a),
  getDbEmailVerified: (...a: unknown[]) => getDbEmailVerifiedMock(...a),
}));


beforeEach(() => {
  // The route holds a module-scope, per-userId revocation cache (reconnect-storm
  // mitigation). Reset modules so each test gets a fresh cache — otherwise an
  // earlier test's verdict for a shared userId leaks into a later test.
  vi.resetModules();
  sessionRef.value = null;
  getDbSessionVersionMock.mockReset();
  getDbSessionVersionMock.mockResolvedValue(1);
  getDbEmailVerifiedMock.mockReset();
  getDbEmailVerifiedMock.mockResolvedValue(true);
  vi.stubEnv('CENTRIFUGO_TOKEN_HMAC_SECRET', SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function callPost() {
  const { POST } = await import('../route');
  return POST();
}

describe('POST /api/centrifugo/connection-token', () => {
  it('401 when unauthenticated', async () => {
    const r = await callPost();
    expect(r.status).toBe(401);
  });

  it('returns a connection token signed for the session user', async () => {
    sessionRef.value = { user: { id: 'user-99', email: 'u@x.com' } };

    const r = await callPost();
    expect(r.status).toBe(200);

    const body = await r.json();
    expect(typeof body.token).toBe('string');

    const { payload } = await jwtVerify(body.token, encode(SECRET));
    expect(payload.sub).toBe('user-99');
  });
});

describe('connection-token — 폐기 세션', () => {
  it('sv 가 stale 한(폐기된) 세션은 401', async () => {
    sessionRef.value = { user: { id: 'user-99', email: 'u@x.com', sessionVersion: 1 } };
    getDbSessionVersionMock.mockResolvedValue(2);
    const r = await callPost();
    expect(r.status).toBe(401);
  });

  it.each([
    { versions: [2, 1], statuses: [200, 401], order: '정상 → 폐기' },
    { versions: [1, 2], statuses: [401, 200], order: '폐기 → 정상' },
    { versions: [2, undefined], statuses: [200, 401], order: '정상 → 구버전' },
  ])('$order 순서로 같은 계정이 요청해도 세션별로 판정한다', async ({ versions, statuses }) => {
    getDbSessionVersionMock.mockResolvedValue(2);
    for (const [index, sessionVersion] of versions.entries()) {
      sessionRef.value = { user: { id: 'shared-user', email: 'u@x.com', sessionVersion } };
      const response = await callPost();
      expect(response.status).toBe(statuses[index]);
      if (response.status === 401) expect(await response.text()).toBe('Unauthorized');
    }
    expect(getDbSessionVersionMock).toHaveBeenCalledTimes(1);
    expect(getDbEmailVerifiedMock).toHaveBeenCalledTimes(1);
  });

  it('다른 계정의 최신 세션 버전과 이메일 인증 상태를 섞지 않는다', async () => {
    getDbSessionVersionMock.mockImplementation(async (id: string) => id === 'user-a' ? 2 : 1);
    getDbEmailVerifiedMock.mockImplementation(async (id: string) => id === 'user-a');
    sessionRef.value = { user: { id: 'user-a', email: 'a@x.com', sessionVersion: 2 } };
    expect((await callPost()).status).toBe(200);
    sessionRef.value = { user: { id: 'user-b', email: 'b@x.com', sessionVersion: 1 } };
    expect((await callPost()).status).toBe(403);
    sessionRef.value = { user: { id: 'user-a', email: 'a@x.com', sessionVersion: 1 } };
    expect((await callPost()).status).toBe(401);
  });

  it('삭제된 계정은 이메일 인증 검사보다 먼저 401로 차단한다', async () => {
    getDbSessionVersionMock.mockResolvedValue(null);
    getDbEmailVerifiedMock.mockResolvedValue(false);
    sessionRef.value = { user: { id: 'deleted-user', email: 'u@x.com', sessionVersion: 1 } };
    const response = await callPost();
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Unauthorized');
  });
});

describe('connection-token — 이메일 미인증', () => {
  it('미인증 세션은 403', async () => {
    sessionRef.value = { user: { id: 'user-99', email: 'u@x.com', sessionVersion: 1 } };
    getDbEmailVerifiedMock.mockResolvedValue(false);
    const r = await callPost();
    expect(r.status).toBe(403);
  });
});

describe('connection-token — 부하 차단(load shedding)', () => {
  it('CENTRIFUGO_TOKEN_MAX_INFLIGHT=0 이면 503 Retry-After 를 반환한다', async () => {
    // MAX_INFLIGHT is read at module load; resetModules() + stubEnv before
    // callPost() ensures the freshly-imported route sees the value 0.
    vi.stubEnv('CENTRIFUGO_TOKEN_MAX_INFLIGHT', '0');
    const r = await callPost();
    expect(r.status).toBe(503);
    expect(r.headers.get('Retry-After')).toMatch(/^[1-4]$/);
  });

  it('진행 중 요청이 한도에 차면 즉시 503으로 거절하고 완료 후 슬롯을 돌려준다', async () => {
    vi.stubEnv('CENTRIFUGO_TOKEN_MAX_INFLIGHT', '1');
    sessionRef.value = { user: { id: 'inflight-user', email: 'u@x.com', sessionVersion: 1 } };
    let finishRead!: (version: number) => void;
    let startedRead!: () => void;
    const started = new Promise<void>((resolve) => { startedRead = resolve; });
    getDbSessionVersionMock.mockImplementationOnce(() => {
      startedRead();
      return new Promise<number>((resolve) => { finishRead = resolve; });
    });
    const firstRequest = callPost();
    await started;
    const shed = await callPost();
    expect(shed.status).toBe(503);
    expect(shed.headers.get('Retry-After')).toMatch(/^[1-4]$/);
    expect(getDbSessionVersionMock).toHaveBeenCalledTimes(1);
    finishRead(1);
    expect((await firstRequest).status).toBe(200);
    expect((await callPost()).status).toBe(200);
  });
});

describe('connection-token — 게이트 캐시 TTL', () => {
  it('TTL 안에 재접속하면 DB 재조회 없이 캐시를 사용한다', async () => {
    sessionRef.value = { user: { id: 'user-cache', email: 'c@x.com', sessionVersion: 1 } };
    // First call — populates the per-userId gate cache.
    const r1 = await callPost();
    expect(r1.status).toBe(200);
    const callsBefore = getDbSessionVersionMock.mock.calls.length;
    // Second call — must reuse the same module (no resetModules between calls)
    // so the in-memory cache survives. Within the 10 s TTL, no extra DB query.
    const { POST } = await import('../route');
    await POST();
    expect(getDbSessionVersionMock.mock.calls.length).toBe(callsBefore);
  });

  it.each([
    { version: 2, verified: true, status: 401, change: '세션 폐기' },
    { version: null, verified: false, status: 401, change: '계정 삭제' },
    { version: 1, verified: false, status: 403, change: '이메일 미인증' },
  ])('TTL 10초가 지나면 $change 상태를 새로 반영한다', async ({ version, verified, status }) => {
    // Use fake timers so Date.now() is controllable.
    vi.useFakeTimers();
    sessionRef.value = { user: { id: 'user-ttl-expire', email: 'ttl@x.com', sessionVersion: 1 } };
    // First call — populates the gate cache at t=0.
    const r1 = await callPost();
    expect(r1.status).toBe(200);
    const callsAfterFirst = getDbSessionVersionMock.mock.calls.length;
    getDbSessionVersionMock.mockResolvedValue(version);
    getDbEmailVerifiedMock.mockResolvedValue(verified);
    vi.advanceTimersByTime(9_999);
    expect((await callPost()).status).toBe(200);
    expect(getDbSessionVersionMock).toHaveBeenCalledTimes(callsAfterFirst);
    vi.advanceTimersByTime(1);
    expect((await callPost()).status).toBe(status);
    expect(getDbSessionVersionMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe('connection-token — workspaceId', () => {
  it('세션 workspaceId 를 JWT info.workspaceId 클레임에 포함한다', async () => {
    sessionRef.value = {
      user: { id: 'user-ws', email: 'ws@x.com', workspaceId: 'ws-42', sessionVersion: 1 },
    };
    const r = await callPost();
    expect(r.status).toBe(200);
    const { token } = await r.json();
    const { payload } = await jwtVerify(token, encode(SECRET));
    expect((payload.info as { workspaceId: string }).workspaceId).toBe('ws-42');
  });
});

// Workspace status is exercised with real DB rows in workspace-status.test.ts.
vi.mock('@/lib/auth/workspace-status', () => ({ isWorkspaceInactive: async () => false }));
