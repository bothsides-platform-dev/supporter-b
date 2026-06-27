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

function callGet(query: string) {
  return GET(new NextRequest(`http://localhost/api/workspaces/search?${query}`));
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

  it('pg 검색은 인증된 세션은 200', async () => {
    sessionRef.value = {
      user: { id: '00000000-0000-4000-8000-0000000000bb', email: 'b@b.com', sessionVersion: 1 },
    };
    const r = await callGet('q=toss&type=pg');
    expect(r.status).toBe(200);
  });

  it('type=buyer: 미인증 세션 → 403', async () => {
    sessionRef.value = { user: { id: 'u-1', sessionVersion: 1 } };
    getDbEmailVerifiedMock.mockResolvedValue(false);
    const r = await callGet('type=buyer');
    expect(r.status).toBe(403);
  });

  it('pg 검색 응답 항목에 logoUpdatedAt 가 포함된다', async () => {
    sessionRef.value = {
      user: { id: '00000000-0000-4000-8000-0000000000cc', email: 'c@c.com', sessionVersion: 1 },
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
