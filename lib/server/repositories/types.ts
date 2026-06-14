// Repository interfaces — backend-agnostic contracts.
// Drizzle implementations live in ./drizzle/*.
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { DB } from '@/lib/db/client';
import type { PgliteDB } from '@/lib/db/client-pglite';

import type { RFP, RfpStatus } from '@/lib/types/rfp';
import type { RfpInvitation } from '@/lib/types/invitation';
import type { PgRequest, PgRequestStatus, OpportunityListing } from '@/lib/types/pg-request';
import type {
  Workspace,
  WorkspaceMembershipSummary,
  WorkspaceType,
} from '@/lib/types/workspace';
import type { User } from '@/lib/types/user';
import type { BizProfile } from '@/lib/types/biz-profile';
import type { Bid, PaymentMethod, TierRates } from '@/lib/types/bid';
import type { BoardColumn, ColumnKind } from '@/lib/types/column';
import type { Attachment } from '@/lib/types/common';
import type { Contract } from '@/lib/types/contract';
import type { Notification, NotificationChannel } from '@/lib/types/notification';
import type { AttachmentRecord } from './attachment-record';
import type { VerificationToken } from '@/lib/types/auth';
import type { OutboxEntry, OutboxEvent, Sender } from '../outbox/types';
import type { RfpRequoteRequest } from '@/lib/types/rfp-requote-request';

// Tx union — postgres-js DB, pglite DB, or a transactional handle from either.
// `any` generics are localised here so individual method signatures stay clean.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = DB | PgliteDB | PgTransaction<any, any, any>;

export type TokenClaimResult =
  | { ok: true; invitation: RfpInvitation }
  | { ok: false; reason: 'expired' | 'used' | 'invalid' };

// ── RFP ───────────────────────────────────────────────────────────────
export interface RfpRepo {
  /** RFP insert/upsert(by id). 호출자가 id 미리 발급(`rfp-id.ts`). */
  save(rfp: RFP, tx?: Tx): Promise<void>;
  /** id(uuid) 단건 조회. 없으면 undefined. */
  findById(id: string, tx?: Tx): Promise<RFP | undefined>;
  /** code(P-YYMM-NNNN) 단건 조회 — URL/표시용 식별자. 없으면 undefined. */
  findByCode(code: string, tx?: Tx): Promise<RFP | undefined>;
  /** 한 구매사 워크스페이스의 모든 RFP. */
  findByBuyerWs(wsId: string, tx?: Tx): Promise<RFP[]>;
  /** 상태 전이 + 패치. DB 레이어에서 `WHERE status=$prev` 동시성 가드. */
  transition(id: string, to: RfpStatus, patch?: Partial<RFP>, tx?: Tx): Promise<RFP>;
  /** 통일 칸반: pipeline 보드 커스텀 컬럼 배치. null = 자동분류 복귀. */
  setBoardColumn(rfpId: string, columnId: string | null, tx?: Tx): Promise<void>;
}

// ── Invitation ────────────────────────────────────────────────────────
/** findByPgWorkspace 반환 행 — buyerName 은 RFP 발신 구매사 워크스페이스명 (카드/목록 표기용). */
export type PgInvitationPair = {
  invitation: RfpInvitation;
  rfp: RFP;
  buyerName: string;
};

export interface InvitationRepo {
  /** 초대 발송 — raw 토큰을 hash로 변환해 저장. raw 비저장. */
  save(inv: RfpInvitation, rawToken: string, tx?: Tx): Promise<void>;
  /** id 조회. */
  findById(id: string, tx?: Tx): Promise<RfpInvitation | undefined>;
  /** raw 토큰의 sha256 hash로 조회. claim 전 email 매칭 검사용. */
  findByTokenHash(tokenHash: string, tx?: Tx): Promise<RfpInvitation | undefined>;
  /** 한 RFP의 초대 목록. */
  findByRfp(rfpId: string, tx?: Tx): Promise<RfpInvitation[]>;
  /** 여러 RFP의 초대를 rfpId별 Map으로 배치 조회 (buyer 칸반 N+1 제거). */
  findByRfpIds(rfpIds: string[], tx?: Tx): Promise<Map<string, RfpInvitation[]>>;
  /** 한 RFP의 draft 상태 초대만 조회 — sendDraftInvitationsAction 일괄 발송용. */
  findDraftsByRfp(rfpId: string, tx?: Tx): Promise<RfpInvitation[]>;
  /** (rfpId, pgWsId) 쌍으로 단건 조회 — status 불문. acceptPgRequest 분기용. */
  findByRfpAndPg(rfpId: string, pgWsId: string, tx?: Tx): Promise<RfpInvitation | undefined>;
  /** draft row 삽입 (tokenHash = 'draft-{invId}' placeholder). */
  saveDraft(invId: string, rfpId: string, pgWsId: string, expiresAt: Date, tx?: Tx): Promise<void>;
  /** draft → pending: rawToken hash 갱신 + status='pending' + sentAt/expiresAt 갱신. */
  promoteDraft(invId: string, rawToken: string, now: Date, expiresAt: Date, tx?: Tx): Promise<void>;
  /** PG 워크스페이스에 발송된 활성 초대 + RFP pair — 인박스/칸반 공통 fetcher. */
  findByPgWorkspace(pgWsId: string, tx?: Tx): Promise<PgInvitationPair[]>;
  /** 토큰 atomic claim — 만료/사용/무효 분기. 동일 raw 토큰 동시 진입 가드. */
  claimToken(rawToken: string, userId: string, tx?: Tx): Promise<TokenClaimResult>;
  /** 워크스페이스 멤버십 단위 접근권 — 초대된 PG ws의 모든 멤버 통과. */
  canAccess(rfpId: string, pgWsId: string, tx?: Tx): Promise<boolean>;
  /**
   * `accepted` 상태의 초대를 `opened` 로 한 번만 전이. 이미 `opened` 이상이면 no-op.
   * inbox 상세 RSC 진입 시 호출 — 열람 기록(read-receipt) 목적. 칸반 분류에는 영향 없음 (검토중 단계 제거 후 sent/opened 모두 신규(received) 로 분류).
   */
  markOpened(invitationId: string, openedAt: Date, tx?: Tx): Promise<void>;
  /** 통일 칸반: pg pipeline 보드 커스텀 컬럼 배치. null = 자동분류 복귀. */
  setBoardColumn(invitationId: string, columnId: string | null, tx?: Tx): Promise<void>;
}

// ── RfpRequoteRequest (마감 전 협상 라운드) ───────────────────────────
export interface RfpRequoteRequestRepo {
  /** 요청 1건 생성 — (rfp,pg,round) UNIQUE 위배 시 throw. */
  create(req: RfpRequoteRequest, tx?: Tx): Promise<void>;
  /** 한 RFP의 모든 재요청 — createdAt asc. */
  findByRfp(rfpId: string, tx?: Tx): Promise<RfpRequoteRequest[]>;
  /** (rfp, pg) 의 pending 요청 — 없으면 undefined. submit 라운드 게이트용. */
  findPendingByPair(rfpId: string, pgWsId: string, tx?: Tx): Promise<RfpRequoteRequest | undefined>;
  /** PG 워크스페이스의 모든 pending 요청 — 인박스/칸반 '재요청' 배지 bulk 조회. */
  findPendingByPgWs(pgWsId: string, tx?: Tx): Promise<RfpRequoteRequest[]>;
  /** pending → responded 원자 전이(`WHERE status='pending'`). */
  markResponded(id: string, at: Date, tx?: Tx): Promise<void>;
}

// ── PgRequest (오픈 게시판 콜드 피치) ──────────────────────────────────
export interface PgRequestRepo {
  /** 요청 1건 생성 — (rfpId, pgWsId) UNIQUE 위배 시 throw(중복 요청 차단). */
  create(req: PgRequest, tx?: Tx): Promise<void>;
  /** id 단건 조회. */
  findById(id: string, tx?: Tx): Promise<PgRequest | undefined>;
  /** 한 RFP의 모든 요청 — 구매사 검토 목록(상태 필터는 호출부). createdAt asc. */
  findByRfp(rfpId: string, tx?: Tx): Promise<PgRequest[]>;
  /** (rfp, pg) 쌍의 현재 요청 상태 — 없으면 undefined. 게시판/액션 제외 판정용. */
  findPairStatus(rfpId: string, pgWsId: string, tx?: Tx): Promise<PgRequestStatus | undefined>;
  /** pending → accepted|rejected 원자 전이(`WHERE status='pending'`). 이미 결정됐으면 no-op. */
  markDecided(
    id: string,
    status: 'accepted' | 'rejected',
    decidedByUserId: string,
    at: Date,
    tx?: Tx,
  ): Promise<void>;
  /**
   * PG 게시판 — 발견 가능한 오픈 RFP 목록. 공개 경계가 이 쿼리에 있다:
   * SELECT는 화이트리스트 컬럼만(수수료/현재조건 미포함). WHERE status='sent'
   * AND deadline>now AND board_visible=true, 그리고 이미 allowlist 됐거나
   * 어떤 상태로든 요청 행이 있는 RFP는 제외.
   */
  findOpenRfpsForPg(pgWsId: string, now: Date, tx?: Tx): Promise<OpportunityListing[]>;
}

// ── Workspace ─────────────────────────────────────────────────────────
export interface WorkspaceRepo {
  /** 워크스페이스 + 멤버 동기화. */
  save(ws: Workspace, tx?: Tx): Promise<void>;
  /** id 조회 — 멤버/bizProfile hydration 포함. */
  findById(id: string, tx?: Tx): Promise<Workspace | undefined>;
  /** 유저가 속한 모든 워크스페이스 — 스위처용 경량 projection (hydration 없음). */
  listForUser(
    userId: string,
    tx?: Tx,
  ): Promise<WorkspaceMembershipSummary[]>;
  /**
   * 마스터/운영자 스위처용 — 모든 active 워크스페이스를 synthetic admin 멤버십
   * (role:'admin', unreadCount:0)으로 반환. 최대 500개. 멤버십 무관.
   */
  listAllWorkspacesForMaster(tx?: Tx): Promise<WorkspaceMembershipSummary[]>;
  /** 유저가 해당 워크스페이스의 멤버인지 여부 (boolean). 권한 게이트 단일 소스. */
  isMember(userId: string, workspaceId: string, tx?: Tx): Promise<boolean>;
  /** 해당 워크스페이스 멤버 user id 배열 — 알림 fanout + Centrifugo subscribe ACL용. 순서 미보장. */
  memberUserIds(workspaceId: string, tx?: Tx): Promise<string[]>;
  /** 여러 워크스페이스 멤버 user id를 workspaceId 키 Map으로 배치 조회 — N+1 제거용. */
  memberUserIdsBatch(wsIds: string[], tx?: Tx): Promise<Map<string, string[]>>;
  /** 해당 워크스페이스 멤버 이메일 배열 — outbox 발송 fanout용. 순서 미보장. */
  memberEmails(workspaceId: string, tx?: Tx): Promise<string[]>;
  /** canonical_pg_key가 있는 사전 시딩 PG 워크스페이스 목록 — PG 가입 회사 선택 UI용. */
  listCanonicalPgWorkspaces(): Promise<{ id: string; name: string; canonicalPgKey: string }[]>;
}

// ── User ──────────────────────────────────────────────────────────────
export interface UserRepo {
  /** upsert(by id). bcrypt hash는 호출자 책임. */
  save(user: User & { passwordHash: string }, tx?: Tx): Promise<void>;
  /** id 조회. */
  findById(id: string, tx?: Tx): Promise<User | undefined>;
  /** email 조회 — passwordHash 포함(로그인용). */
  findByEmail(
    email: string,
    tx?: Tx,
  ): Promise<(User & { passwordHash: string }) | undefined>;
  /** 이메일 인증 플래그 전환 — signup_email 토큰 소비 시 호출. 매칭 없으면 no-op. */
  markEmailVerified(email: string, tx?: Tx): Promise<void>;
}

// ── BizProfile ────────────────────────────────────────────────────────
export interface BizProfileRepo {
  /** 불변 — 신규 row 생성. id는 호출자가 발급(uuid). */
  save(profile: BizProfile & { id: string }, tx?: Tx): Promise<void>;
  /** id 조회. */
  findById(id: string, tx?: Tx): Promise<(BizProfile & { id: string }) | undefined>;
}

// ── Bid ───────────────────────────────────────────────────────────────
export interface BidRepo {
  /** 입찰 저장 — `(rfpId, pgWsId, round)` UNIQUE 위배 시 throw. */
  save(bid: Bid, tx?: Tx): Promise<void>;
  /** id 조회. */
  findById(id: string, tx?: Tx): Promise<Bid | undefined>;
  /** 한 RFP의 모든 입찰. */
  findByRfp(rfpId: string, tx?: Tx): Promise<Bid[]>;
  /** 여러 RFP의 입찰을 rfpId별 Map으로 배치 조회 (buyer 칸반 N+1 제거). */
  findByRfpIds(rfpIds: string[], tx?: Tx): Promise<Map<string, Bid[]>>;
  /** 한 PG 워크스페이스의 모든 입찰. */
  findByPgWs(pgWsId: string, tx?: Tx): Promise<Bid[]>;
  /** 통일 칸반: rfp_bids 보드 커스텀 컬럼 배치. null = 기본착지(진행전) 복귀. */
  setBoardColumn(bidId: string, columnId: string | null, tx?: Tx): Promise<void>;
}

// ── Kanban Column ─────────────────────────────────────────────────────
export interface ColumnRepo {
  /** 한 보드 (workspace_id, kind) 의 컬럼 — position 오름차순. */
  listByBoard(workspaceId: string, kind: ColumnKind, tx?: Tx): Promise<BoardColumn[]>;
  /** id 단건 조회. 없으면 undefined. */
  findById(id: string, tx?: Tx): Promise<BoardColumn | undefined>;
  /** 컬럼 1개 생성. */
  create(col: BoardColumn, tx?: Tx): Promise<void>;
  /** 일괄 생성 — 워크스페이스 시드/백필용. */
  createMany(cols: BoardColumn[], tx?: Tx): Promise<void>;
  /** 제목/색/위치 패치. */
  update(
    id: string,
    patch: Partial<Pick<BoardColumn, 'title' | 'color' | 'position'>>,
    tx?: Tx,
  ): Promise<void>;
  /** 컬럼 삭제 — placement 는 FK cascade. is_system 가드는 액션 레이어 책임. */
  remove(id: string, tx?: Tx): Promise<void>;
}

// ── BidNote ───────────────────────────────────────────────────────────
/** 저장/조회용 BidNote 모양 — DB 컬럼 + 조회 시 hydrated 필드(authorName,
 *  attachments). lib/types/bid-note.ts 는 Date를 string으로 직렬화한
 *  클라이언트용 모양이라 분리. */
export type BidNoteRecord = {
  id: string;
  bidId: string;
  authorId: string;
  body: string;
  createdAt: Date;
  /** findByBid 가 users 와 join 해 채움. save 시점에는 사용되지 않음. */
  authorName?: string;
  /** findByBid 가 attachments(owner_kind='bid_note') 로 join 해 채움. */
  attachments?: Attachment[];
};

export interface BidNoteRepo {
  /** 노트 row 저장 — 첨부는 별도 attachments 테이블에 polymorphic 연결. */
  save(note: BidNoteRecord, tx?: Tx): Promise<void>;
  /** 한 bid의 노트 — 생성 순서(오래된 → 최신). authorName, attachments
   *  hydrated. */
  findByBid(bidId: string, tx?: Tx): Promise<Required<BidNoteRecord>[]>;
  /** noteId로 stub 조회 — id + bidId만 반환. removeNote 소유권 체인용. */
  findById(noteId: string, tx?: Tx): Promise<Pick<BidNoteRecord, 'id' | 'bidId'> | undefined>;
  /** noteId에 연결된 attachment id 목록 — storage best-effort 정리용. */
  findAttachmentIds(noteId: string, tx?: Tx): Promise<string[]>;
  /** 단건 삭제 — DB cascade가 attachments 처리. */
  remove(noteId: string, tx?: Tx): Promise<void>;
}

// ── Notification ──────────────────────────────────────────────────────
export interface NotificationRepo {
  /** 인앱/이메일 알림 저장. */
  save(n: Notification, tx?: Tx): Promise<void>;
  /** 사용자+워크스페이스 최근 알림(생성 역순) — limit 제한. `channel` 지정 시 SQL에서 필터. */
  findRecentForUser(
    userId: string,
    workspaceId: string,
    limit: number,
    channel?: NotificationChannel,
    tx?: Tx,
  ): Promise<Notification[]>;
  /** 단건 읽음 처리. */
  markRead(id: string, tx?: Tx): Promise<void>;
  /** 사용자+워크스페이스 전부 읽음 처리. */
  markAllRead(userId: string, workspaceId: string, tx?: Tx): Promise<void>;
  /** 동일 window 내 queued 상태 chat.message 알림 존재 여부 — 인앱 알림 중복 방지용. */
  hasPendingChatNotification(
    userId: string,
    workspaceId: string,
    windowStart: Date,
    tx?: Tx,
  ): Promise<boolean>;
  /** 동일 window 내 pending team_chat 인앱 알림 존재 여부(rfp 단위 dedupe). */
  hasPendingTeamNotification(userId: string, rfpId: string, windowStart: Date, tx?: Tx): Promise<boolean>;
}

// ── Contract ──────────────────────────────────────────────────────────
export interface ContractRepo {
  /** 수주 확정. RFP에 1:1 unique. */
  save(c: Contract, tx?: Tx): Promise<void>;
  /** RFP 조회 — 수주 행 단건. */
  findByRfp(rfpId: string, tx?: Tx): Promise<Contract | undefined>;
}

// ── VerificationToken ─────────────────────────────────────────────────
export interface VerificationTokenRepo {
  /** 발급 — raw 비저장, hash만. */
  save(
    token: Omit<VerificationToken, 'token'> & { tokenHash: string },
    tx?: Tx,
  ): Promise<void>;
  /** atomic 소비 — 미사용/미만료만 통과. 성공 시 row 반환. */
  consume(
    tokenHash: string,
    now: Date,
    tx?: Tx,
  ): Promise<(Omit<VerificationToken, 'token'> & { tokenHash: string }) | undefined>;
  /** 만료 전 조회 — UI에서 토큰 유효성 미리보기. */
  findValid(
    tokenHash: string,
    now: Date,
    tx?: Tx,
  ): Promise<(Omit<VerificationToken, 'token'> & { tokenHash: string }) | undefined>;
  /**
   * 같은 (email, purpose) 의 미사용·미만료 토큰을 일괄 burn. passwordForgotAction
   * 등 새 토큰을 발급하는 동일 transaction 안에서 호출해 OWASP Forgot Password
   * 권장(prior token invalidation)을 구현. 이미 consumed 인 row 는 건드리지 않아
   * 원래의 consumedAt 타임스탬프를 보존함.
   */
  invalidatePending(
    params: {
      email: string;
      purpose: 'signup_email' | 'password_reset' | 'email_change';
      now: Date;
    },
    tx?: Tx,
  ): Promise<void>;
  /**
   * 이메일 재전송 시 이전 토큰을 expire(expiresAt=now)만 하고 consumedAt은 NULL
   * 유지. 불변식: consumedAt IS NOT NULL ⟺ 사용자가 직접 인증 완료.
   * invalidatePending(consumedAt 스탬프)과 달리 폴링/게이트에서 미인증 상태를 구분 가능.
   */
  expirePendingByEmail(
    params: {
      email: string;
      purpose: 'signup_email' | 'password_reset' | 'email_change';
      now: Date;
    },
    tx?: Tx,
  ): Promise<void>;
  /**
   * 6자리 코드(해시)로 atomic consume. meta.emailCode와 codeHash가 일치하고
   * 미사용·미만료인 토큰을 consumedAt 스탬프. 동시 호출 race-safe(UPDATE WHERE).
   */
  consumeByEmailCode(
    params: {
      email: string;
      purpose: 'signup_email' | 'password_reset' | 'email_change';
      codeHash: string;
      now: Date;
    },
    tx?: Tx,
  ): Promise<(Omit<VerificationToken, 'token'> & { tokenHash: string }) | undefined>;
  /**
   * 활성(미사용·미만료) 토큰의 6자리 코드 시도 상태 조회 — 가장 최근 발급분 1건.
   * emailCodeHash 는 meta.emailCode. 코드 무차별 대입 제한(F2)용. 없으면 undefined.
   */
  findActiveEmailCodeToken(
    params: {
      email: string;
      purpose: 'signup_email' | 'password_reset' | 'email_change';
      now: Date;
    },
    tx?: Tx,
  ): Promise<{ id: string; attempts: number; emailCodeHash: string | null } | undefined>;
  /** 코드 오입력 시 attempts +1 (race-tolerant, 전화 OTP와 동일 패턴). */
  bumpEmailCodeAttempts(id: string, tx?: Tx): Promise<void>;
}

// ── Attachment ────────────────────────────────────────────────────────
export interface AttachmentRepo {
  /** 첨부 row 저장 — 파일 본체는 다른 스토리지. */
  save(a: AttachmentRecord, tx?: Tx): Promise<void>;
  /** id 조회 — 서버 전용 record (storagePath 포함) 반환. */
  findById(id: string, tx?: Tx): Promise<AttachmentRecord | undefined>;
  /** RFP 소유 첨부 목록 — 공개 Attachment 필드만, uploadedAt 오름차순. */
  findByRfp(rfpId: string, tx?: Tx): Promise<Attachment[]>;
  /** 메시지 ID 배열로 첨부 목록 일괄 조회 — chatMessageId IN (ids), uploadedAt asc. */
  findByChatMessageIds(ids: string[], tx?: Tx): Promise<(Attachment & { chatMessageId: string })[]>;
  /** 대화 전체 첨부 목록 — chat_messages JOIN, uploadedAt asc. */
  findByConversationId(conversationId: string, tx?: Tx): Promise<Attachment[]>;
}

// ── Outbox ────────────────────────────────────────────────────────────
export interface OutboxRepo {
  /**
   * 메일 전송 큐 enqueue — dedupeKey UNIQUE 위배 시 null. `scheduledAt` 생략 시
   * 컬럼 기본값 now()(즉시 발송 대상). 지연 발송(예: chat digest 윈도우 종료
   * 시각)에는 미래 시각을 명시.
   */
  enqueue(
    params: {
      event: OutboxEvent;
      to: string;
      subject: string;
      html: string;
      dedupeKey?: string;
      maxAttempts?: number;
      scheduledAt?: Date;
    },
    tx?: Tx,
  ): Promise<OutboxEntry | null>;
  /**
   * 송신 대기 batch 조회. `chat.message` 행은 전용 chat-digest 처리기 소관이므로
   * 제외 — generic 메일러가 coalesce 전 raw 메시지 메일을 보내면 안 됨.
   */
  pending(limit: number, tx?: Tx): Promise<OutboxEntry[]>;
  /**
   * Due chat-digest 행: `status='pending' AND event='chat.message' AND
   * scheduled_at <= now()`, scheduled_at 오름차순. 전용 chat-digest 처리기
   * (cron + post-commit)가 본문 재계산·읽음 단락 후 markResult 한다. lease/
   * SKIP-LOCKED 없는 단순 read — 중복발송 가드는 처리기 책임.
   */
  dueChatDigests(limit: number, tx?: Tx): Promise<OutboxEntry[]>;
  /** Due team-chat-digest rows — owned by the team-digest flush processor. */
  dueTeamChatDigests(limit: number, tx?: Tx): Promise<OutboxEntry[]>;
  /** 전송 결과 반영(성공/실패 + 시도횟수 +1). */
  markResult(
    id: string,
    result: { ok: true } | { ok: false; error: string },
    tx?: Tx,
  ): Promise<void>;
  /**
   * Drain pending entries through `sender`.
   *
   * Postgres impl uses `SELECT ... FOR UPDATE SKIP LOCKED LIMIT $limit` so
   * concurrent flush callers (cron + post-commit fire-and-forget) don't
   * double-deliver. Returns counts: `ok` = sender returned ok, `failed` =
   * sender returned !ok (regardless of whether maxAttempts was hit on this
   * pass — `markResult` decides the persistent state).
   */
  flush(
    sender: Sender,
    limit?: number,
    tx?: Tx,
  ): Promise<{ ok: number; failed: number }>;
}

// ── Chat: Conversation ────────────────────────────────────────────────
/** Buyer↔PG conversation row (one per workspace pair). */
export type ChatConversation = {
  id: string;
  buyerWsId: string;
  pgWsId: string;
  lastMessageAt: Date | null;
  createdAt: Date;
};

export interface ChatConversationRepo {
  /**
   * Idempotent on the (buyer_ws_id, pg_ws_id) unique — returns the existing
   * conversation or creates one. The buyer↔PG type invariant is the caller's
   * responsibility (FK alone cannot express it).
   */
  findOrCreatePair(
    buyerWsId: string,
    pgWsId: string,
    tx?: Tx,
  ): Promise<ChatConversation>;
  /**
   * 페어 읽기 전용 조회 — 없으면 undefined, **행을 생성하지 않는다**.
   * 채팅 레일의 표시용 해소 경로: 열람·포커스 추종만으로 빈 대화가 생기면
   * 상대 인박스에 관심 신호가 새므로(sealed-bid), 생성은 첫 전송에만 맡긴다.
   */
  findPair(
    buyerWsId: string,
    pgWsId: string,
    tx?: Tx,
  ): Promise<ChatConversation | undefined>;
  /** id 단건 조회. 없으면 undefined. */
  findById(id: string, tx?: Tx): Promise<ChatConversation | undefined>;
  /**
   * 한 워크스페이스의 대화 목록 — viewer 의 side(buyer/pg)에 매칭되는 행만,
   * last_message_at desc (nulls last). 비공개 ACL: pg viewer 는 pg_ws_id=내WS
   * 만, buyer viewer 는 buyer_ws_id=내WS 만 본다.
   */
  listForWorkspace(
    wsId: string,
    viewerType: WorkspaceType,
    tx?: Tx,
  ): Promise<ChatConversation[]>;
  /** 인박스 정렬키 갱신 — 메시지 전송 시. */
  touchLastMessageAt(id: string, at: Date, tx?: Tx): Promise<void>;
}

// ── Chat: Message ─────────────────────────────────────────────────────
/** Canonical (Postgres-only) chat message row. */
export type ChatMessageRecord = {
  id: string;
  conversationId: string;
  authorUserId: string;
  authorWsId: string;
  body: string;
  rfpId: string | null;
  createdAt: Date;
};

export type ChatMessageWithAuthor = ChatMessageRecord & {
  authorName: string;
  authorEmail: string;
};

export interface ChatMessageRepo {
  /** 메시지 insert. 첨부 링크는 액션 레이어 책임. */
  save(msg: ChatMessageRecord, tx?: Tx): Promise<void>;
  /** 한 대화의 모든 메시지 — created_at asc. */
  listByConversation(
    conversationId: string,
    tx?: Tx,
  ): Promise<ChatMessageRecord[]>;
  /**
   * 한 대화의 모든 메시지 + 작성자 이름·이메일(users 조인) — created_at asc.
   * 스레드 로더 전용. 인박스 목록 로더는 가벼운 listByConversation 을 쓴다.
   */
  listByConversationWithAuthor(
    conversationId: string,
    tx?: Tx,
  ): Promise<ChatMessageWithAuthor[]>;
}

// ── RFP Team Chat: Message ────────────────────────────────────────────
/**
 * RFP-scoped internal team message. Scope = (rfpId, workspaceId) — buyer team
 * and each PG team have fully separate threads (sealed-bid invariant).
 */
export type RfpTeamMessageRecord = {
  id: string;
  rfpId: string;
  workspaceId: string;
  authorUserId: string;
  body: string;
  createdAt: Date;
};

/** Read shape — authorName hydrated from users, attachments from the
 *  exclusive-arc attachments table (empty array when none). */
export type RfpTeamMessageWithAuthor = RfpTeamMessageRecord & {
  authorName: string;
  attachments: Attachment[];
};

export type TeamThreadSummary = {
  rfpId: string;
  lastMessageAt: Date;
  lastBody: string;
  lastAuthorUserId: string;
};

export interface RfpTeamMessageRepo {
  /** 메시지 insert (append-only). */
  save(msg: RfpTeamMessageRecord, tx?: Tx): Promise<void>;
  /** 한 (rfp, workspace) 스코프의 모든 메시지 — created_at asc. */
  listByScope(
    rfpId: string,
    workspaceId: string,
    tx?: Tx,
  ): Promise<RfpTeamMessageWithAuthor[]>;
  /** 워크스페이스가 메시지를 남긴 모든 RFP 의 스레드 요약(rfp별 마지막 메시지). */
  listThreadsForWorkspace(workspaceId: string, tx?: Tx): Promise<TeamThreadSummary[]>;
}

// ── Chat: Message Template ────────────────────────────────────────────
/** Workspace-shared chat message template — hydrated DB shape. */
export type ChatMessageTemplate = {
  id: string;
  workspaceId: string;
  title: string;
  body: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface ChatTemplateRepo {
  /** 템플릿 생성 — id 미지정 시 발급. 워크스페이스 공유. */
  create(
    template: {
      id?: string;
      workspaceId: string;
      title: string;
      body: string;
      createdBy: string;
    },
    tx?: Tx,
  ): Promise<void>;
  /** id 단건 조회. 없으면 undefined. */
  findById(id: string, tx?: Tx): Promise<ChatMessageTemplate | undefined>;
  /** 한 워크스페이스의 모든 템플릿 — cross-workspace isolation 근거. */
  listByWorkspace(workspaceId: string, tx?: Tx): Promise<ChatMessageTemplate[]>;
  /** 단건 삭제. */
  remove(id: string, tx?: Tx): Promise<void>;
}

// ── Bid: Quote Template (견적 요율표) ──────────────────────────────────
/** PG-workspace-shared bid quote template — hydrated DB shape. */
export type BidQuoteTemplate = {
  id: string;
  pgWsId: string;
  name: string;
  settleCycle: string;
  settleLimit: number;
  guaranteeInsurance: number;
  paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface BidQuoteTemplateRepo {
  /** 템플릿 생성 — id 미지정 시 발급. PG 워크스페이스 공유. */
  create(
    template: {
      id?: string;
      pgWsId: string;
      name: string;
      settleCycle: string;
      settleLimit: number;
      guaranteeInsurance: number;
      paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
      createdBy: string;
    },
    tx?: Tx,
  ): Promise<void>;
  /** 단건 수정 — 소유권 검증은 액션 레이어 책임. updated_at 갱신. */
  update(
    id: string,
    fields: {
      name: string;
      settleCycle: string;
      settleLimit: number;
      guaranteeInsurance: number;
      paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
    },
    tx?: Tx,
  ): Promise<void>;
  /** id 단건 조회. 없으면 undefined. */
  findById(id: string, tx?: Tx): Promise<BidQuoteTemplate | undefined>;
  /** 한 PG 워크스페이스의 모든 템플릿 — cross-workspace isolation 근거. */
  listByWorkspace(pgWsId: string, tx?: Tx): Promise<BidQuoteTemplate[]>;
  /** 단건 삭제. */
  remove(id: string, tx?: Tx): Promise<void>;
}

// ── Chat: Conversation Read State ─────────────────────────────────────
/** 유저별 대화 읽음 상태 row. 미읽음 배지 + 라이브 읽음 영수증 근거. */
export type ChatConversationRead = {
  conversationId: string;
  userId: string;
  lastReadAt: Date;
};

export interface ChatReadRepo {
  /** (conversation, user) PK upsert — last_read_at 갱신(idempotent, monotonic). */
  upsert(conversationId: string, userId: string, at: Date, tx?: Tx): Promise<void>;
  /** (conversation, user) 읽음 row 조회. 없으면 undefined. */
  getFor(
    conversationId: string,
    userId: string,
    tx?: Tx,
  ): Promise<ChatConversationRead | undefined>;
  /**
   * 상대(=viewer 가 아닌 유저) 중 가장 최근 last_read_at — 라이브 읽음 영수증
   * 근거. 상대 읽음 기록이 없으면 undefined.
   */
  lastReadByCounterparty(
    conversationId: string,
    viewerUserId: string,
    tx?: Tx,
  ): Promise<Date | undefined>;
}

// ── RFP Team Message Read State ───────────────────────────────────────
/** (rfp, workspace, user) 팀 스레드 읽음 row — 통합 인박스 팀 안읽음 배지 근거. */
export type RfpTeamMessageRead = {
  rfpId: string;
  workspaceId: string;
  userId: string;
  lastReadAt: Date;
};

export interface RfpTeamMessageReadRepo {
  /** (rfp, workspace, user) PK upsert — last_read_at 갱신(idempotent, monotonic). */
  upsert(rfpId: string, workspaceId: string, userId: string, at: Date, tx?: Tx): Promise<void>;
  /** (rfp, workspace, user) 읽음 row 조회. 없으면 undefined. */
  getFor(rfpId: string, workspaceId: string, userId: string, tx?: Tx): Promise<RfpTeamMessageRead | undefined>;
}

// ── Audit Log (C5) ────────────────────────────────────────────────────
/** 신규 감사 행 — createdAt/id 는 DB 가 채운다. */
export type NewAuditLog = {
  actorUserId: string;
  /** 워크스페이스 무관 이벤트(auth.*)는 null. */
  actorWorkspaceId?: string | null;
  /** '<도메인>.<행위>' — rfp.award, bid.submit, workspace.member_invite … */
  action: string;
  entityType?: string | null;
  /** uuid 또는 RFP code(P-2605-0042) — text 로 수용. */
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** (createdAt, id) 복합 커서 — 동일 타임스탬프에서도 누락 없는 페이지네이션. */
export type AuditLogCursor = { createdAt: string; id: string };

/** 조회 행 — actorName 은 users join 으로 hydrate (탈퇴 사용자는 null 허용). */
export type AuditLogRecord = {
  id: string;
  actorUserId: string;
  actorWorkspaceId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  /** ISO string. */
  createdAt: string;
  actorName: string | null;
  /**
   * True when the actor is currently a master/operator (email on the
   * MASTER_ACCOUNT_EMAILS allowlist). Derived at read time so master actions in
   * any workspace are identifiable; reflects the current allowlist, not the
   * write-time state. The actor's email itself is never exposed to the client.
   */
  viaMaster: boolean;
};

export interface AuditLogRepo {
  /** 감사 행 기록 — 호출자는 해당 작업의 트랜잭션(tx)을 넘긴다. */
  insert(entry: NewAuditLog, tx?: Tx): Promise<void>;
  /** 워크스페이스 스코프 최신순 목록 — 설정 > 활동 기록 화면용. */
  listForWorkspace(
    workspaceId: string,
    opts: { limit: number; before?: AuditLogCursor },
  ): Promise<AuditLogRecord[]>;
}
