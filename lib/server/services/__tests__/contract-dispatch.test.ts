import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/features/long-term-agreements', () => ({
  LONG_TERM_AGREEMENTS_ENABLED: false,
}));
vi.mock('@/lib/server/signing/agreement-boundary', () => ({
  requiresCommonAgreement: vi.fn(async () => false),
}));

import { ContractDispatch } from '../contract-dispatch';
import { requiresCommonAgreement } from '@/lib/server/signing/agreement-boundary';

describe('ContractDispatch', () => {
  it('stops before authorization when the RFP does not exist', async () => {
    const resolveParty = vi.fn(async () => 'pg' as const);
    const template = vi.fn();
    const compose = vi.fn();
    const dispatch = new ContractDispatch({
      agreementRepo: { findDraft: vi.fn(async () => undefined) },
      rfpRepo: { findById: async () => undefined } as never,
      signingRepo: {} as never,
      bidRepo: {} as never,
      templateRepo: {} as never,
      resolveParty,
      adapters: { template, compose, agreement: vi.fn() },
    });

    await expect(
      dispatch.dispatch({
        source: 'template',
        rfpId: 'missing-rfp',
        actor: { userId: 'user-1', workspaceId: 'pg-1' },
      }),
    ).resolves.toEqual({ ok: false, error: 'RFP_NOT_FOUND' });
    expect(resolveParty).not.toHaveBeenCalled();
    expect(template).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
  });

  it('does not inspect sealed bid data when the active signing contract is missing', async () => {
    const findSigningTemplateId = vi.fn();
    const dispatch = new ContractDispatch({
      agreementRepo: { findDraft: vi.fn(async () => undefined) },
      rfpRepo: { findById: async () => ({ id: 'rfp-1', awardedBidId: 'bid-1' }) } as never,
      signingRepo: { findActiveByRfp: async () => undefined } as never,
      bidRepo: { findSigningTemplateId } as never,
      templateRepo: {} as never,
      resolveParty: async () => 'pg',
      adapters: { template: vi.fn(), compose: vi.fn(), agreement: vi.fn() },
    });

    await expect(
      dispatch.dispatch({
        source: 'template',
        rfpId: 'rfp-1',
        actor: { userId: 'user-1', workspaceId: 'pg-1' },
      }),
    ).resolves.toEqual({ ok: false, error: 'CONTRACT_NOT_FOUND' });
    expect(findSigningTemplateId).not.toHaveBeenCalled();
  });

  it('stops before the sealed bid lookup when no bid was awarded', async () => {
    const findSigningTemplateId = vi.fn();
    const dispatch = new ContractDispatch({
      agreementRepo: { findDraft: vi.fn(async () => undefined) },
      rfpRepo: { findById: async () => ({ id: 'rfp-1', awardedBidId: undefined }) } as never,
      signingRepo: {
        findActiveByRfp: async () => ({ id: 'contract-1', status: 'awaiting_pg_template' }),
      } as never,
      bidRepo: { findSigningTemplateId } as never,
      templateRepo: {} as never,
      resolveParty: async () => 'pg',
      adapters: { template: vi.fn(), compose: vi.fn(), agreement: vi.fn() },
    });

    await expect(
      dispatch.dispatch({
        source: 'compose',
        rfpId: 'rfp-1',
        actor: { userId: 'user-1', workspaceId: 'pg-1' },
      }),
    ).resolves.toEqual({ ok: false, error: 'NO_LINKED_TEMPLATE' });
    expect(findSigningTemplateId).not.toHaveBeenCalled();
  });

  it('routes both dispatch sources through one discriminated entry point', async () => {
    const template = vi.fn(async () => ({ ok: true as const }));
    const compose = vi.fn(async () => ({ ok: false as const, error: 'COMPOSE_FAILED' }));
    const templates = new Map([
      ['template-pdf', { id: 'template-pdf', workspaceId: 'pg-1', kind: 'pdf' }],
      ['template-compose', { id: 'template-compose', workspaceId: 'pg-1', kind: 'composed' }],
    ]);
    const dispatch = new ContractDispatch({
      agreementRepo: { findDraft: vi.fn(async () => undefined) },
      rfpRepo: {
        findById: async (id: string) => ({
          id,
          awardedBidId: id === 'rfp-1' ? 'bid-pdf' : 'bid-compose',
        }),
      } as never,
      signingRepo: {
        findActiveByRfp: async () => ({ id: 'contract-1', status: 'awaiting_pg_template' }),
      } as never,
      bidRepo: {
        findSigningTemplateId: async (id: string) =>
          id === 'bid-pdf' ? 'template-pdf' : 'template-compose',
      } as never,
      templateRepo: { findById: async (id: string) => templates.get(id) } as never,
      resolveParty: async () => 'pg',
      adapters: { template, compose, agreement: vi.fn() },
    });
    const actor = { userId: 'user-1', workspaceId: 'pg-1' };

    await expect(
      dispatch.dispatch({ source: 'template', rfpId: 'rfp-1', actor, takeOver: true }),
    ).resolves.toEqual({ ok: true });
    await expect(
      dispatch.dispatch({ source: 'compose', rfpId: 'rfp-2', actor }),
    ).resolves.toEqual({ ok: false, error: 'COMPOSE_FAILED' });

    expect(template).toHaveBeenCalledWith(expect.objectContaining({
      source: 'template', actor, takeOver: true,
      template: expect.objectContaining({ kind: 'pdf' }),
      active: expect.objectContaining({ id: 'contract-1' }),
    }));
    expect(compose).toHaveBeenCalledWith(expect.objectContaining({
      source: 'compose', actor,
      template: expect.objectContaining({ kind: 'composed' }),
      active: expect.objectContaining({ id: 'contract-1' }),
    }));
  });

  it('routes a common agreement without looking up a bid template', async () => {
    vi.mocked(requiresCommonAgreement).mockResolvedValueOnce(true);
    const findSigningTemplateId = vi.fn();
    const agreement = vi.fn(async () => ({ ok: true as const }));
    const actor = { userId: 'user-1', workspaceId: 'pg-1' };
    const dispatch = new ContractDispatch({
      agreementRepo: { findDraft: vi.fn(async () => undefined) },
      rfpRepo: { findById: async () => ({ id: 'rfp-1', awardedBidId: 'bid-1' }) } as never,
      signingRepo: {
        findById: async () => ({
          contract: { id: 'contract-1', rfpId: 'rfp-1', status: 'awaiting_pg_template' },
        }),
      } as never,
      bidRepo: { findSigningTemplateId } as never,
      templateRepo: {} as never,
      resolveParty: async () => 'pg',
      adapters: { template: vi.fn(), compose: vi.fn(), agreement },
    });

    await expect(
      dispatch.dispatch({ source: 'agreement', contractId: 'contract-1', actor, stamp: 'v1' }),
    ).resolves.toEqual({ ok: true });
    expect(agreement).toHaveBeenCalledWith(expect.objectContaining({
      source: 'agreement', actor, stamp: 'v1',
      active: expect.objectContaining({ id: 'contract-1' }),
    }));
    expect(findSigningTemplateId).not.toHaveBeenCalled();
  });

  it('does not reveal the status of an agreement without an awarded bid', async () => {
    const dispatch = new ContractDispatch({
      agreementRepo: { findDraft: vi.fn(async () => undefined) },
      rfpRepo: { findById: async () => ({ id: 'rfp-1', awardedBidId: null }) } as never,
      signingRepo: {
        findById: async () => ({
          contract: { id: 'contract-1', rfpId: 'rfp-1', status: 'sent' },
        }),
      } as never,
      bidRepo: {} as never,
      templateRepo: {} as never,
      resolveParty: async () => 'pg',
      adapters: { template: vi.fn(), compose: vi.fn(), agreement: vi.fn() },
    });

    await expect(dispatch.dispatch({
      source: 'agreement',
      contractId: 'contract-1',
      actor: { userId: 'user-1', workspaceId: 'pg-1' },
      stamp: 'v1',
    })).resolves.toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});
