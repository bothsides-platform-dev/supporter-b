import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/actions/_session', () => ({ requirePgActor: vi.fn() }));
vi.mock('@/lib/server/repositories/factory', () => ({ getRfpRepo: vi.fn() }));
vi.mock('@/lib/server/services/contract-signing', () => ({ getContractSigningService: vi.fn() }));

import { requirePgActor } from '@/lib/server/actions/_session';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { sendComposedSigningContractAction } from '../sendComposedSigningContractAction';

const actor = { ok: true as const, userId: 'u1', workspaceId: 'ws1', email: 'u1@example.com' };

function withRfp(id: string | undefined) {
  vi.mocked(getRfpRepo).mockResolvedValue({
    findByCode: vi.fn(async () => (id ? { id } : undefined)),
  } as never);
}

beforeEach(() => {
  vi.mocked(requirePgActor).mockResolvedValue(actor);
});
afterEach(() => vi.clearAllMocks());

describe('sendComposedSigningContractAction', () => {
  it('견적번호를 id 로 풀어 서비스에 위임한다', async () => {
    withRfp('rfp-uuid');
    const sendComposedContract = vi.fn(async () => ({ ok: true }));
    vi.mocked(getContractSigningService).mockResolvedValue({ sendComposedContract } as never);

    const result = await sendComposedSigningContractAction({ rfpCode: 'P-2608-0001' });

    expect(result).toEqual({ ok: true });
    expect(sendComposedContract).toHaveBeenCalledWith('rfp-uuid', {
      userId: 'u1',
      workspaceId: 'ws1',
    });
  });

  // 이어받기 확인은 UI 가 받는다 — 액션은 플래그를 서비스 opts 로 그대로 통과시킨다.
  it('takeOver 를 서비스 opts 로 통과시킨다', async () => {
    withRfp('rfp-uuid');
    const sendComposedContract = vi.fn(async () => ({ ok: true }));
    vi.mocked(getContractSigningService).mockResolvedValue({ sendComposedContract } as never);

    const result = await sendComposedSigningContractAction({
      rfpCode: 'P-2608-0001',
      takeOver: true,
    });

    expect(result).toEqual({ ok: true });
    expect(sendComposedContract).toHaveBeenCalledWith(
      'rfp-uuid',
      { userId: 'u1', workspaceId: 'ws1' },
      { takeOver: true },
    );
  });

  it('견적번호가 안 풀리면 RFP_NOT_FOUND', async () => {
    withRfp(undefined);
    const result = await sendComposedSigningContractAction({ rfpCode: 'missing' });
    expect(result).toEqual({ ok: false, error: 'RFP_NOT_FOUND' });
  });

  // PG 세션이 아니면 서비스를 아예 만들지 않는다 — 게이트가 액션 맨 앞이다.
  it('PG 액터가 아니면 서비스에 닿지 않는다', async () => {
    vi.mocked(requirePgActor).mockResolvedValue({ ok: false, error: 'FORBIDDEN_PG' } as never);

    const result = await sendComposedSigningContractAction({ rfpCode: 'P-2608-0001' });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
    expect(getContractSigningService).not.toHaveBeenCalled();
  });

  it('알 수 없는 키가 섞이면 INVALID_INPUT (strict 스키마)', async () => {
    const result = await sendComposedSigningContractAction({
      rfpCode: 'P-2608-0001',
      // @ts-expect-error — 런타임 방어를 재는 테스트다
      surprise: true,
    });
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });
});
