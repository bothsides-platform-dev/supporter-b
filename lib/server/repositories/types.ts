// Repository interfaces for Step 4 — backend-agnostic contracts.
// Drizzle implementations live in ./drizzle/*. In-memory implementations
// live in ./in-memory/* and are used as test doubles.
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { DB } from '@/lib/db/client';
import type { PgliteDB } from '@/lib/db/client-pglite';

import type { RFP, RfpStatus } from '@/lib/types/rfp';
import type { RfpInvitation } from '@/lib/types/invitation';
import type { Workspace } from '@/lib/types/workspace';
import type { User } from '@/lib/types/user';
import type { BizProfile } from '@/lib/types/biz-profile';
import type { Bid } from '@/lib/types/bid';
import type { Contract } from '@/lib/types/contract';
import type { Notification, NotificationChannel } from '@/lib/types/notification';
import type { Attachment } from '@/lib/types/common';
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
  /** id 단건 조회. 없으면 undefined. */
  findById(id: string, tx?: Tx): Promise<RFP | undefined>;
  /** 한 구매사 워크스페이스의 모든 RFP. */
  findByBuyerWs(wsId: string, tx?: Tx): Promise<RFP[]>;
  /** raw share token → RFP. 공유 링크 클레임 시 사용. 없으면 undefined. */
  findByShareToken(token: string, tx?: Tx): Promise<RFP | undefined>;
  /** 상태 전이 + 패치. DB 레이어에서 `WHERE status=$prev` 동시성 가드. */
  transition(id: string, to: RfpStatus, patch?: Partial<RFP>, tx?: Tx): Promise<RFP>;
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
   * inbox 상세 RSC 진입 시 호출 — PG 칸반의 '검토중' 컬럼을 활성화하기 위한 시그널.
   */
  markOpened(invitationId: string, openedAt: Date, tx?: Tx): Promise<void>;
}

// ── Workspace ─────────────────────────────────────────────────────────
export interface WorkspaceRepo {
  /** 워크스페이스 + 멤버 동기화. */
  save(ws: Workspace, tx?: Tx): Promise<void>;
  /** id 조회 — 멤버/bizProfile hydration 포함. */
  findById(id: string, tx?: Tx): Promise<Workspace | undefined>;
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
  /** 한 PG 워크스페이스의 모든 입찰. */
  findByPgWs(pgWsId: string, tx?: Tx): Promise<Bid[]>;
}

// ── Notification ──────────────────────────────────────────────────────
export interface NotificationRepo {
  /** 인앱/이메일 알림 저장. */
  save(n: Notification, tx?: Tx): Promise<void>;
  /** 사용자 최근 알림(생성 역순) — limit 제한. `channel` 지정 시 SQL에서 필터. */
  findRecentForUser(
    userId: string,
    limit: number,
    channel?: NotificationChannel,
    tx?: Tx,
  ): Promise<Notification[]>;
  /** 단건 읽음 처리. */
  markRead(id: string, tx?: Tx): Promise<void>;
  /** 사용자 전부 읽음 처리. */
  markAllRead(userId: string, tx?: Tx): Promise<void>;
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
}

// ── Attachment ────────────────────────────────────────────────────────
export interface AttachmentRepo {
  /** 첨부 row 저장 — 파일 본체는 다른 스토리지. */
  save(
    a: Attachment & {
      ownerKind: 'rfp' | 'bid_proposal';
      ownerId: string;
      storagePath: string;
      uploadedBy: string;
    },
    tx?: Tx,
  ): Promise<void>;
  /** id 조회. */
  findById(
    id: string,
    tx?: Tx,
  ): Promise<
    | (Attachment & {
        ownerKind: 'rfp' | 'bid_proposal';
        ownerId: string;
        storagePath: string;
        uploadedBy: string;
      })
    | undefined
  >;
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
