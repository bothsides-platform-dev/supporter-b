// Chat message template actions: save / list / delete (workspace-shared).
//
// Templates (`chat_message_templates`) are shared across all members of a
// workspace — any member can save, list, or delete a template owned by their
// workspace. Cross-workspace isolation is the security invariant: a member of
// workspace A must never see or delete a template owned by workspace B.
//
// Contract under test (per impl-plan 2026-06-02, §Server Actions 템플릿):
//   - saveTemplateAction({title, body}): creates a template scoped to the
//     session's active workspace, stamped created_by = session user.
//   - listTemplatesAction(): returns templates for the session's workspace only.
//   - deleteTemplateAction({templateId}): deletes a template the session's
//     workspace owns; FORBIDDEN for another workspace's template.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  seedBuyerWorkspace,
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

import { saveTemplateAction } from '../saveTemplateAction';
import { listTemplatesAction } from '../listTemplatesAction';
import { deleteTemplateAction } from '../deleteTemplateAction';
import { getChatTemplateRepo } from '@/lib/server/repositories/factory';

let db: PgliteDB;

async function setupBuyer() {
  const buyer = await seedUser(db, { email: 'b@buyer.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  sessionRef.value = {
    user: {
      id: buyer.id,
      email: buyer.email,
      workspaceId: buyerWs.id,
      workspaceType: 'buyer',
      role: 'admin',
    },
  };
  return { buyer, buyerWs };
}

describe('saveTemplateAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('creates a template scoped to the session workspace, stamped created_by', async () => {
    const { buyer, buyerWs } = await setupBuyer();
    const r = await saveTemplateAction({ title: '견적 안내', body: '안녕하세요, 견적 안내드려요.' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const t = await (await getChatTemplateRepo()).findById(r.templateId);
      expect(t).toMatchObject({
        workspaceId: buyerWs.id,
        title: '견적 안내',
        body: '안녕하세요, 견적 안내드려요.',
        createdBy: buyer.id,
      });
    }
  });

  it('rejects empty title', async () => {
    await setupBuyer();
    const r = await saveTemplateAction({ title: '', body: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('rejects an unknown field (zod strict)', async () => {
    await setupBuyer();
    // @ts-expect-error — extra field must be rejected by .strict()
    const r = await saveTemplateAction({ title: 't', body: 'b', workspaceId: 'hijack' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('rejects without a session', async () => {
    sessionRef.value = null;
    const r = await saveTemplateAction({ title: 't', body: 'b' });
    expect(r.ok).toBe(false);
  });
});

describe('listTemplatesAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('returns only the session workspace templates (cross-workspace isolation)', async () => {
    const { buyerWs } = await setupBuyer();
    await saveTemplateAction({ title: 'mine-1', body: 'a' });
    await saveTemplateAction({ title: 'mine-2', body: 'b' });

    // A different workspace owns its own template — must not leak.
    const otherUser = await seedUser(db, { email: 'p@pg.com' });
    const otherWs = await seedPgWorkspace(db, 'toss.im');
    await seedMembership(db, otherWs.id, otherUser.id, 'admin');
    await (await getChatTemplateRepo()).create({
      workspaceId: otherWs.id,
      title: 'theirs',
      body: 'x',
      createdBy: otherUser.id,
    });

    const r = await listTemplatesAction();
    expect(r.ok).toBe(true);
    if (r.ok) {
      const titles = r.templates.map((t) => t.title).sort();
      expect(titles).toEqual(['mine-1', 'mine-2']);
      expect(r.templates.every((t) => t.workspaceId === buyerWs.id)).toBe(true);
    }
  });

  it('rejects without a session', async () => {
    sessionRef.value = null;
    const r = await listTemplatesAction();
    expect(r.ok).toBe(false);
  });
});

describe('deleteTemplateAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('deletes a template the session workspace owns', async () => {
    await setupBuyer();
    const saved = await saveTemplateAction({ title: 'gone', body: 'x' });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const r = await deleteTemplateAction({ templateId: saved.templateId });
    expect(r.ok).toBe(true);
    expect(await (await getChatTemplateRepo()).findById(saved.templateId)).toBeUndefined();
  });

  it('rejects deleting another workspace template (cross-workspace isolation)', async () => {
    await setupBuyer();
    const otherUser = await seedUser(db, { email: 'p@pg.com' });
    const otherWs = await seedPgWorkspace(db, 'toss.im');
    const otherTemplateId = crypto.randomUUID();
    await (await getChatTemplateRepo()).create({
      id: otherTemplateId,
      workspaceId: otherWs.id,
      title: 'theirs',
      body: 'x',
      createdBy: otherUser.id,
    });

    const r = await deleteTemplateAction({ templateId: otherTemplateId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
    // still there — delete must not have touched it
    expect(await (await getChatTemplateRepo()).findById(otherTemplateId)).toBeDefined();
  });

  it('returns NOT_FOUND for a non-existent template', async () => {
    await setupBuyer();
    const r = await deleteTemplateAction({ templateId: crypto.randomUUID() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TEMPLATE_NOT_FOUND');
  });

  it('rejects without a session', async () => {
    sessionRef.value = null;
    const r = await deleteTemplateAction({ templateId: crypto.randomUUID() });
    expect(r.ok).toBe(false);
  });
});
