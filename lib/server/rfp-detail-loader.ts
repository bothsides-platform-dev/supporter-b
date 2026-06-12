// RFP 상세 데이터 로더 — 전체 페이지(app/(app)/rfp/[id], app/(app)/inbox/[rfpId])가
// 사용한다. server-only (repo factory import).
//
// auth-free: 세션/redirect 가드는 page shell 책임. 로더는 workspaceId 등 이미 해소된
// 인자만 받아 repo 호출 + 데이터 가공만 한다 (buyer-kanban-loader 컨벤션). 덕분에
// pglite + seed 로 auth mock 없이 단위 테스트 가능하다.
import {
  getAttachmentRepo,
  getBidNoteRepo,
  getBidQuoteTemplateRepo,
  getBidRepo,
  getInvitationRepo,
  getPgRequestRepo,
  getRfpRepo,
  getWorkspaceRepo,
  getRfpRequoteRequestRepo,
} from './repositories/factory';
import type { QuoteTemplateOption } from '@/lib/types/bid';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';
import type { BidNote } from '@/lib/types/bid-note';
import type { Attachment } from '@/lib/types/common';
import type { InvitationStatus } from '@/lib/types/invitation';
import type { RfpRequoteRequestStatus } from '@/lib/types/rfp-requote-request';

export type BuyerRfpDetailData = {
  rfp: RFP;
  /** submitted 상태 입찰 중 PG별 최신 라운드만. */
  bids: Bid[];
  /** bidId → 노트(Date→ISO 직렬화). */
  notesByBid: Record<string, BidNote[]>;
  rfpFiles: Attachment[];
  companyName: string;
  inviteList: { wsId: string; wsName: string; status: InvitationStatus }[];
  pgWsNameMap: Record<string, string>;
  /** 오픈 게시판에서 들어온 미결(pending) 참여 요청 — 구매사 검토용. */
  pendingRequests: { id: string; pgWsId: string; pgWsName: string; message: string; createdAt: string }[];
  /** pgWsId → 최신 재요청 요약(없으면 키 없음). */
  requoteByPg: Record<string, { status: RfpRequoteRequestStatus; round: number; deadline: string }>;
  /** pgWsId → 직전 라운드 견적(델타 표시용; 없으면 키 없음). */
  priorBidByPg: Record<string, Bid>;
  canEdit: boolean;
  authorId: string;
  authorName: string;
};

export type PgRfpDetailData = {
  rfp: RFP;
  /** 본인 워크스페이스가 이미 제출한 입찰 중 최신 라운드(있으면). */
  myBid: Bid | undefined;
  /** 구매사 워크스페이스 상호명 (workspaces.name). */
  buyerName: string;
  /** 본 PG 워크스페이스 공유 견적 템플릿 — BidForm 불러오기용(요율표). */
  quoteTemplates: QuoteTemplateOption[];
  /** 진행 중인 재요청(있으면 PG가 다시 제출 가능). */
  pendingRequote: { message: string; deadline: string; round: number } | null;
};


/** PG별 최신 라운드(submitted)만 남긴다. */
function pickCurrentBids(submitted: Bid[]): Bid[] {
  const byPg = new Map<string, Bid>();
  for (const b of submitted) {
    const cur = byPg.get(b.pgWsId);
    if (!cur || b.round > cur.round) byPg.set(b.pgWsId, b);
  }
  return [...byPg.values()];
}

/**
 * 구매사 상세 데이터. 소유하지 않거나 없는 RFP면 null(→ page 가 not-found UI).
 */
export async function loadBuyerRfpDetail(args: {
  code: string;
  workspaceId: string;
  userId: string;
  userName: string;
}): Promise<BuyerRfpDetailData | null> {
  const rfp = await (await getRfpRepo()).findByCode(args.code);
  if (!rfp || rfp.buyerWsId !== args.workspaceId) return null;

  const allBids = await (await getBidRepo()).findByRfp(rfp.id);
  const submitted = allBids.filter((b) => b.status === 'submitted');
  const bids = pickCurrentBids(submitted);

  // 직전 라운드(현재 라운드 바로 아래 최댓값) — 델타 표시용.
  const priorBidByPg: Record<string, Bid> = {};
  for (const cur of bids) {
    const prior = submitted
      .filter((b) => b.pgWsId === cur.pgWsId && b.round < cur.round)
      .sort((a, b) => b.round - a.round)[0];
    if (prior) priorBidByPg[cur.pgWsId] = prior;
  }

  // 재요청 요약 — pgWsId별 라운드 최댓값 1건.
  const requoteRows = await (await getRfpRequoteRequestRepo()).findByRfp(rfp.id);
  const requoteByPg: Record<string, { status: RfpRequoteRequestStatus; round: number; deadline: string }> = {};
  for (const r of requoteRows) {
    const cur = requoteByPg[r.pgWsId];
    if (!cur || r.round > cur.round) {
      requoteByPg[r.pgWsId] = { status: r.status, round: r.round, deadline: r.deadline };
    }
  }

  const rfpFiles = await (await getAttachmentRepo()).findByRfp(rfp.id);

  // 노트는 DB 소스. Date → ISO 로 직렬화해 클라이언트 트리에 안전하게 전달.
  const noteRepo = await getBidNoteRepo();
  const notesByBid: Record<string, BidNote[]> = {};
  for (const bid of bids) {
    const records = await noteRepo.findByBid(bid.id);
    notesByBid[bid.id] = records.map((n) => ({
      id: n.id,
      bidId: n.bidId,
      authorId: n.authorId,
      authorName: n.authorName,
      body: n.body,
      attachments: n.attachments,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  const wsRepo = await getWorkspaceRepo();
  const ws = await wsRepo.findById(rfp.buyerWsId);
  const companyName = ws?.name ?? '—';

  // allowedPgWorkspaceIds 가 초대 목록의 소스. invitation row 의 status 를 머지.
  const invitations = await (await getInvitationRepo()).findByRfp(rfp.id);
  const invByWsId = new Map<string, InvitationStatus>();
  for (const inv of invitations) {
    if (inv.pgWsId) invByWsId.set(inv.pgWsId, inv.status);
  }

  const allPgWsIds = Array.from(
    new Set([...rfp.allowedPgWorkspaceIds, ...bids.map((b) => b.pgWsId)]),
  );
  const allPgWorkspaces = await Promise.all(allPgWsIds.map((pgId) => wsRepo.findById(pgId)));
  const pgWsNameMap: Record<string, string> = {};
  allPgWorkspaces.forEach((w, i) => {
    if (w) pgWsNameMap[allPgWsIds[i]] = w.name;
  });

  const inviteList = rfp.allowedPgWorkspaceIds.map((wsId) => ({
    wsId,
    wsName: pgWsNameMap[wsId] ?? wsId,
    status: invByWsId.get(wsId) ?? ('draft' as InvitationStatus),
  }));

  // 오픈 게시판 콜드 피치 — pending 만 검토 목록에 노출. PG 상호명 hydrate.
  const allRequests = await (await getPgRequestRepo()).findByRfp(rfp.id);
  const pendingReqRows = allRequests.filter((r) => r.status === 'pending');
  const reqWsIds = Array.from(new Set(pendingReqRows.map((r) => r.pgWsId)));
  const reqWorkspaces = await Promise.all(reqWsIds.map((id) => wsRepo.findById(id)));
  const reqNameMap: Record<string, string> = {};
  reqWorkspaces.forEach((w, i) => {
    if (w) reqNameMap[reqWsIds[i]] = w.name;
  });
  const pendingRequests = pendingReqRows.map((r) => ({
    id: r.id,
    pgWsId: r.pgWsId,
    pgWsName: reqNameMap[r.pgWsId] ?? r.pgWsId,
    message: r.message,
    createdAt: r.createdAt,
  }));

  const canEdit = rfp.status === 'sent' && new Date(rfp.deadline).getTime() > Date.now();

  return {
    rfp,
    bids,
    notesByBid,
    rfpFiles,
    companyName,
    inviteList,
    pgWsNameMap,
    pendingRequests,
    requoteByPg,
    priorBidByPg,
    canEdit,
    authorId: args.userId,
    authorName: args.userName,
  };
}

/**
 * PG 상세 데이터. 초대받지 않은(canAccess=false) RFP면 null(→ page 가 notFound).
 * 부수효과: 본인 워크스페이스의 accepted invitation 을 opened 로 1회 전이(검토 시그널).
 */
export async function loadPgRfpDetail(args: {
  code: string;
  workspaceId: string;
}): Promise<PgRfpDetailData | null> {
  const rfp = await (await getRfpRepo()).findByCode(args.code);
  if (!rfp) return null;

  const invRepo = await getInvitationRepo();
  const ok = await invRepo.canAccess(rfp.id, args.workspaceId);
  if (!ok) return null;

  // 검토 시작 시그널 — accepted/sent → opened (repo SQL 이 멱등 보장).
  const invitations = await invRepo.findByRfp(rfp.id);
  const mine = invitations.find(
    (i) =>
      i.pgWsId === args.workspaceId &&
      (i.status === 'sent' || i.status === 'accepted'),
  );
  if (mine) await invRepo.markOpened(mine.id, new Date());

  // 구매사 첨부 hydrate — RfpBriefPanel 미리보기용.
  rfp.rfpFiles = await (await getAttachmentRepo()).findByRfp(rfp.id);

  const allBids = await (await getBidRepo()).findByRfp(rfp.id);
  const submittedMine = allBids.filter(
    (b) => b.pgWsId === args.workspaceId && b.status === 'submitted',
  );
  // 최신 라운드 submitted bid (여러 라운드 가능).
  const myBid = submittedMine.sort((a, b) => b.round - a.round)[0] ?? undefined;

  // pending 재요청 조회 — PG가 다시 제출 가능한 상태인지 판단.
  const pendingReq = await (await getRfpRequoteRequestRepo()).findPendingByPair(rfp.id, args.workspaceId);
  const pendingRequote = pendingReq
    ? { message: pendingReq.message, deadline: pendingReq.deadline, round: pendingReq.round }
    : null;

  // 구매사 상호명 — RfpBriefPanel 에 표시.
  const wsRepo = await getWorkspaceRepo();
  const buyerWs = await wsRepo.findById(rfp.buyerWsId);
  const buyerName = buyerWs?.name ?? '—';

  // 본 PG 워크스페이스 공유 견적 템플릿(요율표) — 폼 채우기용 직렬화 부분집합.
  const templates = await (await getBidQuoteTemplateRepo()).listByWorkspace(
    args.workspaceId,
  );
  const quoteTemplates: QuoteTemplateOption[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    settleCycle: t.settleCycle,
    settleLimit: t.settleLimit,
    guaranteeInsurance: t.guaranteeInsurance,
    paymentFees: t.paymentFees,
  }));

  return { rfp, myBid, pendingRequote, buyerName, quoteTemplates };
}
