import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryRfpRepository } from '../repositories/in-memory/rfp';
import type { RFP } from '@/lib/types/rfp';

function makeRfp(id: string, status: RFP['status'] = 'draft'): RFP {
  return {
    id,
    buyerWsId: 'ws-buyer',
    bizProfile: {
      bizNo: '1234567890',
      taxType: 'general',
      status: 'active',
      gradeSource: 'user_confirmed',
    },
    title: 'Test RFP',
    memo: '',
    rfpFiles: [],
    allowedPgWorkspaceIds: [],
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    status,
    createdBy: 'user-1',
    createdAt: new Date().toISOString(),
  };
}

describe('InMemoryRfpRepository', () => {
  let repo: InMemoryRfpRepository;

  beforeEach(() => {
    repo = new InMemoryRfpRepository();
  });

  it('saves and retrieves by id', async () => {
    await repo.save(makeRfp('rfp-1'));
    expect(await repo.findById('rfp-1')).toMatchObject({ id: 'rfp-1', status: 'draft' });
  });

  it('returns undefined for unknown id', async () => {
    expect(await repo.findById('nope')).toBeUndefined();
  });

  it('findByBuyerWs returns only matching workspace RFPs', async () => {
    await repo.save(makeRfp('rfp-1'));
    await repo.save({ ...makeRfp('rfp-2'), buyerWsId: 'ws-other' });
    expect(await repo.findByBuyerWs('ws-buyer')).toHaveLength(1);
  });

  it('transitions draft → sent', async () => {
    await repo.save(makeRfp('rfp-1'));
    const updated = await repo.transition('rfp-1', 'sent');
    expect(updated.status).toBe('sent');
  });

  it('transitions sent → awarded with patch', async () => {
    await repo.save(makeRfp('rfp-1', 'sent'));
    const updated = await repo.transition('rfp-1', 'awarded', { awardedBidId: 'bid-1' });
    expect(updated.status).toBe('awarded');
    expect(updated.awardedBidId).toBe('bid-1');
  });

  it('throws on invalid transition (draft → awarded)', async () => {
    await repo.save(makeRfp('rfp-1'));
    await expect(repo.transition('rfp-1', 'awarded')).rejects.toThrow('Invalid RFP transition');
  });

  it('throws when RFP not found', async () => {
    await expect(repo.transition('nope', 'sent')).rejects.toThrow('RFP not found');
  });

  it('returns immutable copy (store is not mutated from outside)', async () => {
    await repo.save(makeRfp('rfp-1'));
    const copy = (await repo.findById('rfp-1'))!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (copy as any).status = 'sent';
    expect((await repo.findById('rfp-1'))!.status).toBe('draft');
  });
});
