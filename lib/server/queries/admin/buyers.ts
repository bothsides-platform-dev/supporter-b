import { desc, eq } from 'drizzle-orm';
import { workspaces, rfps } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type BuyerRow = {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  createdAt: Date;
};

export type RfpRow = {
  id: string;
  code: string;
  title: string;
  status: 'draft' | 'sent' | 'closed' | 'cancelled' | 'awarded';
  deadline: Date;
  createdAt: Date;
};

export type WorkspaceFullRow = typeof workspaces.$inferSelect;

export async function listBuyers(): Promise<BuyerRow[]> {
  const rows = await (actionDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      status: workspaces.status,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(eq(workspaces.type, 'buyer'))
    .orderBy(desc(workspaces.createdAt)) as Promise<BuyerRow[]>);
  return rows;
}

export async function getBuyerDetail(workspaceId: string) {
  const [ws] = (await (actionDb()
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId)) as Promise<WorkspaceFullRow[]>));
  if (!ws) return null;

  const buyerRfps = await (actionDb()
    .select({
      id: rfps.id,
      code: rfps.code,
      title: rfps.title,
      status: rfps.status,
      deadline: rfps.deadline,
      createdAt: rfps.createdAt,
    })
    .from(rfps)
    .where(eq(rfps.buyerWsId, workspaceId))
    .orderBy(desc(rfps.createdAt)) as Promise<RfpRow[]>);

  return { workspace: ws, rfps: buyerRfps };
}
