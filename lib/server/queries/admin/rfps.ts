import { desc, eq } from 'drizzle-orm';
import { rfps, workspaces, bids } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type RfpListRow = {
  id: string;
  code: string;
  title: string;
  status: 'draft' | 'sent' | 'closed' | 'cancelled' | 'awarded';
  deadline: Date;
  buyerName: string;
  buyerWsId: string;
};

export type BidDetailRow = {
  id: string;
  pgWsId: string;
  pgWsName: string;
  status: 'draft' | 'submitted' | 'withdrawn';
  submittedAt: Date;
};

export async function listAllRfps(): Promise<RfpListRow[]> {
  return actionDb()
    .select({
      id: rfps.id,
      code: rfps.code,
      title: rfps.title,
      status: rfps.status,
      deadline: rfps.deadline,
      buyerName: workspaces.name,
      buyerWsId: rfps.buyerWsId,
    })
    .from(rfps)
    .innerJoin(workspaces, eq(rfps.buyerWsId, workspaces.id))
    .orderBy(desc(rfps.createdAt)) as Promise<RfpListRow[]>;
}

export async function getRfpDetail(rfpId: string) {
  const [rfp] = await actionDb()
    .select()
    .from(rfps)
    .where(eq(rfps.id, rfpId));
  if (!rfp) return null;

  const rfpBids: BidDetailRow[] = await actionDb()
    .select({
      id: bids.id,
      pgWsId: bids.pgWsId,
      pgWsName: workspaces.name,
      status: bids.status,
      submittedAt: bids.submittedAt,
    })
    .from(bids)
    .innerJoin(workspaces, eq(bids.pgWsId, workspaces.id))
    .where(eq(bids.rfpId, rfpId));

  return { rfp, bids: rfpBids };
}
