// PG 파트너 임베디드 데모용 고정 데이터. 실제 타입으로 선언해 제품 타입이 바뀌면 빌드가
// 깨지게 한다(단일소스 가드). 딜룸 RFP 는 buyer 데모의 demoRfps[0] 를 재사용한다.
import type { Dashboard } from '@/lib/server/dashboard/buildDashboard';
import type { InboxListItem } from '@/lib/server/actions/chat/inboxLoader';
import type { InboxRow } from '@/components/inbox/InboxList';
import type { RFP } from '@/lib/types/rfp';
import type { WorkspaceDisplay } from '@/lib/types/workspace';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';
import type { LoadThreadResult, ThreadMessage } from '@/lib/server/actions/chat/conversationLoaders';
import { demoRfps } from '../demo-app-fixtures';

const now = Date.now();
const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString();

export const demoPgWorkspaceName = '파트너 PG사';
export const demoPgBuyerName = '브링콘파트너스';
/** 데모 구매사 신원 — RfpBriefPanel·BidWizard 가 통째로 받는다(데모는 로고 없음). */
export const demoPgBuyer: WorkspaceDisplay = {
  id: 'demo-buyer-ws',
  name: demoPgBuyerName,
  type: 'buyer',
  logoUpdatedAt: null,
};

// ── 받은 견적 요청 목록(InboxList rows) ────────────────────────────
export const demoPgInboxRows: InboxRow[] = [
  {
    invitationId: 'pg-inv-1',
    stage: 'received',
    rfpId: 'P-2606-0042',
    rfpTitle: '2026 결제 인프라 견적 요청',
    rfpDeadline: iso(3),
    grade: '일반',
    contractType: 'new',
  },
  {
    invitationId: 'pg-inv-2',
    stage: 'submitted',
    bidId: 'pg-bid-2',
    rfpId: 'P-2606-0039',
    rfpTitle: '정기결제(빌링) 전환 견적',
    rfpDeadline: iso(5),
    grade: '중소',
  },
  {
    invitationId: 'pg-inv-3',
    stage: 'won',
    bidId: 'pg-bid-3',
    rfpId: 'P-2606-0031',
    rfpTitle: '해외카드 수수료 재협상',
    rfpDeadline: iso(-2),
    grade: '대형',
  },
];

// 딜룸(요청 상세 + 견적 작성)용 RFP — received 행(P-2606-0042)에 대응. buyer 데모 RFP 재사용.
export const demoPgDealRfp: RFP = demoRfps[0];

/**
 * PG 딜룸 데모 데이터 — 실제 `PgDealRoomBody` 를 그대로 구동한다(탭 구성을 손으로
 * 다시 조립하면 실제 화면과 조용히 갈라진다).
 *
 * 아직 견적을 내지 않은 초대 PG 상태: 접수 기간 열림 · myBid 없음 · 미선정.
 * 그래서 탭은 실제와 같이 요청 조건 · 견적 작성 · 첨부 셋이고 계약 탭은 없다
 * (`awardedToMe: false` → 봉인 경계상 signing 도 null).
 */
export const demoPgDealData: PgRfpDetailData = {
  rfp: demoPgDealRfp,
  bidWindowOpen: true,
  myBid: undefined,
  myBidHistory: [],
  bidAuthorNames: {},
  buyer: demoPgBuyer,
  quoteTemplates: [],
  pendingRequote: null,
  awardedToMe: false,
  buyerContact: null,
  signing: null,
  signingTemplates: [],
  linkedSigningTemplate: null,
};

// ── PG 홈 대시보드 ─────────────────────────────────────────────
export const demoPgDashboard: Dashboard = {
  kpis: [
    { id: 'received', label: '받은 요청', value: 3, href: '/inbox' },
    { id: 'due', label: '마감 임박', value: 1, href: '/inbox' },
    { id: 'submitted', label: '견적 보냄', value: 2, href: '/inbox' },
    { id: 'won', label: '선정됨', value: 4, href: '/inbox' },
  ],
  groups: [
    {
      id: 'received',
      label: '새로 받은 견적 요청',
      items: [
        { id: 'g1', href: '/inbox/P-2606-0042', title: '2026 결제 인프라 견적 요청', badge: 'D-3' },
        { id: 'g2', href: '/inbox/P-2606-0039', title: '정기결제(빌링) 전환 견적', badge: 'D-5' },
      ],
    },
  ],
};

export const demoPgInboxItems: InboxListItem[] = [
  {
    kind: 'team',
    key: 't:pg-1',
    rfpId: 'demo-rfp-1',
    rfpCode: 'P-2606-0042',
    rfpTitle: '2026 결제 인프라 견적 요청',
    preview: '브링콘파트너스: 정산주기 조건 한 번만 확인 부탁드려요.',
    lastMessageAt: new Date(now - 3 * 3_600_000).toISOString(),
    unread: true,
    viewerWorkspaceType: 'pg',
  },
];

export const demoPgUnread = 1;

// ── 메시지함(/messages) ────────────────────────────────────────
// 실제 MessageInbox 를 그대로 구동한다. 데모는 상대방 대화 하나만 담는다 —
// 팀 스레드는 로더가 따로라(TeamThreadPane) 고정 데이터로 채울 경로가 없다.
export const demoPgConversationId = 'demo-conv-1';

// 대화 로더의 상대방 신원은 `workspaceId` 키를 쓴다(WorkspaceDisplay 의 `id` 와 다름).
const demoPgBuyerCounterparty = {
  workspaceId: demoPgBuyer.id,
  name: demoPgBuyer.name,
  type: demoPgBuyer.type,
  logoUpdatedAt: demoPgBuyer.logoUpdatedAt,
};

export const demoPgMessageItems: InboxListItem[] = [
  {
    kind: 'counterparty',
    key: `c:${demoPgConversationId}`,
    conversationId: demoPgConversationId,
    counterparty: demoPgBuyerCounterparty,
    rfpId: demoRfps[0].id,
    rfpCode: demoRfps[0].code,
    rfpTitle: demoRfps[0].title,
    rfpStatus: 'sent',
    rfpDeadline: demoRfps[0].deadline,
    preview: '좋아요. 그럼 그 조건으로 검토해볼게요. 감사합니다!',
    lastMessageAt: new Date(now - 40 * 60_000).toISOString(),
    unread: true,
    closedAfterAward: false,
  },
];

export const demoPgMessageUnread = demoPgMessageItems.filter((i) => i.unread).length;

const demoPgViewer = { userId: 'demo-pg-user', name: '나', avatarUpdatedAt: null };

function threadMessage(o: {
  id: string;
  mine: boolean;
  body: string;
  minutesAgo: number;
}): ThreadMessage {
  return {
    id: o.id,
    authorUserId: o.mine ? demoPgViewer.userId : 'demo-buyer-user',
    authorName: o.mine ? demoPgViewer.name : '이담당',
    authorEmail: o.mine ? 'me@example.com' : 'buyer@example.com',
    authorAvatarUpdatedAt: null,
    sender: o.mine ? 'self' : 'other',
    body: o.body,
    rfpId: null,
    createdAt: new Date(now - o.minutesAgo * 60_000).toISOString(),
    readByCounterparty: o.mine,
    attachments: [],
  };
}

/** 스레드 캐시에 시딩할 고정 대화 — 서버 액션을 태우지 않고 실제 스레드 뷰를 채운다. */
export const demoPgThread: LoadThreadResult = {
  ok: true,
  conversationId: demoPgConversationId,
  counterparty: demoPgBuyerCounterparty,
  viewer: demoPgViewer,
  messages: [
    threadMessage({ id: 'm1', mine: false, body: '안녕하세요, 견적 잘 봤어요. 정산주기 D+2도 가능할까요?', minutesAgo: 52 }),
    threadMessage({ id: 'm2', mine: true, body: '네, D+2 가능합니다. 보증보험도 면제 조건으로 제안드릴게요.', minutesAgo: 46 }),
    threadMessage({ id: 'm3', mine: false, body: '좋아요. 그럼 그 조건으로 검토해볼게요. 감사합니다!', minutesAgo: 40 }),
  ],
  rfpById: { [demoRfps[0].id]: { code: demoRfps[0].code, title: demoRfps[0].title } },
};
