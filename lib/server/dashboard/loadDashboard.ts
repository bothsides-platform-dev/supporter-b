// Thin glue: read repos, hand off to the pure builders. server-only.
import {
  getRfpRepo,
  getBidRepo,
  getPgRequestRepo,
} from '@/lib/server/repositories/factory';
import {
  buildBuyerDashboard,
  buildPgDashboard,
  countSubmittedBids,
  type Dashboard,
} from './buildDashboard';
import { loadPgInboxData, pgInboxDataToRows } from '@/lib/server/board/pgInbox';
import { pgRequestState } from '@/lib/rfp/pg-request-state';

export async function loadBuyerDashboard(workspaceId: string): Promise<Dashboard> {
  const [rfpRepo, bidRepo] = await Promise.all([getRfpRepo(), getBidRepo()]);
  const rfps = await rfpRepo.findByBuyerWs(workspaceId);
  const bidsByRfp = await bidRepo.findByRfpIds(rfps.map((r) => r.id));
  return buildBuyerDashboard(rfps, countSubmittedBids(bidsByRfp), new Date());
}

export async function loadPgDashboard(workspaceId: string): Promise<Dashboard> {
  const now = new Date();
  const [data, openRfps] = await Promise.all([
    loadPgInboxData(workspaceId),
    (await getPgRequestRepo()).findOpenRfpsForPg(workspaceId, now),
  ]);
  const rows = pgInboxDataToRows(data);
  return {
    ...buildPgDashboard(rows.map(r => ({ ...r, rfpCode: r.rfpId })), now, openRfps),
    requests: rows.filter(r => pgRequestState(r, now.getTime()).needsResponse)
      .sort((a, b) => Date.parse(a.rfpDeadline) - Date.parse(b.rfpDeadline)),
  };
}
