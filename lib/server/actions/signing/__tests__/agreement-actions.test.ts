import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/server/actions/_session', () => ({
  requireActiveWorkspace: vi.fn(),
  requirePgActor: vi.fn(),
}));
vi.mock('@/lib/server/services/agreement', () => ({
  getAgreementService: vi.fn(),
}));
vi.mock('@/lib/server/services/contract-signing', () => ({
  getContractSigningService: vi.fn(),
}));
import { requirePgActor, requireActiveWorkspace } from '@/lib/server/actions/_session';
import { getAgreementService } from '@/lib/server/services/agreement';
import { saveAgreementAction, getAgreementAction, sendAgreementAction } from '../agreementActions';
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePgActor).mockResolvedValue({
    ok: true,
    userId: 'u',
    workspaceId: 'pg',
    email: 'u@example.com',
  });
});
it('미승인 세션은 합의서를 읽지 못한다', async () => {
  vi.mocked(requireActiveWorkspace).mockResolvedValue({
    ok: false,
    error: 'FORBIDDEN_PG',
  });
  expect(await getAgreementAction({ contractId: 'id' })).toEqual({
    ok: false,
    error: 'FORBIDDEN_PG',
  });
  expect(getAgreementService).not.toHaveBeenCalled();
});
it('직접 액션 호출의 본문·요율 주입과 유효하지 않은 판본을 거부한다', async () => {
  const party = { company: '', bizNo: '', address: '', representative: '' };
  expect(
    await saveAgreementAction({
      contractId: 'aaaaaaaa-0000-4000-8000-000000000001',
      revision: 0,
      parties: { buyer: party, pg: party },
      fees: [],
    } as never),
  ).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
  expect(
    await sendAgreementAction({
      contractId: 'aaaaaaaa-0000-4000-8000-000000000001',
      stamp: '',
    }),
  ).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
  expect(getAgreementService).not.toHaveBeenCalled();
});
