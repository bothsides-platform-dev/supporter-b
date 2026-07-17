// 전자계약(e-contract) RSC 로더 3종 — rfp-detail-loader 컨벤션을 미러한다:
// auth-free, 이미 해소된 viewer/workspaceId 인자만 받아 repo 호출 + 데이터 가공만
// 한다. 서버 액션(lib/server/actions/contract/**)이 상태 전이를 수행하고, 여기는
// 읽기 전용 조합만 담당한다.
import {
  getBidRepo,
  getBizProfileRepo,
  getContractDocRepo,
  getContractTemplateRepo,
  getRfpRepo,
  getUserRepo,
  getWorkspaceRepo,
} from './repositories/factory';
import { getContractService } from './services/contract';
import { CONTRACT_DEFAULT_EXPIRES_DAYS } from '@/lib/types/contract-doc';
import type {
  ContractDoc,
  ContractDocEvent,
  ContractDocStatus,
  ContractDocSigner,
  ContractParty,
  ContractTemplate,
} from '@/lib/types/contract-doc';
import type { BizProfileRepo, WorkspaceRepo } from './repositories/types';

export type ContractDocListEntry = {
  id: string;
  code: string;
  title: string;
  status: ContractDocStatus;
  /** 내 워크스페이스 기준 상대방 워크스페이스 상호명. */
  counterpartyName: string;
  sentAt: string;
  expiresAt: string;
  completedAt: string | null;
  /** status==='sent' 이고 내 party 서명자가 아직 서명 전이면 true. */
  mySignPending: boolean;
  myParty: ContractParty;
};

/** 한 워크스페이스(구매사 또는 PG)가 관여한 전자계약 문서 목록 — 목록 화면용 UI projection. */
export async function listContractDocsForWorkspace(wsId: string): Promise<ContractDocListEntry[]> {
  const repo = await getContractDocRepo();
  const items = await repo.listForWorkspace(wsId);
  return items.map(({ doc, signers, buyerWsName, pgWsName }) => {
    const myParty: ContractParty = doc.buyerWsId === wsId ? 'buyer' : 'pg';
    const counterpartyName = myParty === 'buyer' ? pgWsName : buyerWsName;
    return {
      id: doc.id,
      code: doc.code,
      title: doc.title,
      status: doc.status,
      counterpartyName,
      sentAt: doc.sentAt,
      expiresAt: doc.expiresAt,
      completedAt: doc.completedAt,
      mySignPending: mySignPendingFor(doc.status, signers, myParty),
      myParty,
    };
  });
}

export type ContractDocDetail = {
  /** 서명 이미지 바이트 없음 — ContractDoc 도메인 타입 자체가 싣지 않는다. */
  doc: ContractDoc;
  signers: ContractDocSigner[];
  events: ContractDocEvent[];
  myParty: ContractParty;
  mySigner: ContractDocSigner | undefined;
  canSign: boolean;
  canDecline: boolean;
  canCancel: boolean;
  canReassign: boolean;
};

/**
 * 계약 문서 상세. 양측 워크스페이스(buyer/pg) 멤버가 아니면 null. 조회 전 lazy
 * 훅을 태운다: expireIfDue(기한 초과 sent 문서 → expired 전이) 다음 ensureFinalized
 * (양측 서명 완료됐는데 status 가 여전히 sent 인 복구 케이스 → completed 전이) —
 * 둘 다 멱등이라 매 호출 안전하다. 훅이 상태를 바꿨을 수 있으므로 문서를 재조회한다.
 * viewerIsMaster 처리는 다루지 않는다(페이지 몫).
 */
export async function loadContractDocDetail(
  docId: string,
  viewer: { userId: string; workspaceId: string },
): Promise<ContractDocDetail | null> {
  const repo = await getContractDocRepo();
  const found = await repo.findById(docId);
  if (!found) return null;
  if (viewer.workspaceId !== found.buyerWsId && viewer.workspaceId !== found.pgWsId) return null;

  const service = await getContractService();
  await service.expireIfDue(docId);
  await service.ensureFinalized(docId);
  const doc = (await repo.findById(docId))!;

  const [signers, events] = await Promise.all([repo.getSigners(docId), repo.listEvents(docId)]);
  const myParty: ContractParty = viewer.workspaceId === doc.buyerWsId ? 'buyer' : 'pg';
  const mySigner = signers.find((s) => s.party === myParty);
  const buyerSigner = signers.find((s) => s.party === 'buyer');

  const active = doc.status === 'sent';
  const canSign = active && !!mySigner && mySigner.userId === viewer.userId && !mySigner.signedAt;

  const wsRepo = await getWorkspaceRepo();

  let canDecline = false;
  let canReassign = false;
  if (active && myParty === 'buyer') {
    const isSigner = buyerSigner?.userId === viewer.userId;
    const isAdmin = await isApprovedAdmin(wsRepo, viewer.userId, doc.buyerWsId);
    canDecline = isSigner || isAdmin;
    canReassign = isAdmin && !buyerSigner?.signedAt;
  }

  let canCancel = false;
  if (active && myParty === 'pg') {
    const isSender = doc.createdBy === viewer.userId;
    const isAdmin = await isApprovedAdmin(wsRepo, viewer.userId, doc.pgWsId);
    canCancel = isSender || isAdmin;
  }

  return { doc, signers, events, myParty, mySigner, canSign, canDecline, canCancel, canReassign };
}

export type LoadContractCreateDataResult =
  | { activeDocId: string }
  | {
      rfp: { code: string; title: string };
      /** ready 첨부가 있는(발송 가능한) 템플릿만. */
      templates: ContractTemplate[];
      buyerPrefill: { name: string; bizNo: string | null; repName: string };
      pgPrefill: { name: string; bizNo: string | null; repName: string };
      /** rfp.createdBy 프로필명 — 실제 서명자는 발송 시점에 서비스가 재해석하므로 폴백 안내용. */
      buyerSignerName: string;
      pgMembers: { userId: string; name: string; email: string }[];
      defaultExpiresDays: number;
    };

/**
 * 전자계약 발송 화면(작성 폼) 프리필 데이터. RFP 가 awarded 상태이고 요청한 PG
 * 워크스페이스가 실제 선정된 워크스페이스인지 검증 — 아니면 null. 이미 활성(sent)
 * 문서가 있으면 `{activeDocId}` 만 반환해 페이지가 상세로 redirect 하게 한다(완료·
 * 반려·회수·만료된 이전 문서는 막지 않음 — 재발송/변경계약 허용).
 */
export async function loadContractCreateData(
  rfpCode: string,
  pgViewer: { userId: string; workspaceId: string },
): Promise<LoadContractCreateDataResult | null> {
  const rfp = await (await getRfpRepo()).findByCode(rfpCode);
  if (!rfp || rfp.status !== 'awarded' || !rfp.awardedBidId) return null;

  const bid = await (await getBidRepo()).findById(rfp.awardedBidId);
  if (!bid || bid.pgWsId !== pgViewer.workspaceId) return null;

  const docRepo = await getContractDocRepo();
  const activeDoc = await docRepo.findLatestByRfp(rfp.id);
  if (activeDoc && activeDoc.status === 'sent') {
    return { activeDocId: activeDoc.id };
  }

  const wsRepo = await getWorkspaceRepo();
  const bizProfileRepo = await getBizProfileRepo();
  const [buyerWs, pgWs, buyerBizNo, pgBizNo] = await Promise.all([
    wsRepo.findById(rfp.buyerWsId),
    wsRepo.findById(pgViewer.workspaceId),
    resolveWorkspaceBizNo(rfp.bizProfile?.bizNo ?? null, rfp.buyerWsId, wsRepo, bizProfileRepo),
    resolveWorkspaceBizNo(null, pgViewer.workspaceId, wsRepo, bizProfileRepo),
  ]);

  const allTemplates = await (await getContractTemplateRepo()).listByWorkspace(pgViewer.workspaceId);
  const templates = allTemplates.filter((t) => !!t.attachment);

  const buyerCreator = await (await getUserRepo()).findProfileById(rfp.createdBy);

  const [roster, recipients] = await Promise.all([
    wsRepo.teamRoster(pgViewer.workspaceId),
    wsRepo.approvedMemberRecipients(pgViewer.workspaceId),
  ]);
  const emailByUserId = new Map(recipients.map((r) => [r.userId, r.email]));
  const pgMembers = roster.map((m) => ({
    userId: m.userId,
    name: m.name,
    email: emailByUserId.get(m.userId) ?? '',
  }));

  return {
    rfp: { code: rfp.code, title: rfp.title },
    templates,
    buyerPrefill: { name: buyerWs?.name ?? '—', bizNo: buyerBizNo, repName: '' },
    pgPrefill: { name: pgWs?.name ?? '—', bizNo: pgBizNo, repName: '' },
    buyerSignerName: buyerCreator?.name ?? '',
    pgMembers,
    defaultExpiresDays: CONTRACT_DEFAULT_EXPIRES_DAYS,
  };
}

// ── private helpers ─────────────────────────────────────────────────────────

function mySignPendingFor(
  status: ContractDocStatus,
  signers: ContractDocSigner[],
  myParty: ContractParty,
): boolean {
  return status === 'sent' && !signers.find((s) => s.party === myParty)?.signedAt;
}

async function isApprovedAdmin(wsRepo: WorkspaceRepo, userId: string, wsId: string): Promise<boolean> {
  const m = await wsRepo.getMembership(userId, wsId);
  return !!m && m.role === 'admin' && m.approvalStatus === 'approved';
}

// buyer/pg prefill 의 bizNo 해석 — ContractService.buildTerms 의 buyerTier 폴백과
// 동일 순서: 스냅샷(rfp.bizProfile) 우선, 없으면 워크스페이스 현재 biz profile.
// PG 워크스페이스는 스냅샷이 없어 항상 workspaces.bizProfileId 경로만 탄다(PG
// 가입은 admin 소유 pg_profiles 테이블에 별도 bizNo 를 저장하며 이 앱 레포에는
// 그 테이블의 읽기 메서드가 없다 — 현재는 사실상 항상 null).
async function resolveWorkspaceBizNo(
  snapshotBizNo: string | null,
  wsId: string,
  wsRepo: WorkspaceRepo,
  bizProfileRepo: BizProfileRepo,
): Promise<string | null> {
  if (snapshotBizNo) return snapshotBizNo;
  const bizProfileId = await wsRepo.getBizProfileId(wsId);
  if (!bizProfileId) return null;
  const biz = await bizProfileRepo.findById(bizProfileId);
  return biz?.bizNo ?? null;
}
