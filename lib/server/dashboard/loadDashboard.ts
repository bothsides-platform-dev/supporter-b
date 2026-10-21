// Thin glue: read repos, hand off to the pure builders. server-only.
import {
  getRfpRepo,
  getBidRepo,
  getInvitationRepo,
  getPgRequestRepo,
} from '@/lib/server/repositories/factory';
import {
  buildBuyerDashboard,
  buildPgDashboard,
  countSubmittedBids,
  type Dashboard,
  type PgDashRow,
} from './buildDashboard';
import { classifyPgInvitation } from '@/lib/server/pg-kanban';

export async function loadBuyerDashboard(workspaceId: string): Promise<Dashboard> {
  const [rfpRepo, bidRepo] = await Promise.all([getRfpRepo(), getBidRepo()]);
  const rfps = await rfpRepo.findByBuyerWs(workspaceId);
  const bidsByRfp = await bidRepo.findByRfpIds(rfps.map((r) => r.id));
  return buildBuyerDashboard(rfps, countSubmittedBids(bidsByRfp), new Date());
}

export async function loadPgDashboard(workspaceId: string): Promise<Dashboard> {
  const [invRepo, reqRepo, bidRepo] = await Promise.all([
    getInvitationRepo(),
    getPgRequestRepo(),
    getBidRepo(),
  ]);
  const now = new Date();
  const [pairs, openRfps, bidList] = await Promise.all([
    invRepo.findByPgWorkspace(workspaceId),
    reqRepo.findOpenRfpsForPg(workspaceId, now),
    bidRepo.findByPgWs(workspaceId),
  ]);
  // bid 기반 stage 분류 (inbox 목록 / loadBoard PG 파이프라인과 동일 패턴).
  // round 오름차순(findByPgWs ORDER BY) + 명시적 max-round 가드 — sort 순서에만 의존하지 않음.
  const bidByRfp = new Map<string, (typeof bidList)[number]>();
  for (const b of bidList) {
    const existing = bidByRfp.get(b.rfpId);
    if (!existing || b.round > existing.round) bidByRfp.set(b.rfpId, b);
  }
  const rows: PgDashRow[] = pairs.map(({ invitation, rfp }) => ({
    invitationId: invitation.id,
    stage: classifyPgInvitation({ invitation, bid: bidByRfp.get(rfp.id), rfp }),
    rfpCode: rfp.code,
    rfpTitle: rfp.title,
    rfpDeadline: rfp.deadline,
  }));
  return buildPgDashboard(rows, now, openRfps);
}
