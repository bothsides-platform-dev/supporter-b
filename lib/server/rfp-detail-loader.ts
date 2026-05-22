// RFP 상세 데이터 로더 — 전체 페이지(app/(app)/rfp/[id], app/(app)/inbox/[rfpId])가
// 사용한다. server-only (repo factory import).
//
// auth-free: 세션/redirect 가드는 page shell 책임. 로더는 workspaceId 등 이미 해소된
// 인자만 받아 repo 호출 + 데이터 가공만 한다 (buyer-kanban-loader 컨벤션). 덕분에
// pglite + seed 로 auth mock 없이 단위 테스트 가능하다.
import {
  getAttachmentRepo,
  getBidNoteRepo,
  getBidRepo,
  getInvitationRepo,
  getRfpRepo,
  getWorkspaceRepo,
} from './repositories/factory';
import { baseUrl } from './actions/auth/_shared';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';
import type { BidNote } from '@/lib/types/bid-note';
import type { Attachment } from '@/lib/types/common';
import type { InvitationStatus } from '@/lib/types/invitation';

export type BuyerRfpDetailData = {
  rfp: RFP;
  /** submitted 상태 입찰만. */
  bids: Bid[];
  /** bidId → 노트(Date→ISO 직렬화). */
  notesByBid: Record<string, BidNote[]>;
  rfpFiles: Attachment[];
  companyName: string;
  inviteList: { wsId: string; wsName: string; status: InvitationStatus }[];
  pgWsNameMap: Record<string, string>;
  canEdit: boolean;
  shareUrl: string;
  authorId: string;
  authorName: string;
};

export type PgRfpDetailData = {
  rfp: RFP;
  /** 본인 워크스페이스가 이미 제출한 입찰(있으면). */
  myBid: Bid | undefined;
};

export type BuyerAwardData = {
  rfp: RFP;
  /** 수주 대상 입찰. */
  selected: Bid;
  /** 나머지 제출 입찰(비교용). */
  others: Bid[];
  pgWsNameById: Record<string, string>;
  buyerWorkspaceName: string;
};

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
  const bids = allBids.filter((b) => b.status === 'submitted');

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

  const canEdit = rfp.status === 'sent' && new Date(rfp.deadline).getTime() > Date.now();
  const shareUrl = rfp.shareToken ? `${baseUrl()}/share/rfp/${rfp.shareToken}` : '';

  return {
    rfp,
    bids,
    notesByBid,
    rfpFiles,
    companyName,
    inviteList,
    pgWsNameMap,
    canEdit,
    shareUrl,
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
  const myBid = allBids.find(
    (b) => b.pgWsId === args.workspaceId && b.status === 'submitted',
  );

  return { rfp, myBid };
}

/**
 * 수주 확정 화면 데이터. 소유하지 않거나 선택 입찰(bidId)을 못 찾으면 null.
 * 전체 페이지(app/(app)/rfp/[id]/award)가 사용.
 */
export async function loadBuyerAwardData(args: {
  code: string;
  workspaceId: string;
  bidId: string | undefined;
}): Promise<BuyerAwardData | null> {
  const rfp = await (await getRfpRepo()).findByCode(args.code);
  if (!rfp || rfp.buyerWsId !== args.workspaceId) return null;

  const allBids = (await (await getBidRepo()).findByRfp(rfp.id)).filter(
    (b) => b.status === 'submitted',
  );
  const selected = args.bidId ? allBids.find((b) => b.id === args.bidId) : undefined;
  if (!selected) return null;

  const others = allBids.filter((b) => b.id !== selected.id);

  const wsRepo = await getWorkspaceRepo();
  const pgWsIds = Array.from(new Set(allBids.map((b) => b.pgWsId)));
  const pgWsNameById: Record<string, string> = {};
  for (const wsId of pgWsIds) {
    const ws = await wsRepo.findById(wsId);
    if (ws) pgWsNameById[wsId] = ws.name;
  }
  const buyerWs = await wsRepo.findById(rfp.buyerWsId);

  return {
    rfp,
    selected,
    others,
    pgWsNameById,
    buyerWorkspaceName: buyerWs?.name ?? '—',
  };
}
