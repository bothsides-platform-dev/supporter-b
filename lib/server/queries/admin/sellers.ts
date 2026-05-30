import { desc, eq } from 'drizzle-orm';
import { workspaces, bids, pgProfiles } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { getWorkspaceAdminUser } from './workspaceOwner';

export type SellerRow = {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  createdAt: Date;
};

export type BidRow = {
  id: string;
  rfpId: string;
  status: 'draft' | 'submitted' | 'withdrawn';
  submittedAt: Date;
};

export type WorkspaceFullRow = typeof workspaces.$inferSelect;
export type PgProfileRow = typeof pgProfiles.$inferSelect;

export async function listSellers(): Promise<SellerRow[]> {
  const rows = await (actionDb()
    .select({
      id: workspaces.id,
      name: workspaces.name,
      status: workspaces.status,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(eq(workspaces.type, 'pg'))
    .orderBy(desc(workspaces.createdAt)) as Promise<SellerRow[]>);
  return rows;
}

export async function getSellerDetail(workspaceId: string) {
  const [ws] = (await (actionDb()
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId)) as Promise<WorkspaceFullRow[]>));
  if (!ws) return null;

  const [profile] = (await (actionDb()
    .select()
    .from(pgProfiles)
    .where(eq(pgProfiles.workspaceId, workspaceId)) as Promise<PgProfileRow[]>));

  const sellerBids = await (actionDb()
    .select({
      id: bids.id,
      rfpId: bids.rfpId,
      status: bids.status,
      submittedAt: bids.submittedAt,
    })
    .from(bids)
    .where(eq(bids.pgWsId, workspaceId))
    .orderBy(desc(bids.submittedAt))
    .limit(20) as Promise<BidRow[]>);

  const ownerContact = await getWorkspaceAdminUser(workspaceId);

  return { workspace: ws, pgProfile: profile ?? null, bids: sellerBids, ownerContact };
}
