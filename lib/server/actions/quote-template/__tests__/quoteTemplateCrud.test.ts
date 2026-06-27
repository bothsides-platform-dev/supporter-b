// Bid quote template actions: save (create/update) / list / delete.
//
// Templates (`bid_quote_templates`) are shared across all members of a PG
// workspace — any member can save, list, update, or delete a template owned by
// their workspace. They are PG-only (buyers have no use for a 견적 요율표) and
// the security invariant is cross-workspace isolation: a member of PG workspace
// A must never see, edit, or delete a template owned by PG workspace B.
import { strict as assert } from 'node:assert';
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
import { duplicateQuoteTemplateAction } from '../duplicateQuoteTemplateAction';
import { getBidQuoteTemplateRepo } from '@/lib/server/repositories/factory';

let db: PgliteDB;

const VALID = {
  name: '표준 요율',
  settleCycle: 'M+1',
  settleLimit: 5_000_000,
  guaranteeInsurance: 500_000,
  paymentFees: { card: 0.0125, virtual_account: 300 },
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
        paymentFees: { card: 0.0125, virtual_account: 300 },
        createdBy: user.id,
      });
    }
  });

  it('구간맵 paymentFees 템플릿을 저장하고 그대로 불러온다', async () => {
    await setupPg();
    const res = await saveQuoteTemplateAction({
      name: '표준요율',
      settleCycle: 'D+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      paymentFees: { card: { sole: 0.005, general: 0.018 } },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const loaded = await (await getBidQuoteTemplateRepo()).findById(res.templateId);
    expect(loaded?.paymentFees.card).toEqual({ sole: 0.005, general: 0.018 });
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

describe('duplicateQuoteTemplateAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('원본 템플릿을 "이름 복제"로 복사하고 원본은 유지된다', async () => {
    const { user, ws } = await setupPg();
    sessionRef.value = { user: { id: user.id, email: user.email, workspaceId: ws.id, workspaceType: 'pg', role: 'admin' } };

    const created = await saveQuoteTemplateAction(VALID);
    assert(created.ok);

    const duped = await duplicateQuoteTemplateAction({ templateId: created.templateId });
    expect(duped.ok).toBe(true);
    assert(duped.ok);
    expect(duped.templateId).not.toBe(created.templateId);

    const repo = await getBidQuoteTemplateRepo();
    const all = await repo.listByWorkspace(ws.id);
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.name).sort()).toEqual(['표준 요율', '표준 요율 복제'].sort());
    const dup = all.find((t) => t.name === '표준 요율 복제')!;
    expect(dup.settleCycle).toBe(VALID.settleCycle);
    expect(dup.settleLimit).toBe(VALID.settleLimit);
  });

  it('20개 한도 초과 시 LIMIT_REACHED 반환', async () => {
    const { user, ws } = await setupPg();
    sessionRef.value = { user: { id: user.id, email: user.email, workspaceId: ws.id, workspaceType: 'pg', role: 'admin' } };

    let lastId = '';
    for (let i = 0; i < 20; i++) {
      const r = await saveQuoteTemplateAction({ ...VALID, name: `t${i}` });
      assert(r.ok);
      lastId = r.templateId;
    }
    const r = await duplicateQuoteTemplateAction({ templateId: lastId });
    expect(r.ok).toBe(false);
    assert(!r.ok);
    expect(r.error).toBe('LIMIT_REACHED');
  });

  it('다른 워크스페이스 템플릿 복제 시 FORBIDDEN', async () => {
    // Seed PG-A user + workspace manually to use a unique email.
    const u1 = await seedUser(db, { email: 'pg-a@example.com' });
    const ws1 = await seedPgWorkspace(db, 'pg-a.com');
    await seedMembership(db, ws1.id, u1.id, 'admin');
    sessionRef.value = { user: { id: u1.id, email: u1.email, workspaceId: ws1.id, workspaceType: 'pg', role: 'admin' } };
    const r = await saveQuoteTemplateAction(VALID);
    assert(r.ok);
    const otherTemplateId = r.templateId;

    // Seed PG-B user + workspace with a different email.
    const u2 = await seedUser(db, { email: 'pg-b@example.com' });
    const ws2 = await seedPgWorkspace(db, 'pg-b.com');
    await seedMembership(db, ws2.id, u2.id, 'admin');
    sessionRef.value = { user: { id: u2.id, email: u2.email, workspaceId: ws2.id, workspaceType: 'pg', role: 'admin' } };
    const duped = await duplicateQuoteTemplateAction({ templateId: otherTemplateId });
    expect(duped.ok).toBe(false);
    assert(!duped.ok);
    expect(duped.error).toBe('FORBIDDEN');
  });
});
