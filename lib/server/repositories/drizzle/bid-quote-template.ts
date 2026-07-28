import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { bidQuoteTemplates } from '@/lib/db/schema';
import type { PaymentMethod, TierRates } from '@/lib/types/bid';
import type { BidQuoteTemplate, BidQuoteTemplateRepo, Tx } from '../types';

// Explicit column projection (BID_COLUMNS precedent) — guards against schema
// drift where select().from() would compile the full column list.
const TEMPLATE_COLUMNS = {
  id: bidQuoteTemplates.id,
  pgWsId: bidQuoteTemplates.pgWsId,
  name: bidQuoteTemplates.name,
  settleCycle: bidQuoteTemplates.settleCycle,
  settleLimit: bidQuoteTemplates.settleLimit,
  guaranteeInsurance: bidQuoteTemplates.guaranteeInsurance,
  signupFee: bidQuoteTemplates.signupFee,
  paymentFees: bidQuoteTemplates.paymentFees,
  createdBy: bidQuoteTemplates.createdBy,
  createdAt: bidQuoteTemplates.createdAt,
  updatedAt: bidQuoteTemplates.updatedAt,
} as const;

type TemplateRow = {
  [K in keyof typeof TEMPLATE_COLUMNS]: (typeof bidQuoteTemplates.$inferSelect)[K];
};

function rowToTemplate(row: TemplateRow): BidQuoteTemplate {
  return {
    id: row.id,
    pgWsId: row.pgWsId,
    name: row.name,
    settleCycle: row.settleCycle,
    settleLimit: Number(row.settleLimit),
    guaranteeInsurance: Number(row.guaranteeInsurance),
    signupFee: Number(row.signupFee),
    paymentFees: (row.paymentFees ?? {}) as Partial<Record<PaymentMethod, number | TierRates>>,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleBidQuoteTemplateRepository implements BidQuoteTemplateRepo {

  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async create(
    template: {
      id?: string;
      pgWsId: string;
      name: string;
      settleCycle: string;
      settleLimit: number;
      guaranteeInsurance: number;
      signupFee: number;
      paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
      createdBy: string;
    },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db.insert(bidQuoteTemplates).values({
      id: template.id ?? randomUUID(),
      pgWsId: template.pgWsId,
      name: template.name,
      settleCycle: template.settleCycle,
      settleLimit: String(template.settleLimit),
      guaranteeInsurance: String(template.guaranteeInsurance),
      signupFee: String(template.signupFee),
      paymentFees: template.paymentFees,
      createdBy: template.createdBy,
    });
  }

  async update(
    id: string,
    fields: {
      name: string;
      settleCycle: string;
      settleLimit: number;
      guaranteeInsurance: number;
      signupFee: number;
      paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
    },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .update(bidQuoteTemplates)
      .set({
        name: fields.name,
        settleCycle: fields.settleCycle,
        settleLimit: String(fields.settleLimit),
        guaranteeInsurance: String(fields.guaranteeInsurance),
        signupFee: String(fields.signupFee),
        paymentFees: fields.paymentFees,
        updatedAt: new Date(),
      })
      .where(eq(bidQuoteTemplates.id, id));
  }

  async findById(id: string, tx?: Tx): Promise<BidQuoteTemplate | undefined> {
    const db = this.h(tx);
    const [row] = (await db
      .select(TEMPLATE_COLUMNS)
      .from(bidQuoteTemplates)
      .where(eq(bidQuoteTemplates.id, id))
      .limit(1)) as TemplateRow[];
    return row ? rowToTemplate(row) : undefined;
  }

  async listByWorkspace(pgWsId: string, tx?: Tx): Promise<BidQuoteTemplate[]> {
    const db = this.h(tx);
    const rows = (await db
      .select(TEMPLATE_COLUMNS)
      .from(bidQuoteTemplates)
      .where(eq(bidQuoteTemplates.pgWsId, pgWsId))
      .orderBy(asc(bidQuoteTemplates.createdAt))) as TemplateRow[];
    return rows.map(rowToTemplate);
  }

  async remove(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(bidQuoteTemplates).where(eq(bidQuoteTemplates.id, id));
  }
}
