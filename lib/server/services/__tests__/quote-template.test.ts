// QuoteTemplateService — unit tests against an in-memory FAKE repo (no DB).
// Covers the logic moved out of the quote-template actions: the MAX_TEMPLATES
// cap (create + duplicate), the cross-workspace ownership guard (requireOwned →
// TEMPLATE_NOT_FOUND / FORBIDDEN), the "<name> 복제" duplicate naming +
// paymentFees deep-copy, and created_by stamping. Cross-workspace isolation is
// the security invariant.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  QuoteTemplateService,
  __resetQuoteTemplateServiceForTest,
  __setQuoteTemplateServiceForTest,
  getQuoteTemplateService,
  type SaveQuoteTemplateServiceInput,
} from '../quote-template';
import type {
  BidQuoteTemplate,
  BidQuoteTemplateRepo,
} from '@/lib/server/repositories/types';
import type { Actor } from '../types';

// ─── fake repo (only the methods QuoteTemplateService touches) ───────────────

class FakeQuoteTemplateRepo implements BidQuoteTemplateRepo {
  private byId = new Map<string, BidQuoteTemplate>();
  created: BidQuoteTemplate[] = [];
  updated: { id: string; fields: Record<string, unknown> }[] = [];
  removed: string[] = [];

  seed(t: BidQuoteTemplate) {
    this.byId.set(t.id, t);
    return t;
  }

  async create(template: {
    id?: string;
    pgWsId: string;
    name: string;
    settleCycle: string;
    settleLimit: number;
    guaranteeInsurance: number;
    signupFee: number;
    paymentFees: BidQuoteTemplate['paymentFees'];
    createdBy: string;
  }) {
    const row: BidQuoteTemplate = {
      id: template.id ?? randomUUID(),
      pgWsId: template.pgWsId,
      name: template.name,
      settleCycle: template.settleCycle,
      settleLimit: template.settleLimit,
      guaranteeInsurance: template.guaranteeInsurance,
      signupFee: template.signupFee,
      paymentFees: template.paymentFees,
      createdBy: template.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.created.push(row);
    this.byId.set(row.id, row);
  }

  async update(id: string, fields: {
    name: string;
    settleCycle: string;
    settleLimit: number;
    guaranteeInsurance: number;
    signupFee: number;
    paymentFees: BidQuoteTemplate['paymentFees'];
  }) {
    this.updated.push({ id, fields });
    const cur = this.byId.get(id);
    if (cur) this.byId.set(id, { ...cur, ...fields, updatedAt: new Date() });
  }

  async findById(id: string) {
    return this.byId.get(id);
  }

  async listByWorkspace(pgWsId: string) {
    return [...this.byId.values()].filter((t) => t.pgWsId === pgWsId);
  }

  async remove(id: string) {
    this.removed.push(id);
    this.byId.delete(id);
  }
}

const WS_A = 'ws-a';
const WS_B = 'ws-b';
const actorA: Actor = { userId: 'user-a', workspaceId: WS_A };

const VALID: SaveQuoteTemplateServiceInput = {
  name: '표준 요율',
  settleCycle: 'M+1',
  settleLimit: 5_000_000,
  guaranteeInsurance: 500_000,
  signupFee: 200_000,
  paymentFees: { card: 0.0125, virtual_account: 300 },
};

function seededTemplate(
  repo: FakeQuoteTemplateRepo,
  overrides: Partial<BidQuoteTemplate> = {},
): BidQuoteTemplate {
  return repo.seed({
    id: randomUUID(),
    pgWsId: WS_A,
    name: '원본',
    settleCycle: 'D+1',
    settleLimit: 1_000,
    guaranteeInsurance: 0,
    signupFee: 0,
    paymentFees: { card: 0.01 },
    createdBy: 'user-a',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

let repo: FakeQuoteTemplateRepo;
let svc: QuoteTemplateService;

beforeEach(() => {
  repo = new FakeQuoteTemplateRepo();
  svc = new QuoteTemplateService(repo);
});

describe('QuoteTemplateService.save (create)', () => {
  it('creates a template scoped to the actor workspace, stamps created_by', async () => {
    const r = await svc.save(VALID, actorA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const created = repo.created[0];
    expect(created.id).toBe(r.templateId);
    expect(created.pgWsId).toBe(WS_A);
    expect(created.createdBy).toBe('user-a');
    expect(created.name).toBe('표준 요율');
    expect(created.signupFee).toBe(200_000);
    expect(created.paymentFees).toEqual({ card: 0.0125, virtual_account: 300 });
  });

  it('caps a workspace at MAX_TEMPLATES (20) → LIMIT_REACHED', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await svc.save({ ...VALID, name: `t-${i}` }, actorA);
      expect(r.ok).toBe(true);
    }
    const over = await svc.save({ ...VALID, name: 't-20' }, actorA);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toBe('LIMIT_REACHED');
  });

  it('the cap is per-workspace (another workspace does not count)', async () => {
    // Fill WS_B to the cap.
    for (let i = 0; i < 20; i++) {
      seededTemplate(repo, { pgWsId: WS_B, name: `b-${i}` });
    }
    // WS_A is still empty → create succeeds.
    const r = await svc.save(VALID, actorA);
    expect(r.ok).toBe(true);
  });
});

describe('QuoteTemplateService.save (update)', () => {
  it('updates an owned template in place (no new row)', async () => {
    const t = seededTemplate(repo);
    const r = await svc.save(
      { id: t.id, ...VALID, name: 'after', signupFee: 350_000 },
      actorA,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.templateId).toBe(t.id);
    expect(repo.created).toHaveLength(0);
    expect(repo.updated).toHaveLength(1);
    expect(repo.updated[0].id).toBe(t.id);
    expect(repo.updated[0].fields.name).toBe('after');
    expect(repo.updated[0].fields.signupFee).toBe(350_000);
  });

  it('rejects updating another workspace template → FORBIDDEN', async () => {
    const foreign = seededTemplate(repo, { pgWsId: WS_B, name: 'theirs' });
    const r = await svc.save({ id: foreign.id, ...VALID, name: 'hijacked' }, actorA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
    expect(repo.updated).toHaveLength(0);
  });

  it('rejects updating a non-existent template → TEMPLATE_NOT_FOUND', async () => {
    const r = await svc.save({ id: randomUUID(), ...VALID }, actorA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TEMPLATE_NOT_FOUND');
  });
});

describe('QuoteTemplateService.duplicate', () => {
  it('copies an owned template as "<name> 복제", deep-copies paymentFees, stamps actor as created_by', async () => {
    const t = seededTemplate(repo, {
      name: '표준 요율',
      signupFee: 150_000,
      paymentFees: { card: { sole: 0.005, general: 0.018 } },
    });
    const r = await svc.duplicate(t.id, actorA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.templateId).not.toBe(t.id);
    const dup = repo.created[0];
    expect(dup.name).toBe('표준 요율 복제');
    expect(dup.pgWsId).toBe(WS_A);
    expect(dup.createdBy).toBe('user-a');
    expect(dup.settleCycle).toBe(t.settleCycle);
    expect(dup.settleLimit).toBe(t.settleLimit);
    expect(dup.signupFee).toBe(150_000);
    expect(dup.paymentFees).toEqual({ card: { sole: 0.005, general: 0.018 } });
    // deep copy — not the same object reference as the source.
    expect(dup.paymentFees).not.toBe(t.paymentFees);
  });

  it('rejects duplicating another workspace template → FORBIDDEN', async () => {
    const foreign = seededTemplate(repo, { pgWsId: WS_B });
    const r = await svc.duplicate(foreign.id, actorA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
    expect(repo.created).toHaveLength(0);
  });

  it('rejects duplicating a non-existent template → TEMPLATE_NOT_FOUND', async () => {
    const r = await svc.duplicate(randomUUID(), actorA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TEMPLATE_NOT_FOUND');
  });

  it('enforces the MAX_TEMPLATES cap on duplicate → LIMIT_REACHED', async () => {
    let last = '';
    for (let i = 0; i < 20; i++) {
      last = seededTemplate(repo, { name: `t-${i}` }).id;
    }
    const r = await svc.duplicate(last, actorA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('LIMIT_REACHED');
  });
});

describe('QuoteTemplateService.remove', () => {
  it('deletes an owned template', async () => {
    const t = seededTemplate(repo);
    const r = await svc.remove(t.id, actorA);
    expect(r.ok).toBe(true);
    expect(repo.removed).toEqual([t.id]);
    expect(await repo.findById(t.id)).toBeUndefined();
  });

  it('rejects deleting another workspace template → FORBIDDEN', async () => {
    const foreign = seededTemplate(repo, { pgWsId: WS_B });
    const r = await svc.remove(foreign.id, actorA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
    expect(repo.removed).toHaveLength(0);
  });

  it('returns TEMPLATE_NOT_FOUND for a non-existent template', async () => {
    const r = await svc.remove(randomUUID(), actorA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TEMPLATE_NOT_FOUND');
  });
});

describe('QuoteTemplateService.list', () => {
  it('returns only the actor workspace templates (cross-workspace isolation)', async () => {
    seededTemplate(repo, { name: 'mine-1' });
    seededTemplate(repo, { name: 'mine-2' });
    seededTemplate(repo, { pgWsId: WS_B, name: 'theirs' });

    const r = await svc.list(actorA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const names = r.templates.map((t) => t.name).sort();
    expect(names).toEqual(['mine-1', 'mine-2']);
    expect(r.templates.every((t) => t.pgWsId === WS_A)).toBe(true);
  });
});

describe('QuoteTemplateService factory singleton', () => {
  afterEach(() => {
    __resetQuoteTemplateServiceForTest();
  });

  it('getQuoteTemplateService returns the injected instance', async () => {
    const injected = new QuoteTemplateService(new FakeQuoteTemplateRepo());
    __setQuoteTemplateServiceForTest(injected);
    expect(await getQuoteTemplateService()).toBe(injected);
  });

  it('__reset clears the cached instance', async () => {
    const injected = new QuoteTemplateService(new FakeQuoteTemplateRepo());
    __setQuoteTemplateServiceForTest(injected);
    __resetQuoteTemplateServiceForTest();
    expect(await getQuoteTemplateService()).not.toBe(injected);
  });
});
