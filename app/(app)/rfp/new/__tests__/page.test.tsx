// RfpNewPage 인증 가드 단위 테스트
//
// 두 가드를 검증한다:
// 1. PG 워크스페이스 → /home?notice=pg-rfp-blocked (페이지 자체 PG 차단)
// 2. 비로그인/미완료 세션 → requireBuyerPage가 /login?next=/rfp/new 등으로 이동
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

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/auth/page-guards', () => ({ requireBuyerPage: mockRequireBuyerPage }));
vi.mock('@/lib/db/client', () => ({ db: { select: mockSelectDb } }));
vi.mock('@/lib/server/repositories/factory', () => ({
  getWorkspaceRepo: () => Promise.resolve({ findById: mockFindById }),
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
      throw new Error('NEXT_REDIRECT:/login?next=/rfp/new');
    });

    await expect(RfpNewPage()).rejects.toThrow('NEXT_REDIRECT:/login?next=/rfp/new');
  });

  it('buyer 세션에서 페이지가 정상적으로 엘리먼트를 반환한다', async () => {
    mockAuth.mockResolvedValue(BUYER_SESSION);
    mockRequireBuyerPage.mockResolvedValue(BUYER_SESSION);

    const el = await RfpNewPage();
    expect(el).not.toBeNull();
  });
});
