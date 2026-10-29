import { and, eq, gt, lte, sql, count } from 'drizzle-orm';
import { guestQuoteCalls as calls, guestQuoteIpBudget as budgets } from '@/lib/db/schema/guest-quote-assist';
import type { AssistResult } from '@/lib/guest-rfp/suggestions';
import type { Tx } from '../types';
export type QuoteCallKey = { draftId: string; kind: 'business' | 'website'; inputHash: string };
export class DrizzleQuoteAssistRepository {
  constructor(private readonly db: Tx) {}
  private where(key: QuoteCallKey) { return and(eq(calls.draftId, key.draftId), eq(calls.kind, key.kind), eq(calls.inputHash, key.inputHash)); }
  // Caller holds the parent draft row lock. IP budget uses an atomic conditional upsert.
  async claim(key: QuoteCallKey, ipKey: string, now: Date, tx: Tx) {
    await tx.delete(calls).where(and(eq(calls.draftId, key.draftId), lte(calls.expiresAt, now)));
    const [existing] = await tx.select().from(calls).where(this.where(key));
    if (existing) return existing.result ? { status: 'cached' as const, result: existing.result } : { status: 'pending' as const };
    const [used] = await tx.select({ total: count() }).from(calls).where(and(eq(calls.draftId, key.draftId), eq(calls.kind, key.kind), gt(calls.expiresAt, now)));
    if (used.total >= (key.kind === 'business' ? 5 : 3)) return { status: 'limited' as const };
    const budget = await tx.insert(budgets).values({ key: ipKey, count: 1, expiresAt: new Date(now.getTime() + 3600000) })
      .onConflictDoUpdate({ target: budgets.key, set: { count: sql`${budgets.count} + 1` }, setWhere: sql`${budgets.count} < 20` }).returning();
    if (!budget.length) return { status: 'limited' as const };
    await tx.insert(calls).values({ ...key, createdAt: now, expiresAt: new Date(now.getTime() + 86400000) });
    return { status: 'claimed' as const };
  }
  async finish(key: QuoteCallKey, result: AssistResult, cost: number | undefined, tx: Tx) {
    await tx.update(calls).set({ result, cost }).where(and(this.where(key), sql`${calls.result} IS NULL`));
  }
  async eraseDraft(draftId: string, tx: Tx = this.db) { await tx.delete(calls).where(eq(calls.draftId, draftId)); }
  async sweep(now: Date) {
    await this.db.delete(calls).where(lte(calls.expiresAt, now));
    await this.db.delete(budgets).where(lte(budgets.expiresAt, now));
  }
}
