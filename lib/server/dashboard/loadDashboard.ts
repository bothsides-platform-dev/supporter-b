// Thin glue: read repos, hand off to the pure builders. server-only.
import {
  getRfpRepo,
  getBidRepo,
  getInvitationRepo,
} from '@/lib/server/repositories/factory';
import {
  buildBuyerDashboard,
  buildPgDashboard,
  countSubmittedBids,
  type Dashboard,
  type PgDashRow,
} from './buildDashboard';

export async function loadBuyerDashboard(workspaceId: string): Promise<Dashboard> {
  const [rfpRepo, bidRepo] = await Promise.all([getRfpRepo(), getBidRepo()]);
  const rfps = await rfpRepo.findByBuyerWs(workspaceId);
  const bidsByRfp = await bidRepo.findByRfpIds(rfps.map((r) => r.id));
  return buildBuyerDashboard(rfps, countSubmittedBids(bidsByRfp), new Date());
}

export async function loadPgDashboard(workspaceId: string): Promise<Dashboard> {
  const invRepo = await getInvitationRepo();
  const pairs = await invRepo.findByPgWorkspace(workspaceId);
  const rows: PgDashRow[] = pairs.map(({ invitation, rfp }) => ({
    invitationId: invitation.id,
    invitationStatus: invitation.status,
    rfpCode: rfp.code,
    rfpTitle: rfp.title,
    rfpDeadline: rfp.deadline,
  }));
  return buildPgDashboard(rows, new Date());
}
