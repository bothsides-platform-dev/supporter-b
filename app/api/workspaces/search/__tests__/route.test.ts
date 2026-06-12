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
vi.mock('@/lib/auth/session-version-db', () => ({
  getDbSessionVersion: (...a: unknown[]) => getDbSessionVersionMock(...a),
}));

// 라우트가 모듈 로드 시 postgres-js 클라이언트를 당기지 않도록 차단 —
// 가드 테스트는 searchWorkspaces 까지 도달하지 않는다.
vi.mock('@/lib/db/client', () => ({ db: {} }));
const searchWorkspacesMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/workspaces/search', () => ({
  searchWorkspaces: (...a: unknown[]) => searchWorkspacesMock(...a),
}));

import { GET } from '../route';

function callGet(query: string) {
  return GET(new NextRequest(`http://localhost/api/workspaces/search?${query}`));
}

beforeEach(() => {
  sessionRef.value = null;
  getDbSessionVersionMock.mockReset();
  getDbSessionVersionMock.mockResolvedValue(1);
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

  it('pg 검색은 비로그인도 허용 (공개 디스커버리)', async () => {
    const r = await callGet('q=toss&type=pg');
    expect(r.status).toBe(200);
  });
});
