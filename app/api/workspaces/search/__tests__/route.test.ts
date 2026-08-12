// GET /api/workspaces/search — 인증 가드 테스트.
//
// buyer 타입 검색은 로그인 필수(401)이고, sv 가 stale 한(폐기된) 세션도
// 동일하게 거부해야 한다 — requireSession 미사용 라우트의 무효화 우회 방지(C3).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({
  auth: () => Promise.resolve(sessionRef.value),
}));

// 폐기 세션(sv stale) 차단용.
const getDbSessionVersionMock = vi.hoisted(() => vi.fn());
const getDbEmailVerifiedMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session-version-db', () => ({
  getDbSessionVersion: (...a: unknown[]) => getDbSessionVersionMock(...a),
  getDbEmailVerified: (...a: unknown[]) => getDbEmailVerifiedMock(...a),
}));

// 라우트가 모듈 로드 시 postgres-js 클라이언트를 당기지 않도록 차단 —
// 가드 테스트는 searchWorkspaces 까지 도달하지 않는다.
vi.mock('@/lib/db/client', () => ({ db: {} }));
const searchWorkspacesMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/workspaces/search', () => ({
  searchWorkspaces: (...a: unknown[]) => searchWorkspacesMock(...a),
}));

import { GET } from '../route';

function callGet(query: string, cookie?: string) {
  // 라우트는 next/headers 의 cookies() 가 아니라 request.cookies 를 읽는다 —
  // 여기서 헤더로 주입할 수 있는 이유이자, 이 파일이 next/headers 를 mock 하지
  // 않아도 되는 이유다.
  return GET(
    new NextRequest(`http://localhost/api/workspaces/search?${query}`, {
      headers: cookie ? { cookie } : undefined,
    }),
  );
}

beforeEach(() => {
  sessionRef.value = null;
  getDbSessionVersionMock.mockReset();
  getDbSessionVersionMock.mockResolvedValue(1);
  getDbEmailVerifiedMock.mockReset();
  getDbEmailVerifiedMock.mockResolvedValue(true);
  searchWorkspacesMock.mockReset();
  searchWorkspacesMock.mockResolvedValue([]);
});

describe('GET /api/workspaces/search — auth guard', () => {
  it('buyer 검색은 비로그인 시 401', async () => {
    const r = await callGet('q=acme&type=buyer');
    expect(r.status).toBe(401);
  });

  it('buyer 검색은 sv 가 stale 한(폐기된) 세션도 401', async () => {
    sessionRef.value = {
      user: { id: '00000000-0000-4000-8000-0000000000aa', email: 'x@x.com', sessionVersion: 1 },
    };
    getDbSessionVersionMock.mockResolvedValue(2);
    const r = await callGet('q=acme&type=buyer');
    expect(r.status).toBe(401);
  });

  it('pg 검색도 비로그인 시 401 (디렉터리 인증 필수 — 봉인입찰 비익명화 오라클 차단)', async () => {
    const r = await callGet('q=toss&type=pg');
    expect(r.status).toBe(401);
  });

  it('pg 검색은 buyer 활성 세션이면 200 (정규 소비자 = 견적요청 위저드 PG 피커)', async () => {
    sessionRef.value = {
      user: {
        id: '00000000-0000-4000-8000-0000000000bb',
        email: 'b@b.com',
        sessionVersion: 1,
        workspaceId: '00000000-0000-4000-8000-0000000000ws',
        workspaceType: 'buyer',
        role: 'member',
      },
    };
    const r = await callGet('q=toss&type=pg');
    expect(r.status).toBe(200);
  });

  // 역할 게이트 — 디렉터리(name↔UUID 맵)는 presence 관찰과 결합하면 경쟁사-집합
  // 신호가 된다 (docs/THREAT_MODEL.md §2.3). buyer 활성 세션 + type=pg 질의만 허용.
  it('pg 활성 세션은 403 — PG 에게 디렉터리를 주는 소비자가 없다', async () => {
    sessionRef.value = {
      user: {
        id: '00000000-0000-4000-8000-0000000000dd',
        email: 'p@p.com',
        sessionVersion: 1,
        workspaceId: '00000000-0000-4000-8000-0000000000w2',
        workspaceType: 'pg',
        role: 'member',
      },
    };
    const r = await callGet('q=acme&type=pg');
    expect(r.status).toBe(403);
  });

  it('워크스페이스 클레임 없는 세션은 403', async () => {
    sessionRef.value = {
      user: { id: '00000000-0000-4000-8000-0000000000ee', email: 'n@n.com', sessionVersion: 1 },
    };
    const r = await callGet('type=pg');
    expect(r.status).toBe(403);
  });

  it('buyer 세션이어도 type=buyer 질의는 403 — 구매사 디렉터리는 소비자가 없다', async () => {
    sessionRef.value = {
      user: {
        id: '00000000-0000-4000-8000-0000000000ff',
        email: 'b2@b.com',
        sessionVersion: 1,
        workspaceId: '00000000-0000-4000-8000-0000000000w3',
        workspaceType: 'buyer',
        role: 'member',
      },
    };
    const r = await callGet('q=acme&type=buyer');
    expect(r.status).toBe(403);
    expect(searchWorkspacesMock).not.toHaveBeenCalled();
  });

  it('type=buyer: 미인증 세션 → 403', async () => {
    sessionRef.value = { user: { id: 'u-1', sessionVersion: 1 } };
    getDbEmailVerifiedMock.mockResolvedValue(false);
    const r = await callGet('type=buyer');
    expect(r.status).toBe(403);
  });

  it('pg 검색 응답 항목에 logoUpdatedAt 가 포함된다', async () => {
    sessionRef.value = {
      user: {
        id: '00000000-0000-4000-8000-0000000000cc',
        email: 'c@c.com',
        sessionVersion: 1,
        workspaceId: '00000000-0000-4000-8000-0000000000w4',
        workspaceType: 'buyer',
        role: 'member',
      },
    };
    searchWorkspacesMock.mockResolvedValue([
      { id: 'ws-1', name: '토스페이먼츠', logoUpdatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const r = await callGet('type=pg');
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      workspaces: { id: string; logoUpdatedAt: string | null }[];
    };
    expect(body.workspaces[0].logoUpdatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('GET /api/workspaces/search — 테스트 PG 해제 쿠키', () => {
  const BUYER = {
    user: {
      id: '00000000-0000-4000-8000-0000000000dd',
      email: 'd@d.com',
      sessionVersion: 1,
      workspaceId: '00000000-0000-4000-8000-0000000000w5',
      workspaceType: 'buyer',
      role: 'member',
    },
  };

  it('쿠키가 없으면 테스트 PG 를 제외하고 조회한다', async () => {
    sessionRef.value = BUYER;
    await callGet('type=pg');
    expect(searchWorkspacesMock).toHaveBeenCalledWith({
      type: 'pg',
      includeTest: false,
      q: undefined,
    });
  });

  it("쿠키 값이 '1' 이면 테스트 PG 를 포함해 조회한다", async () => {
    sessionRef.value = BUYER;
    await callGet('type=pg', 'support-b-show-test-pg=1');
    expect(searchWorkspacesMock).toHaveBeenCalledWith({
      type: 'pg',
      includeTest: true,
      q: undefined,
    });
  });

  it("쿠키 값이 '0' 이면 해제되지 않는다", async () => {
    sessionRef.value = BUYER;
    await callGet('type=pg', 'support-b-show-test-pg=0');
    expect(searchWorkspacesMock).toHaveBeenCalledWith({
      type: 'pg',
      includeTest: false,
      q: undefined,
    });
  });

  it('무관한 쿠키만 있으면 해제되지 않는다', async () => {
    sessionRef.value = BUYER;
    await callGet('type=pg', 'rfpBoardView=board');
    expect(searchWorkspacesMock).toHaveBeenCalledWith({
      type: 'pg',
      includeTest: false,
      q: undefined,
    });
  });

  it('해제 쿠키가 있어도 역할 게이트가 먼저 막는다', async () => {
    sessionRef.value = { user: { id: 'u-x', sessionVersion: 1 } };
    const r = await callGet('type=pg', 'support-b-show-test-pg=1');
    expect(r.status).toBe(403);
    expect(searchWorkspacesMock).not.toHaveBeenCalled();
  });
});
