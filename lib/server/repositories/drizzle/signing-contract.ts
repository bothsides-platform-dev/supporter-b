import { and, asc, desc, eq, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { signingContracts, signingParticipants } from '@/lib/db/schema';
import type {
  SigningContract,
  SigningContractPatch,
  SigningContractStatus,
  SigningParticipant,
  SigningParticipantPatch,
} from '@/lib/types/signing';
import type { SigningContractRepo, Tx } from '../types';

type Db = Tx;

type CRow = typeof signingContracts.$inferSelect;
type PRow = typeof signingParticipants.$inferSelect;

const ACTIVE_STATUSES: SigningContractStatus[] = ['awaiting_pg_template', 'sent', 'in_progress'];
const POLLABLE_STATUSES: SigningContractStatus[] = ['sent', 'in_progress'];

function rowToContract(r: CRow): SigningContract {
  return {
    id: r.id,
    rfpId: r.rfpId,
    providerRef: r.providerRef ?? undefined,
    snowsignTemplateId: r.snowsignTemplateId ?? undefined,
    status: r.status,
    round: r.round,
    deadlineDays: r.deadlineDays ?? undefined,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : undefined,
    lastPolledAt: r.lastPolledAt ? r.lastPolledAt.toISOString() : undefined,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sentAt ? r.sentAt.toISOString() : undefined,
    completedAt: r.completedAt ? r.completedAt.toISOString() : undefined,
    canceledAt: r.canceledAt ? r.canceledAt.toISOString() : undefined,
    cancelReason: r.cancelReason ?? undefined,
  };
}

function rowToParticipant(r: PRow): SigningParticipant {
  return {
    id: r.id,
    contractId: r.contractId,
    userId: r.userId ?? undefined,
    name: r.name,
    email: r.email,
    phone: r.phone ?? undefined,
    role: r.role,
    securityMethod: r.securityMethod,
    status: r.status,
    signedAt: r.signedAt ? r.signedAt.toISOString() : undefined,
    providerParticipantRef: r.providerParticipantRef ?? undefined,
  };
}

function contractToRow(c: SigningContract) {
  return {
    id: c.id,
    rfpId: c.rfpId,
    providerRef: c.providerRef ?? null,
    snowsignTemplateId: c.snowsignTemplateId ?? null,
    status: c.status,
    round: c.round,
    deadlineDays: c.deadlineDays ?? null,
    expiresAt: c.expiresAt ? new Date(c.expiresAt) : null,
    lastPolledAt: c.lastPolledAt ? new Date(c.lastPolledAt) : null,
    createdBy: c.createdBy,
    createdAt: new Date(c.createdAt),
    sentAt: c.sentAt ? new Date(c.sentAt) : null,
    completedAt: c.completedAt ? new Date(c.completedAt) : null,
    canceledAt: c.canceledAt ? new Date(c.canceledAt) : null,
    cancelReason: c.cancelReason ?? null,
  };
}

function participantToRow(p: SigningParticipant) {
  return {
    id: p.id,
    contractId: p.contractId,
    userId: p.userId ?? null,
    name: p.name,
    email: p.email,
    phone: p.phone ?? null,
    role: p.role,
    securityMethod: p.securityMethod,
    status: p.status,
    signedAt: p.signedAt ? new Date(p.signedAt) : null,
    providerParticipantRef: p.providerParticipantRef ?? null,
  };
}

export class DrizzleSigningContractRepository implements SigningContractRepo {
  constructor(private readonly db: Db) {}
  private h(tx?: Tx): Db {
    return tx ?? this.db;
  }

  async create(
    contract: SigningContract,
    participants: SigningParticipant[],
    tx?: Tx,
  ): Promise<void> {
    const h = this.h(tx);
    await h.insert(signingContracts).values(contractToRow(contract));
    if (participants.length > 0) {
      await h.insert(signingParticipants).values(participants.map(participantToRow));
    }
  }

  async findById(
    id: string,
    tx?: Tx,
  ): Promise<{ contract: SigningContract; participants: SigningParticipant[] } | undefined> {
    const h = this.h(tx);
    const [row] = (await h
      .select()
      .from(signingContracts)
      .where(eq(signingContracts.id, id))
      .limit(1)) as CRow[];
    if (!row) return undefined;
    const pRows = (await h
      .select()
      .from(signingParticipants)
      .where(eq(signingParticipants.contractId, id))
      .orderBy(asc(signingParticipants.role))) as PRow[];
    return { contract: rowToContract(row), participants: pRows.map(rowToParticipant) };
  }

  async findActiveByRfp(rfpId: string, tx?: Tx): Promise<SigningContract | undefined> {
    const [row] = (await this.h(tx)
      .select()
      .from(signingContracts)
      .where(and(eq(signingContracts.rfpId, rfpId), inArray(signingContracts.status, ACTIVE_STATUSES)))
      .limit(1)) as CRow[];
    return row ? rowToContract(row) : undefined;
  }

  async findByProviderRef(providerRef: string, tx?: Tx): Promise<SigningContract | undefined> {
    const [row] = (await this.h(tx)
      .select()
      .from(signingContracts)
      .where(eq(signingContracts.providerRef, providerRef))
      .limit(1)) as CRow[];
    return row ? rowToContract(row) : undefined;
  }

  async findByRfp(rfpId: string, tx?: Tx): Promise<SigningContract[]> {
    const rows = (await this.h(tx)
      .select()
      .from(signingContracts)
      .where(eq(signingContracts.rfpId, rfpId))
      .orderBy(desc(signingContracts.createdAt))) as CRow[];
    return rows.map(rowToContract);
  }

  async findPollable(limit: number, tx?: Tx): Promise<SigningContract[]> {
    const rows = (await this.h(tx)
      .select()
      .from(signingContracts)
      .where(inArray(signingContracts.status, POLLABLE_STATUSES))
      .orderBy(sql`${signingContracts.lastPolledAt} asc nulls first`)
      .limit(limit)) as CRow[];
    return rows.map(rowToContract);
  }

  async patchContract(id: string, patch: SigningContractPatch, tx?: Tx): Promise<void> {
    const set: Record<string, unknown> = {};
    if (patch.providerRef !== undefined) set.providerRef = patch.providerRef;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.deadlineDays !== undefined) set.deadlineDays = patch.deadlineDays;
    if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
    if (patch.lastPolledAt !== undefined)
      set.lastPolledAt = patch.lastPolledAt ? new Date(patch.lastPolledAt) : null;
    if (patch.sentAt !== undefined) set.sentAt = patch.sentAt ? new Date(patch.sentAt) : null;
    if (patch.completedAt !== undefined)
      set.completedAt = patch.completedAt ? new Date(patch.completedAt) : null;
    if (patch.canceledAt !== undefined)
      set.canceledAt = patch.canceledAt ? new Date(patch.canceledAt) : null;
    if (patch.cancelReason !== undefined) set.cancelReason = patch.cancelReason;
    if (Object.keys(set).length === 0) return;
    await this.h(tx).update(signingContracts).set(set).where(eq(signingContracts.id, id));
  }

  async patchParticipant(id: string, patch: SigningParticipantPatch, tx?: Tx): Promise<void> {
    const set: Record<string, unknown> = {};
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.signedAt !== undefined) set.signedAt = patch.signedAt ? new Date(patch.signedAt) : null;
    if (patch.providerParticipantRef !== undefined)
      set.providerParticipantRef = patch.providerParticipantRef;
    if (patch.phone !== undefined) set.phone = patch.phone ?? null;
    if (patch.securityMethod !== undefined) set.securityMethod = patch.securityMethod;
    if (Object.keys(set).length === 0) return;
    await this.h(tx).update(signingParticipants).set(set).where(eq(signingParticipants.id, id));
  }

  async finalizeIfNotFinal(id: string, at: Date, tx?: Tx): Promise<boolean> {
    const rows = (await this.h(tx)
      .update(signingContracts)
      .set({ status: 'completed', completedAt: at })
      .where(
        and(
          eq(signingContracts.id, id),
          notInArray(signingContracts.status, ['completed', 'canceled', 'declined', 'expired']),
        ),
      )
      .returning({ id: signingContracts.id })) as Array<{ id: string }>;
    return rows.length > 0;
  }

  async transitionIfActive(
    id: string,
    toStatus: 'canceled' | 'declined' | 'expired',
    at: Date,
    opts?: { cancelReason?: string },
    tx?: Tx,
  ): Promise<boolean> {
    const set: Record<string, unknown> = { status: toStatus };
    if (toStatus === 'canceled') {
      set.canceledAt = at;
      if (opts?.cancelReason !== undefined) set.cancelReason = opts.cancelReason;
    }
    const rows = (await this.h(tx)
      .update(signingContracts)
      .set(set)
      .where(and(eq(signingContracts.id, id), inArray(signingContracts.status, ACTIVE_STATUSES)))
      .returning({ id: signingContracts.id })) as Array<{ id: string }>;
    return rows.length > 0;
  }

  async claimForSend(
    id: string,
    at: Date,
    leaseBefore: Date,
    holderUserId: string,
    tx?: Tx,
  ): Promise<boolean> {
    const rows = (await this.h(tx)
      .update(signingContracts)
      .set({ claimedForSendAt: at, claimedForSendBy: holderUserId })
      .where(
        and(
          eq(signingContracts.id, id),
          eq(signingContracts.status, 'awaiting_pg_template'),
          or(
            isNull(signingContracts.claimedForSendAt),
            lt(signingContracts.claimedForSendAt, leaseBefore),
          ),
        ),
      )
      .returning({ id: signingContracts.id })) as Array<{ id: string }>;
    return rows.length > 0;
  }

  async markSentIfAwaiting(
    id: string,
    patch: { providerRef: string; snowsignTemplateId?: string; sentAt: string },
    tx?: Tx,
  ): Promise<boolean> {
    const rows = (await this.h(tx)
      .update(signingContracts)
      .set({
        providerRef: patch.providerRef,
        // 건별 임베드 발송에는 템플릿이 없다 — 지정된 경우에만 기록한다.
        ...(patch.snowsignTemplateId ? { snowsignTemplateId: patch.snowsignTemplateId } : {}),
        sentAt: new Date(patch.sentAt),
        status: 'sent',
      })
      .where(
        and(
          eq(signingContracts.id, id),
          eq(signingContracts.status, 'awaiting_pg_template'),
        ),
      )
      .returning({ id: signingContracts.id })) as Array<{ id: string }>;
    return rows.length > 0;
  }

  async renewSendClaim(
    id: string,
    currentClaimedAt: Date,
    newClaimedAt: Date,
    tx?: Tx,
  ): Promise<boolean> {
    // 하트비트 — 내 토큰이 아직 그대로일 때만 연장한다. 리스가 만료돼 다른 발송자가
    // 재취득했으면 실패해야 하고(false), 그러면 호출부가 자기 세션을 멈춘다.
    // 상태 조건도 함께 본다: 이미 발송됐으면 리스를 살려 둘 이유가 없다.
    const rows = (await this.h(tx)
      .update(signingContracts)
      .set({ claimedForSendAt: newClaimedAt })
      .where(
        and(
          eq(signingContracts.id, id),
          eq(signingContracts.status, 'awaiting_pg_template'),
          eq(signingContracts.claimedForSendAt, currentClaimedAt),
        ),
      )
      .returning({ id: signingContracts.id })) as Array<{ id: string }>;
    return rows.length > 0;
  }

  async releaseSendClaim(id: string, claimedAt: Date, tx?: Tx): Promise<void> {
    // 소유 확인 필수 — 무조건 지우면, 리스가 만료돼 다른 발송자가 정당히 재취득한 뒤
    // 뒤늦게 실패한 옛 발송자가 남의 살아있는 클레임을 풀어 이중 발송을 열어준다.
    await this.h(tx)
      .update(signingContracts)
      // 소유자도 함께 지운다 — 남겨두면 이후 조회가 '이미 놓은 사람'을 지목한다.
      .set({ claimedForSendAt: null, claimedForSendBy: null })
      .where(
        and(eq(signingContracts.id, id), eq(signingContracts.claimedForSendAt, claimedAt)),
      );
  }

  async findSendLease(
    id: string,
    tx?: Tx,
  ): Promise<{ claimedAt: Date; holderUserId: string | null } | undefined> {
    const [row] = (await this.h(tx)
      .select({
        claimedAt: signingContracts.claimedForSendAt,
        holder: signingContracts.claimedForSendBy,
      })
      .from(signingContracts)
      .where(eq(signingContracts.id, id))
      .limit(1)) as Array<{ claimedAt: Date | null; holder: string | null }>;
    if (!row?.claimedAt) return undefined;
    return { claimedAt: row.claimedAt, holderUserId: row.holder };
  }

  /**
   * 강제 이어받기 — 리스가 살아 있어도 가져온다.
   *
   * `claimForSend` 와 딱 하나 다르다: **만료 조건(`leaseBefore`)이 없다.** 그게 이
   * 메서드의 전부다(누가 버그로 오해하고 되돌리지 않도록 적어 둔다). 상태 조건은
   * 그대로 남는다 — 강제는 *경합*에 대한 것이지 *상태*에 대한 게 아니라서, 이미
   * 발송된 계약은 여전히 못 가져온다.
   *
   * 밀려난 사람을 알려면 옛 값이 필요한데 `UPDATE … RETURNING` 은 새 값을 준다.
   * 그래서 읽고 → **읽은 값에 CAS** 한다: 그 사이 누가 바꿨으면 쓰기가 안 걸리므로
   * 동시 이어받기 둘 중 하나만 이기고, 보고되는 이름은 쓰기 시점에 실제로 쥐고
   * 있던 사람이다(알림이 엉뚱한 사람을 지목할 수 없다).
   */
  async forceClaimForSend(
    id: string,
    at: Date,
    holderUserId: string,
    tx?: Tx,
  ): Promise<{ taken: false } | { taken: true; displacedUserId: string | null }> {
    const h = this.h(tx);
    const [prev] = (await h
      .select({
        claimedAt: signingContracts.claimedForSendAt,
        holder: signingContracts.claimedForSendBy,
      })
      .from(signingContracts)
      .where(eq(signingContracts.id, id))
      .limit(1)) as Array<{ claimedAt: Date | null; holder: string | null }>;
    if (!prev) return { taken: false };

    const rows = (await h
      .update(signingContracts)
      .set({ claimedForSendAt: at, claimedForSendBy: holderUserId })
      .where(
        and(
          eq(signingContracts.id, id),
          eq(signingContracts.status, 'awaiting_pg_template'),
          // 읽은 값과 정확히 같을 때만 쓴다. `eq` 는 NULL 에 참이 되지 않으므로
          // 빈 리스는 isNull 로 따로 표현한다(IS NOT DISTINCT FROM 의 빌더 표현).
          prev.claimedAt === null
            ? isNull(signingContracts.claimedForSendAt)
            : eq(signingContracts.claimedForSendAt, prev.claimedAt),
        ),
      )
      .returning({ id: signingContracts.id })) as Array<{ id: string }>;
    if (rows.length === 0) return { taken: false };
    return { taken: true, displacedUserId: prev.holder };
  }

  async findStaleAwaiting(nudgeBefore: Date, limit: number, tx?: Tx): Promise<SigningContract[]> {
    const rows = (await this.h(tx)
      .select()
      .from(signingContracts)
      .where(
        and(
          eq(signingContracts.status, 'awaiting_pg_template'),
          lt(signingContracts.createdAt, nudgeBefore),
          or(
            isNull(signingContracts.lastPolledAt),
            lt(signingContracts.lastPolledAt, nudgeBefore),
          ),
        ),
      )
      .orderBy(asc(signingContracts.createdAt))
      .limit(limit)) as CRow[];
    return rows.map(rowToContract);
  }

  async insertParticipants(participants: SigningParticipant[], tx?: Tx): Promise<void> {
    if (participants.length === 0) return;
    await this.h(tx).insert(signingParticipants).values(participants.map(participantToRow));
  }
}
