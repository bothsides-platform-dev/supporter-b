// Thin glue: read repos, hand off to the pure builders. server-only.
import {
  getRfpRepo,
  getBidRepo,
  getPgRequestRepo,
  getSigningContractRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import {
  buildBuyerHomeDashboard,
  buildPgDashboard,
  countSubmittedBids,
  type Dashboard,
} from './buildDashboard';
import { loadPgInboxData, pgInboxDataToRows } from '@/lib/server/board/pgInbox';
import { pgRequestState } from '@/lib/rfp/pg-request-state';
import { requireBuyerSession } from '@/lib/auth/session';
import { isMasterEmail } from '@/lib/auth/master-allowlist';

export async function loadBuyerDashboard(workspaceId: string): Promise<Dashboard> {
  const session = await requireBuyerSession();
  if (session.user.workspaceId !== workspaceId) throw new Error('FORBIDDEN_BUYER');
  const workspaceRepo = await getWorkspaceRepo();
  const workspace = await workspaceRepo.findActiveById(workspaceId);
  if (workspace?.type !== 'buyer') throw new Error('FORBIDDEN_BUYER');
  if (!isMasterEmail(session.user.email)) {
    const membership = await workspaceRepo.getMembership(session.user.id, workspaceId);
    if (membership?.type !== 'buyer') throw new Error('FORBIDDEN_BUYER');
  }
  const [rfpRepo, bidRepo, signingRepo] = await Promise.all([getRfpRepo(), getBidRepo(), getSigningContractRepo()]);
  const rfps = await rfpRepo.findByBuyerWs(workspaceId);
  const [bidsByRfp, agreements] = await Promise.all([
    bidRepo.findByRfpIds(rfps.map(rfp => rfp.id)),
    signingRepo.findPlatformStatusesByBuyerWs(workspaceId),
  ]);
  return buildBuyerHomeDashboard(rfps, countSubmittedBids(bidsByRfp), agreements, new Date());
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
