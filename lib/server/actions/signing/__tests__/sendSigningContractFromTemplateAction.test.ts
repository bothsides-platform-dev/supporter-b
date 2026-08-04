import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/actions/_session', () => ({ requirePgActor: vi.fn() }));
vi.mock('@/lib/server/repositories/factory', () => ({ getRfpRepo: vi.fn() }));
vi.mock('@/lib/server/services/contract-signing', () => ({ getContractSigningService: vi.fn() }));

import { requirePgActor } from '@/lib/server/actions/_session';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { sendSigningContractFromTemplateAction } from '../sendSigningContractFromTemplateAction';

const actor = { ok: true as const, userId: 'u1', workspaceId: 'ws1', email: 'u1@example.com' };

beforeEach(() => {
  vi.mocked(requirePgActor).mockResolvedValue(actor);
});
afterEach(() => vi.clearAllMocks());

describe('sendSigningContractFromTemplateAction', () => {
  it('resolves the rfp by code and delegates sendFromTemplate to the service', async () => {
    vi.mocked(getRfpRepo).mockResolvedValue({
      findByCode: vi.fn(async () => ({ id: 'rfp-uuid' })),
    } as never);
    const sendFromTemplate = vi.fn(async () => ({ ok: true }));
    vi.mocked(getContractSigningService).mockResolvedValue({ sendFromTemplate } as never);

    const result = await sendSigningContractFromTemplateAction({ rfpCode: 'P-2608-0001' });

    expect(result).toEqual({ ok: true });
    expect(sendFromTemplate).toHaveBeenCalledWith('rfp-uuid', { userId: 'u1', workspaceId: 'ws1' });
  });

  // 이어받기 확인은 UI 가 받는다 — 액션은 플래그를 서비스 opts 로 그대로 통과시킨다.
  it('passes takeOver through to the service opts', async () => {
    vi.mocked(getRfpRepo).mockResolvedValue({
      findByCode: vi.fn(async () => ({ id: 'rfp-uuid' })),
    } as never);
    const sendFromTemplate = vi.fn(async () => ({ ok: true }));
    vi.mocked(getContractSigningService).mockResolvedValue({ sendFromTemplate } as never);

    const result = await sendSigningContractFromTemplateAction({
      rfpCode: 'P-2608-0001',
      takeOver: true,
    });

    expect(result).toEqual({ ok: true });
    expect(sendFromTemplate).toHaveBeenCalledWith(
      'rfp-uuid',
      { userId: 'u1', workspaceId: 'ws1' },
      { takeOver: true },
    );
  });

  it('returns RFP_NOT_FOUND when the code does not resolve', async () => {
    vi.mocked(getRfpRepo).mockResolvedValue({ findByCode: vi.fn(async () => undefined) } as never);

    const result = await sendSigningContractFromTemplateAction({ rfpCode: 'missing' });

    expect(result).toEqual({ ok: false, error: 'RFP_NOT_FOUND' });
  });
});
