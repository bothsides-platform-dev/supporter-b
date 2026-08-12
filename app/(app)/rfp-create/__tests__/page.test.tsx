// RfpNewPage 인증 가드 + PG 목록 조회 단위 테스트
//
// 세 가지를 검증한다:
// 1. PG 워크스페이스 → /home?notice=pg-rfp-blocked (페이지 자체 PG 차단)
// 2. 비로그인/미완료 세션 → requireBuyerPage가 /login?next=/rfp-create 등으로 이동
// 3. 테스트 PG 해제 쿠키가 repo.search 까지 전달되는지
//
// 3번이 페이지→searchWorkspaces→repo 전파를 실제로 검증하는 건 이 파일이
// `@/lib/server/workspaces/search` 를 mock 하지 **않아서**다 — mockSearch 는 그
// 래퍼가 실제로 호출하는 대상이다. 누가 여기에 search 래퍼 mock 을 추가하면
// 체인이 조용히 짧아져 이 어서션이 아무것도 보장하지 않게 된다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
const mockAuth = vi.hoisted(() => vi.fn());
const mockRequireBuyerPage = vi.hoisted(() => vi.fn());
const mockLimit = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockWhere = vi.hoisted(() => vi.fn(() => ({ limit: mockLimit })));
const mockFrom = vi.hoisted(() => vi.fn(() => ({ where: mockWhere })));
const mockSelectDb = vi.hoisted(() => vi.fn(() => ({ from: mockFrom })));
const mockFindById = vi.hoisted(() => vi.fn());
const mockSearch = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockCookieGet = vi.hoisted(() => vi.fn(() => undefined as { value: string } | undefined));

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: mockCookieGet }),
}));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/auth/page-guards', () => ({ requireBuyerPage: mockRequireBuyerPage }));
vi.mock('@/lib/db/client', () => ({ db: { select: mockSelectDb } }));
vi.mock('@/lib/server/repositories/factory', () => ({
  getWorkspaceRepo: () =>
    Promise.resolve({ findById: mockFindById, search: mockSearch }),
}));
vi.mock('@/components/rfp/RfpCreateWizard', () => ({
  RfpCreateWizard: () => null,
}));

import RfpNewPage from '../page';

const BUYER_SESSION = {
  user: {
    id: 'u-1',
    email: 'buyer@example.com',
    name: 'Buyer',
    workspaceId: 'ws-buyer',
    workspaceType: 'buyer' as const,
    role: 'admin' as const,
  },
};

describe('RfpNewPage — 인증 가드', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockAuth.mockReset();
    mockRequireBuyerPage.mockReset();
    mockLimit.mockResolvedValue([]);
    mockSearch.mockReset();
    mockSearch.mockResolvedValue([]);
    mockCookieGet.mockReset();
    mockCookieGet.mockReturnValue(undefined);
    mockFindById.mockResolvedValue({ name: 'Buyer Co', bizProfile: null });
  });

  it('PG 워크스페이스 사용자는 /home?notice=pg-rfp-blocked 으로 리다이렉트한다', async () => {
    mockAuth.mockResolvedValue({ user: { workspaceType: 'pg' } });

    await expect(RfpNewPage()).rejects.toThrow(
      'NEXT_REDIRECT:/home?notice=pg-rfp-blocked',
    );
    expect(mockRedirect).toHaveBeenCalledWith('/home?notice=pg-rfp-blocked');
  });

  it('requireBuyerPage 리다이렉트(비로그인 등)를 그대로 전파한다', async () => {
    mockAuth.mockResolvedValue(null);
    mockRequireBuyerPage.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT:/login?next=/rfp-create');
    });

    await expect(RfpNewPage()).rejects.toThrow('NEXT_REDIRECT:/login?next=/rfp-create');
  });

  it('buyer 세션에서 페이지가 정상적으로 엘리먼트를 반환한다', async () => {
    mockAuth.mockResolvedValue(BUYER_SESSION);
    mockRequireBuyerPage.mockResolvedValue(BUYER_SESSION);

    const el = await RfpNewPage();
    expect(el).not.toBeNull();
  });
});

describe('RfpNewPage — 테스트 PG 해제 쿠키', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockAuth.mockReset();
    mockRequireBuyerPage.mockReset();
    mockLimit.mockResolvedValue([]);
    mockSearch.mockReset();
    mockSearch.mockResolvedValue([]);
    mockCookieGet.mockReset();
    mockCookieGet.mockReturnValue(undefined);
    mockFindById.mockResolvedValue({ name: 'Buyer Co', bizProfile: null });
    mockAuth.mockResolvedValue(BUYER_SESSION);
    mockRequireBuyerPage.mockResolvedValue(BUYER_SESSION);
  });

  it('쿠키가 없으면 테스트 PG 를 제외하고 조회한다', async () => {
    await RfpNewPage();
    expect(mockSearch).toHaveBeenCalledWith({ type: 'pg', includeTest: false });
  });

  it("쿠키 값이 '1' 이면 테스트 PG 를 포함해 조회한다", async () => {
    mockCookieGet.mockReturnValue({ value: '1' });
    await RfpNewPage();
    expect(mockSearch).toHaveBeenCalledWith({ type: 'pg', includeTest: true });
    expect(mockCookieGet).toHaveBeenCalledWith('support-b-show-test-pg');
  });

  it("쿠키 값이 '0' 이면 해제되지 않는다", async () => {
    mockCookieGet.mockReturnValue({ value: '0' });
    await RfpNewPage();
    expect(mockSearch).toHaveBeenCalledWith({ type: 'pg', includeTest: false });
  });
});
