// Repository interfaces — backend-agnostic contracts.
// Drizzle implementations live in ./drizzle/*.
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { DB } from '@/lib/db/client';
import type { PgliteDB } from '@/lib/db/client-pglite';

import type { RFP, RfpStatus } from '@/lib/types/rfp';
import type { RfpInvitation } from '@/lib/types/invitation';
import type { Workspace, WorkspaceMembershipSummary } from '@/lib/types/workspace';
import type { User } from '@/lib/types/user';
import type { BizProfile } from '@/lib/types/biz-profile';
import type { Bid } from '@/lib/types/bid';
import type { BoardColumn, ColumnKind } from '@/lib/types/column';
import type { Attachment } from '@/lib/types/common';
import type { Contract } from '@/lib/types/contract';
import type { Notification, NotificationChannel } from '@/lib/types/notification';
import type { AttachmentRecord } from './attachment-record';
import type { VerificationToken } from '@/lib/types/auth';
import type { OutboxEntry, OutboxEvent, Sender } from '../outbox/types';

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
  /** raw share token → RFP. 공유 링크 클레임 시 사용. 없으면 undefined. */
  findByShareToken(token: string, tx?: Tx): Promise<RFP | undefined>;
  /** 상태 전이 + 패치. DB 레이어에서 `WHERE status=$prev` 동시성 가드. */
  transition(id: string, to: RfpStatus, patch?: Partial<RFP>, tx?: Tx): Promise<RFP>;
  /** 통일 칸반: pipeline 보드 커스텀 컬럼 배치. null = 자동분류 복귀. */
  setBoardColumn(rfpId: string, columnId: string | null, tx?: Tx): Promise<void>;
}

// ── Invitation ────────────────────────────────────────────────────────
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
  /** PG 워크스페이스에 발송된 활성 초대 + RFP pair — 인박스/칸반 공통 fetcher. */
  findByPgWorkspace(
    pgWsId: string,
    tx?: Tx,
  ): Promise<{ invitation: RfpInvitation; rfp: RFP }[]>;
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

// ── Workspace ─────────────────────────────────────────────────────────
export interface WorkspaceRepo {
  /** 워크스페이스 + 멤버 동기화. */
  save(ws: Workspace, tx?: Tx): Promise<void>;
  /** id 조회 — 멤버/bizProfile hydration 포함. */
  findById(id: string, tx?: Tx): Promise<Workspace | undefined>;
  /** raw share token → 워크스페이스. 공용 초대 링크 클레임 시 사용. 없으면 undefined. */
  findByShareToken(token: string, tx?: Tx): Promise<Workspace | undefined>;
  /** 유저가 속한 모든 워크스페이스 — 스위처용 경량 projection (hydration 없음). */
  listForUser(
    userId: string,
    tx?: Tx,
  ): Promise<WorkspaceMembershipSummary[]>;
  /** 유저가 해당 워크스페이스의 멤버인지 여부 (boolean). 권한 게이트 단일 소스. */
  isMember(userId: string, workspaceId: string, tx?: Tx): Promise<boolean>;
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
  /** 입찰 저장 — `(rfpId, pgWsId)` UNIQUE 위배 시 throw. */
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
  /** 단건 삭제 — 첨부는 별도 정리 책임(액션 레이어). */
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
}

// ── Attachment ────────────────────────────────────────────────────────
export interface AttachmentRepo {
  /** 첨부 row 저장 — 파일 본체는 다른 스토리지. */
  save(a: AttachmentRecord, tx?: Tx): Promise<void>;
  /** id 조회 — 서버 전용 record (storagePath 포함) 반환. */
  findById(id: string, tx?: Tx): Promise<AttachmentRecord | undefined>;
  /** RFP 소유 첨부 목록 — 공개 Attachment 필드만, uploadedAt 오름차순. */
  findByRfp(rfpId: string, tx?: Tx): Promise<Attachment[]>;
}

// ── Outbox ────────────────────────────────────────────────────────────
export interface OutboxRepo {
  /** 메일 전송 큐 enqueue — dedupeKey UNIQUE 위배 시 null. */
  enqueue(
    params: {
      event: OutboxEvent;
      to: string;
      subject: string;
      html: string;
      dedupeKey?: string;
      maxAttempts?: number;
    },
    tx?: Tx,
  ): Promise<OutboxEntry | null>;
  /** 송신 대기 batch 조회. */
  pending(limit: number, tx?: Tx): Promise<OutboxEntry[]>;
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
