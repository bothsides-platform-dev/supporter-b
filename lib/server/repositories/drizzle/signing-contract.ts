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

/**
 * 딜 하나가 보관하는 노출 대장의 상한. 노출 기록은 누적이라 상한이 없으면 행이 계속
 * 자란다 — 원래 대체 저장을 골랐던 이유가 그것이다. 넘치면 가장 오래된 것부터 밀린다.
 */
const RECOVERY_DISCLOSURE_CAP = 200;

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

  /**
   * 복구 스캔이 이 딜에 노출한 공급자 계약 id 를 기록한다(**누적** — 지우지 않는다).
   *
   * 스캔이 후보를 브라우저로 내보내는 순간 그 id 는 PG 가 아는 값이 된다. 그 사실을
   * 남겨야 바인딩 게이트가 클라이언트 입력이 아니라 서버 상태로 판정할 수 있다.
   *
   * 대체 저장이면 안 되는 이유: 노출은 비가역인데 후보 목록은 쉽게 줄어든다(데드라인
   * 중단·상세 조회 실패·그 사이 타 딜 바인딩). 줄어든 재스캔이 이전 기록을 덮으면
   * 이미 브라우저로 나간 id 가 "노출된 적 없음"으로 되돌아가고, 그 순간
   * `attachProviderContract` 의 상관키 검사가 그 id 에 대해 통째로 꺼진다.
   *
   * 무한 성장은 상한으로 막는다(원래 대체 저장을 고른 이유가 그것이었다). 새 것을
   * 앞에 두고 자르므로 밀려나는 건 가장 오래된 노출이다. 스캔 한 번의 후보 상한이
   * 12(RECOVERY_MAX_DETAIL_LOOKUPS)라, 한 딜에서 서로 다른 고아가 200개 쌓이려면
   * 실제 발송이 그만큼 있어야 한다.
   */
  async recordRecoveryDisclosure(id: string, refs: string[], tx?: Tx): Promise<void> {
    // 드리즐은 JS 배열을 그대로 끼우면 행 튜플(`($1, $2)`)로 펼친다 — text[] 로 캐스팅되지
    // 않으므로 배열 리터럴을 직접 만든다.
    const incoming = refs.length
      ? sql`ARRAY[${sql.join(
          refs.map((r) => sql`${r}`),
          sql`, `,
        )}]::text[]`
      : sql`'{}'::text[]`;
    await this.h(tx)
      .update(signingContracts)
      .set({
        recoveryRefs: sql`(
          SELECT COALESCE(array_agg(r ORDER BY ord), '{}')::text[]
          FROM (
            SELECT r, MIN(ord) AS ord
              FROM unnest(${incoming} || ${signingContracts.recoveryRefs})
                   WITH ORDINALITY AS t(r, ord)
             GROUP BY r
             ORDER BY ord
             LIMIT ${RECOVERY_DISCLOSURE_CAP}
          ) s
        )`,
      })
      .where(eq(signingContracts.id, id));
  }

  /**
   * 이 공급자 계약 id 가 **어느 딜에서든** 스캔으로 노출된 적이 있는가.
   *
   * 딜을 가리지 않는 것이 요점이다 — 막으려는 것이 "딜 A 에서 배운 id 를 딜 B 에
   * 붙이는" 경로이므로, 딜 B 에서 물어도 참이어야 한다. 배열 겹침(&&) 한 번이면 된다.
   */
  async isRefDisclosed(ref: string, tx?: Tx): Promise<boolean> {
    const [row] = await this.h(tx)
      .select({ id: signingContracts.id })
      .from(signingContracts)
      .where(sql`${signingContracts.recoveryRefs} && ARRAY[${ref}]::text[]`)
      .limit(1);
    return row !== undefined;
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
    patch: {
      providerRef: string;
      snowsignTemplateId?: string;
      sentAt: string;
      // 복구 바인딩은 provider 가 이미 in_progress(한쪽 서명 완료)일 수 있다 —
      // sent 로 강등하면 이미 서명한 사람에게 "서명을 진행해 주세요" 알림이 간다.
      status?: 'sent' | 'in_progress';
    },
    tx?: Tx,
    opts?: { claimedAt?: Date },
  ): Promise<boolean> {
    const rows = (await this.h(tx)
      .update(signingContracts)
      .set({
        providerRef: patch.providerRef,
        // 건별 임베드 발송에는 템플릿이 없다 — 지정된 경우에만 기록한다.
        ...(patch.snowsignTemplateId ? { snowsignTemplateId: patch.snowsignTemplateId } : {}),
        sentAt: new Date(patch.sentAt),
        status: patch.status ?? 'sent',
      })
      .where(
        and(
          eq(signingContracts.id, id),
          eq(signingContracts.status, 'awaiting_pg_template'),
          // 리스 소유 CAS(선택) — 템플릿 발송처럼 리스를 쥔 채 SnowSign 왕복을 도는
          // 경로가 자기 토큰을 걸면, 왕복 중 forceClaimForSend 에 밀린 발송이 여기서
          // 진다(상태만 보면 뺏긴 뒤에도 커밋해 계약이 두 건 살아난다). renewSendClaim
          // 과 같은 정확일치 규약.
          ...(opts?.claimedAt ? [eq(signingContracts.claimedForSendAt, opts.claimedAt)] : []),
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
