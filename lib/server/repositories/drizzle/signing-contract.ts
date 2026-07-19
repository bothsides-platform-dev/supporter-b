import { and, asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { signingContracts, signingParticipants } from '@/lib/db/schema';
import type {
  SigningContract,
  SigningContractPatch,
  SigningContractStatus,
  SigningParticipant,
  SigningParticipantPatch,
} from '@/lib/types/signing';
import type { SigningContractRepo, Tx } from '../types';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

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
    if (patch.snowsignTemplateId !== undefined) set.snowsignTemplateId = patch.snowsignTemplateId;
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

  async findAwaiting(tx?: Tx): Promise<SigningContract[]> {
    const rows = (await this.h(tx)
      .select()
      .from(signingContracts)
      .where(eq(signingContracts.status, 'awaiting_pg_template'))
      .orderBy(asc(signingContracts.createdAt))) as CRow[];
    return rows.map(rowToContract);
  }

  async insertParticipants(participants: SigningParticipant[], tx?: Tx): Promise<void> {
    if (participants.length === 0) return;
    await this.h(tx).insert(signingParticipants).values(participants.map(participantToRow));
  }
}
