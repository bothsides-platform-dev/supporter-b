import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_BID_DRAFT } from '@/lib/quote/bid-draft';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), service: vi.fn(), submit: vi.fn(), findRfp: vi.fn() }));
vi.mock('../_session', () => ({ requirePgActor: () => mocks.actor() }));
vi.mock('@/lib/server/services/bid-draft', () => ({
  getBidDraftService: () => mocks.service(),
}));
vi.mock('@/lib/server/services/bid', () => ({
  getBidService: async () => ({ submit: mocks.submit }),
}));
vi.mock('@/lib/server/repositories/factory', () => ({
  getRfpRepo: async () => ({ findById: mocks.findRfp }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import {
  loadBidDraftAction,
  saveBidDraftAction,
  deleteBidDraftAction,
  listBidDraftsAction,
  submitBidDraftAction,
} from '../bid-drafts';
const scope = {
  userId: 'a0000000-0000-4000-8000-000000000001',
  workspaceId: 'b0000000-0000-4000-8000-000000000001',
  rfpId: 'c0000000-0000-4000-8000-000000000001',
  roundKey: 'initial',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    ok: true,
    userId: scope.userId,
    workspaceId: scope.workspaceId,
  });
});
const calls = [
  () => loadBidDraftAction(scope),
  () => listBidDraftsAction(scope),
  () => saveBidDraftAction(scope, EMPTY_BID_DRAFT, 0),
  () => deleteBidDraftAction(scope, 1),
  () => submitBidDraftAction(scope, 1),
];
describe('개인 초안 액션의 현재 세션 경계', () => {
  it.each(['userId', 'workspaceId'] as const)(
    '%s 변경 후 이전 화면의 조회·저장·삭제·제출을 거부한다',
    async (key) => {
      mocks.actor.mockResolvedValue({
        ok: true,
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        [key]: 'd0000000-0000-4000-8000-000000000001',
      });
      for (const call of calls)
        expect(await call()).toMatchObject({
          ok: false,
          error: 'SESSION_CHANGED',
        });
      expect(mocks.service).not.toHaveBeenCalled();
    },
  );
  it('승인이 취소되면 어떤 초안 액션도 서비스에 도달하지 않는다', async () => {
    mocks.actor.mockResolvedValue({ ok: false, error: 'PG_NOT_APPROVED' });
    for (const call of calls)
      expect(await call()).toMatchObject({
        ok: false,
        error: 'PG_NOT_APPROVED',
      });
    expect(mocks.service).not.toHaveBeenCalled();
  });
});

describe('새 견적의 기본 발송 경로', () => {
  it('추가 환경 설정 없이 저장된 v2 조건을 제출한다', async () => {
    mocks.service.mockResolvedValue({
      load: vi.fn().mockResolvedValue({
        ok: true,
        draft: {
          revision: 1,
          content: {
            ...EMPTY_BID_DRAFT,
            settleLimit: '50000000',
            fees: { 'card:general': '1.5' },
            conditionStates: {
              signupFee: 'not_applicable',
              guaranteeInsurance: 'negotiable',
              'card:general': 'confirmed',
            },
          },
        },
      }),
    });
    mocks.findRfp.mockResolvedValue({
      requiredPaymentMethods: ['card'],
      customPaymentMethods: [],
    });
    mocks.submit.mockResolvedValue({ ok: true, bidId: 'bid-1', rfpCode: 'P-2611-0001' });

    expect(await submitBidDraftAction(scope, 1)).toMatchObject({ ok: true, bidId: 'bid-1' });
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteTerms: expect.objectContaining({ _v: 2 }),
        signupFee: null,
        guaranteeInsurance: null,
        paymentFees: { card: { general: 0.015 } },
        draft: { scope, revision: 1 },
      }),
      expect.objectContaining({ userId: scope.userId, workspaceId: scope.workspaceId }),
    );
  });
});
