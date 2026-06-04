// Bid quote template actions: save (create/update) / list / delete.
//
// Templates (`bid_quote_templates`) are shared across all members of a PG
// workspace — any member can save, list, update, or delete a template owned by
// their workspace. They are PG-only (buyers have no use for a 견적 요율표) and
// the security invariant is cross-workspace isolation: a member of PG workspace
// A must never see, edit, or delete a template owned by PG workspace B.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from '../../rfp/__tests__/_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

type SessionUser = {
  id: string;
  email: string;
  workspaceId: string;
  workspaceType: 'buyer' | 'pg';
  role: 'admin' | 'member';
};
const sessionRef: { value: { user: SessionUser } | null } = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
  requireBuyerSession: () =>
    sessionRef.value?.user.workspaceType === 'buyer'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_BUYER')),
  requirePgSession: () =>
    sessionRef.value?.user.workspaceType === 'pg'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_PG')),
}));

import { saveQuoteTemplateAction } from '../saveQuoteTemplateAction';
import { listQuoteTemplatesAction } from '../listQuoteTemplatesAction';
import { deleteQuoteTemplateAction } from '../deleteQuoteTemplateAction';
import { getBidQuoteTemplateRepo } from '@/lib/server/repositories/factory';

let db: PgliteDB;

const VALID = {
  name: '표준 요율',
  settleCycle: 'M+1',
  settleLimit: 5_000_000,
  guaranteeInsurance: 500_000,
  paymentFees: { card: 0.0125, virtual_account: 0.005 },
} as const;

async function setupPg(name = 'toss.im') {
  const user = await seedUser(db, { email: 'p@pg.com' });
  const ws = await seedPgWorkspace(db, name);
  await seedMembership(db, ws.id, user.id, 'admin');
  sessionRef.value = {
    user: {
      id: user.id,
      email: user.email,
      workspaceId: ws.id,
      workspaceType: 'pg',
      role: 'admin',
    },
  };
  return { user, ws };
}

describe('saveQuoteTemplateAction (create)', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('creates a template scoped to the PG workspace, numbers round-trip, stamped created_by', async () => {
    const { user, ws } = await setupPg();
    const r = await saveQuoteTemplateAction({ ...VALID });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const t = await (await getBidQuoteTemplateRepo()).findById(r.templateId);
      expect(t).toMatchObject({
        pgWsId: ws.id,
        name: '표준 요율',
        settleCycle: 'M+1',
        settleLimit: 5_000_000,
        guaranteeInsurance: 500_000,
        paymentFees: { card: 0.0125, virtual_account: 0.005 },
        createdBy: user.id,
      });
    }
  });

  it('rejects an empty name', async () => {
    await setupPg();
    const r = await saveQuoteTemplateAction({ ...VALID, name: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('rejects a fee above 1 (100%)', async () => {
    await setupPg();
    const r = await saveQuoteTemplateAction({
      ...VALID,
      paymentFees: { card: 1.5 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('rejects a malformed settleCycle', async () => {
    await setupPg();
    const r = await saveQuoteTemplateAction({ ...VALID, settleCycle: 'tomorrow' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('rejects an unknown field (zod strict)', async () => {
    await setupPg();
    // @ts-expect-error — extra field must be rejected by .strict()
    const r = await saveQuoteTemplateAction({ ...VALID, pgWsId: 'hijack' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('rejects a buyer session (PG-only)', async () => {
    await setupPg();
    sessionRef.value!.user.workspaceType = 'buyer';
    const r = await saveQuoteTemplateAction({ ...VALID });
    expect(r.ok).toBe(false);
  });

  it('rejects without a session', async () => {
    sessionRef.value = null;
    const r = await saveQuoteTemplateAction({ ...VALID });
    expect(r.ok).toBe(false);
  });

  it('caps a workspace at 20 templates', async () => {
    await setupPg();
    for (let i = 0; i < 20; i++) {
      const r = await saveQuoteTemplateAction({ ...VALID, name: `t-${i}` });
      expect(r.ok).toBe(true);
    }
    const over = await saveQuoteTemplateAction({ ...VALID, name: 't-20' });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toBe('LIMIT_REACHED');
  });
});

describe('saveQuoteTemplateAction (update)', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('updates an owned template in place (no new row)', async () => {
    await setupPg();
    const created = await saveQuoteTemplateAction({ ...VALID, name: 'before' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await saveQuoteTemplateAction({
      id: created.templateId,
      name: 'after',
      settleCycle: 'D+2',
      settleLimit: 1_000,
      guaranteeInsurance: 0,
      paymentFees: { card: 0.02 },
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.templateId).toBe(created.templateId);

    const list = await listQuoteTemplatesAction();
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.templates).toHaveLength(1);
      expect(list.templates[0]).toMatchObject({
        id: created.templateId,
        name: 'after',
        settleCycle: 'D+2',
        settleLimit: 1_000,
        paymentFees: { card: 0.02 },
      });
    }
  });

  it('rejects updating another workspace template (cross-workspace isolation)', async () => {
    // Foreign PG workspace owns a template.
    const otherUser = await seedUser(db, { email: 'other@pg.com' });
    const otherWs = await seedPgWorkspace(db, 'nice.pay');
    const foreignId = crypto.randomUUID();
    await (await getBidQuoteTemplateRepo()).create({
      id: foreignId,
      pgWsId: otherWs.id,
      name: 'theirs',
      settleCycle: 'M+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      paymentFees: {},
      createdBy: otherUser.id,
    });

    await setupPg();
    const r = await saveQuoteTemplateAction({
      id: foreignId,
      ...VALID,
      name: 'hijacked',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');

    const still = await (await getBidQuoteTemplateRepo()).findById(foreignId);
    expect(still?.name).toBe('theirs');
  });
});

describe('listQuoteTemplatesAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('returns only the session workspace templates (cross-workspace isolation)', async () => {
    const { ws } = await setupPg();
    await saveQuoteTemplateAction({ ...VALID, name: 'mine-1' });
    await saveQuoteTemplateAction({ ...VALID, name: 'mine-2' });

    const otherUser = await seedUser(db, { email: 'other@pg.com' });
    const otherWs = await seedPgWorkspace(db, 'nice.pay');
    await (await getBidQuoteTemplateRepo()).create({
      pgWsId: otherWs.id,
      name: 'theirs',
      settleCycle: 'M+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      paymentFees: {},
      createdBy: otherUser.id,
    });

    const r = await listQuoteTemplatesAction();
    expect(r.ok).toBe(true);
    if (r.ok) {
      const names = r.templates.map((t) => t.name).sort();
      expect(names).toEqual(['mine-1', 'mine-2']);
      expect(r.templates.every((t) => t.pgWsId === ws.id)).toBe(true);
    }
  });

  it('rejects without a session', async () => {
    sessionRef.value = null;
    const r = await listQuoteTemplatesAction();
    expect(r.ok).toBe(false);
  });
});

describe('deleteQuoteTemplateAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('deletes a template the session workspace owns', async () => {
    await setupPg();
    const saved = await saveQuoteTemplateAction({ ...VALID, name: 'gone' });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const r = await deleteQuoteTemplateAction({ templateId: saved.templateId });
    expect(r.ok).toBe(true);
    expect(
      await (await getBidQuoteTemplateRepo()).findById(saved.templateId),
    ).toBeUndefined();
  });

  it('rejects deleting another workspace template (cross-workspace isolation)', async () => {
    await setupPg();
    const otherUser = await seedUser(db, { email: 'other@pg.com' });
    const otherWs = await seedPgWorkspace(db, 'nice.pay');
    const foreignId = crypto.randomUUID();
    await (await getBidQuoteTemplateRepo()).create({
      id: foreignId,
      pgWsId: otherWs.id,
      name: 'theirs',
      settleCycle: 'M+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      paymentFees: {},
      createdBy: otherUser.id,
    });

    const r = await deleteQuoteTemplateAction({ templateId: foreignId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
    expect(
      await (await getBidQuoteTemplateRepo()).findById(foreignId),
    ).toBeDefined();
  });

  it('returns TEMPLATE_NOT_FOUND for a non-existent template', async () => {
    await setupPg();
    const r = await deleteQuoteTemplateAction({ templateId: crypto.randomUUID() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TEMPLATE_NOT_FOUND');
  });

  it('rejects without a session', async () => {
    sessionRef.value = null;
    const r = await deleteQuoteTemplateAction({ templateId: crypto.randomUUID() });
    expect(r.ok).toBe(false);
  });
});
