import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import {
  contractDocs,
  contractDocSigners,
  contractDocEvents,
  workspaces,
} from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type {
  ContractDoc,
  ContractDocEvent,
  ContractDocEventType,
  ContractDocSigner,
  ContractParty,
  ContractSignatureMethod,
} from '@/lib/types/contract-doc';
import type { ContractDocListItem, ContractDocRepo, NewContractDocInput, Tx } from '../types';

type DocRow = typeof contractDocs.$inferSelect;
type EventRow = typeof contractDocEvents.$inferSelect;

// Explicit projection excluding signature_image (bytea) — the domain
// ContractDocSigner type deliberately never carries the binary blob (see
// lib/types/contract-doc.ts). getSignerImage() is the only path to the bytes.
const SIGNER_COLUMNS = {
  id: contractDocSigners.id,
  docId: contractDocSigners.docId,
  party: contractDocSigners.party,
  userId: contractDocSigners.userId,
  name: contractDocSigners.name,
  email: contractDocSigners.email,
  consentAt: contractDocSigners.consentAt,
  consentTextVersion: contractDocSigners.consentTextVersion,
  signedAt: contractDocSigners.signedAt,
  signatureMethod: contractDocSigners.signatureMethod,
  signIp: contractDocSigners.signIp,
  signUserAgent: contractDocSigners.signUserAgent,
  reassignedBy: contractDocSigners.reassignedBy,
  reassignedAt: contractDocSigners.reassignedAt,
  createdAt: contractDocSigners.createdAt,
  updatedAt: contractDocSigners.updatedAt,
};
type SignerProjection = {
  id: string;
  docId: string;
  party: string;
  userId: string;
  name: string;
  email: string;
  consentAt: Date | null;
  consentTextVersion: string | null;
  signedAt: Date | null;
  signatureMethod: string | null;
  signIp: string | null;
  signUserAgent: string | null;
  reassignedBy: string | null;
  reassignedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function rowToDoc(row: DocRow): ContractDoc {
  return {
    id: row.id,
    code: row.code,
    rfpId: row.rfpId,
    bidId: row.bidId,
    buyerWsId: row.buyerWsId,
    pgWsId: row.pgWsId,
    templateId: row.templateId ?? null,
    status: row.status as ContractDoc['status'],
    title: row.title,
    parties: row.parties as ContractDoc['parties'],
    termsSnapshot: row.termsSnapshot as ContractDoc['termsSnapshot'],
    basePdfKey: row.basePdfKey,
    basePdfSha256: row.basePdfSha256,
    basePdfSize: row.basePdfSize,
    finalPdfKey: row.finalPdfKey ?? null,
    finalPdfSha256: row.finalPdfSha256 ?? null,
    finalPdfSize: row.finalPdfSize ?? null,
    declineReason: row.declineReason ?? null,
    createdBy: row.createdBy,
    sentAt: new Date(row.sentAt).toISOString(),
    expiresAt: new Date(row.expiresAt).toISOString(),
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    declinedAt: row.declinedAt ? new Date(row.declinedAt).toISOString() : null,
    canceledAt: row.canceledAt ? new Date(row.canceledAt).toISOString() : null,
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function rowToSigner(row: SignerProjection): ContractDocSigner {
  return {
    id: row.id,
    docId: row.docId,
    party: row.party as ContractParty,
    userId: row.userId,
    name: row.name,
    email: row.email,
    consentAt: row.consentAt ? new Date(row.consentAt).toISOString() : null,
    consentTextVersion: row.consentTextVersion ?? null,
    signedAt: row.signedAt ? new Date(row.signedAt).toISOString() : null,
    signatureMethod: (row.signatureMethod as ContractSignatureMethod | null) ?? null,
    signIp: row.signIp ?? null,
    signUserAgent: row.signUserAgent ?? null,
    reassignedBy: row.reassignedBy ?? null,
    reassignedAt: row.reassignedAt ? new Date(row.reassignedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function rowToEvent(row: EventRow): ContractDocEvent {
  return {
    id: row.id,
    docId: row.docId,
    type: row.type as ContractDocEventType,
    actorUserId: row.actorUserId ?? null,
    actorParty: (row.actorParty as ContractParty | null) ?? null,
    ip: row.ip ?? null,
    userAgent: row.userAgent ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export class DrizzleContractDocRepository implements ContractDocRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  // Batched signer hydration — one query for all doc ids (no N+1), mirrors
  // rfp.ts's allowedByRfp pattern.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async signersByDocIds(db: any, docIds: string[]): Promise<Map<string, ContractDocSigner[]>> {
    const map = new Map<string, ContractDocSigner[]>();
    if (docIds.length === 0) return map;
    const rows: SignerProjection[] = await db
      .select(SIGNER_COLUMNS)
      .from(contractDocSigners)
      .where(inArray(contractDocSigners.docId, docIds));
    for (const row of rows) {
      const list = map.get(row.docId) ?? [];
      list.push(rowToSigner(row));
      map.set(row.docId, list);
    }
    return map;
  }

  async reserveNextCode(yearMonth: string, tx: Tx): Promise<number> {
    const db = this.h(tx);
    // Atomic INSERT … ON CONFLICT DO UPDATE … RETURNING — mirrors
    // DrizzleRfpRepository.reserveNextCode against contract_doc_counters.
    const result = await db.execute(sql`
      INSERT INTO contract_doc_counters(year_month, last_seq) VALUES (${yearMonth}, 1)
      ON CONFLICT (year_month) DO UPDATE SET last_seq = contract_doc_counters.last_seq + 1
      RETURNING last_seq
    `);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = result as any;
    const rows: Array<{ last_seq: number }> = Array.isArray(r) ? r : (r?.rows ?? []);
    return rows[0].last_seq;
  }

  async createDoc(
    doc: NewContractDocInput,
    signers: Array<{ id: string; party: ContractParty; userId: string; name: string; email: string }>,
    tx: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db.insert(contractDocs).values({
      id: doc.id,
      code: doc.code,
      rfpId: doc.rfpId,
      bidId: doc.bidId,
      buyerWsId: doc.buyerWsId,
      pgWsId: doc.pgWsId,
      templateId: doc.templateId,
      status: doc.status,
      title: doc.title,
      parties: doc.parties,
      termsSnapshot: doc.termsSnapshot,
      basePdfKey: doc.basePdfKey,
      basePdfSha256: doc.basePdfSha256,
      basePdfSize: doc.basePdfSize,
      createdBy: doc.createdBy,
      expiresAt: new Date(doc.expiresAt),
    });
    if (signers.length > 0) {
      await db.insert(contractDocSigners).values(
        signers.map((s) => ({
          id: s.id,
          docId: doc.id,
          party: s.party,
          userId: s.userId,
          name: s.name,
          email: s.email,
        })),
      );
    }
  }

  async findById(id: string, tx?: Tx): Promise<ContractDoc | undefined> {
    const db = this.h(tx);
    const [row] = await db.select().from(contractDocs).where(eq(contractDocs.id, id)).limit(1);
    return row ? rowToDoc(row) : undefined;
  }

  async findByIdForUpdate(id: string, tx: Tx): Promise<ContractDoc | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select()
      .from(contractDocs)
      .where(eq(contractDocs.id, id))
      .limit(1)
      .for('update');
    return row ? rowToDoc(row) : undefined;
  }

  async findLatestByRfp(rfpId: string, tx?: Tx): Promise<ContractDoc | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select()
      .from(contractDocs)
      .where(eq(contractDocs.rfpId, rfpId))
      .orderBy(desc(contractDocs.sentAt))
      .limit(1);
    return row ? rowToDoc(row) : undefined;
  }

  async listForWorkspace(wsId: string, tx?: Tx): Promise<ContractDocListItem[]> {
    const db = this.h(tx);
    const rows: DocRow[] = await db
      .select()
      .from(contractDocs)
      .where(or(eq(contractDocs.buyerWsId, wsId), eq(contractDocs.pgWsId, wsId)))
      .orderBy(desc(contractDocs.sentAt));
    if (rows.length === 0) return [];

    // Batch: resolve both counterpart workspace names + signers in one query
    // each (no N+1) — mirrors rfp.ts's allowedByRfp batching pattern.
    const wsIds = [...new Set(rows.flatMap((r) => [r.buyerWsId, r.pgWsId]))];
    const wsNameRows: { id: string; name: string }[] = await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(inArray(workspaces.id, wsIds));
    const nameById = new Map(wsNameRows.map((w) => [w.id, w.name]));

    const signersByDoc = await this.signersByDocIds(
      db,
      rows.map((r) => r.id),
    );

    return rows.map((row) => ({
      doc: rowToDoc(row),
      signers: signersByDoc.get(row.id) ?? [],
      buyerWsName: nameById.get(row.buyerWsId) ?? '',
      pgWsName: nameById.get(row.pgWsId) ?? '',
    }));
  }

  async getSigners(docId: string, tx?: Tx): Promise<ContractDocSigner[]> {
    const db = this.h(tx);
    const rows: SignerProjection[] = await db
      .select(SIGNER_COLUMNS)
      .from(contractDocSigners)
      .where(eq(contractDocSigners.docId, docId));
    return rows.map(rowToSigner);
  }

  async getSignerImage(docId: string, party: ContractParty, tx?: Tx): Promise<Buffer | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ signatureImage: contractDocSigners.signatureImage })
      .from(contractDocSigners)
      .where(and(eq(contractDocSigners.docId, docId), eq(contractDocSigners.party, party)))
      .limit(1);
    return row?.signatureImage ?? undefined;
  }

  async markSigned(
    signerId: string,
    s: {
      consentAt: string;
      consentTextVersion: string;
      signedAt: string;
      signatureImage: Buffer;
      signatureMethod: ContractSignatureMethod;
      signIp: string | null;
      signUserAgent: string | null;
    },
    tx: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .update(contractDocSigners)
      .set({
        consentAt: new Date(s.consentAt),
        consentTextVersion: s.consentTextVersion,
        signedAt: new Date(s.signedAt),
        signatureImage: s.signatureImage,
        signatureMethod: s.signatureMethod,
        signIp: s.signIp,
        signUserAgent: s.signUserAgent,
        updatedAt: new Date(),
      })
      .where(eq(contractDocSigners.id, signerId));
  }

  async complete(
    docId: string,
    f: { finalPdfKey: string; finalPdfSha256: string; finalPdfSize: number; completedAt: string },
    tx: Tx,
  ): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .update(contractDocs)
      .set({
        status: 'completed',
        finalPdfKey: f.finalPdfKey,
        finalPdfSha256: f.finalPdfSha256,
        finalPdfSize: f.finalPdfSize,
        completedAt: new Date(f.completedAt),
        updatedAt: new Date(),
      })
      .where(and(eq(contractDocs.id, docId), eq(contractDocs.status, 'sent')))
      .returning({ id: contractDocs.id });
    return rows.length > 0;
  }

  async decline(docId: string, d: { reason: string; declinedAt: string }, tx: Tx): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .update(contractDocs)
      .set({
        status: 'declined',
        declineReason: d.reason,
        declinedAt: new Date(d.declinedAt),
        updatedAt: new Date(),
      })
      .where(and(eq(contractDocs.id, docId), eq(contractDocs.status, 'sent')))
      .returning({ id: contractDocs.id });
    return rows.length > 0;
  }

  async cancel(docId: string, canceledAt: string, tx: Tx): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .update(contractDocs)
      .set({ status: 'canceled', canceledAt: new Date(canceledAt), updatedAt: new Date() })
      .where(and(eq(contractDocs.id, docId), eq(contractDocs.status, 'sent')))
      .returning({ id: contractDocs.id });
    return rows.length > 0;
  }

  async expire(docId: string, tx: Tx): Promise<boolean> {
    const db = this.h(tx);
    const rows = await db
      .update(contractDocs)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(and(eq(contractDocs.id, docId), eq(contractDocs.status, 'sent')))
      .returning({ id: contractDocs.id });
    return rows.length > 0;
  }

  async reassignBuyerSigner(
    docId: string,
    r: { userId: string; name: string; email: string; reassignedBy: string; reassignedAt: string },
    tx: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .update(contractDocSigners)
      .set({
        userId: r.userId,
        name: r.name,
        email: r.email,
        reassignedBy: r.reassignedBy,
        reassignedAt: new Date(r.reassignedAt),
        updatedAt: new Date(),
      })
      .where(and(eq(contractDocSigners.docId, docId), eq(contractDocSigners.party, 'buyer')));
  }

  async insertEvent(
    ev: {
      id: string;
      docId: string;
      type: ContractDocEventType;
      actorUserId?: string | null;
      actorParty?: ContractParty | null;
      ip?: string | null;
      userAgent?: string | null;
      metadata?: Record<string, unknown> | null;
    },
    tx: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db.insert(contractDocEvents).values({
      id: ev.id,
      docId: ev.docId,
      type: ev.type,
      actorUserId: ev.actorUserId ?? null,
      actorParty: ev.actorParty ?? null,
      ip: ev.ip ?? null,
      userAgent: ev.userAgent ?? null,
      metadata: ev.metadata ?? null,
    });
  }

  async insertViewedEventIfAbsent(
    docId: string,
    party: ContractParty,
    meta: { actorUserId: string; ip: string | null; userAgent: string | null },
    tx: Tx,
  ): Promise<boolean> {
    const db = this.h(tx);
    // Single atomic statement (INSERT … SELECT … WHERE NOT EXISTS) — mirrors
    // reserveNextCode's raw-SQL approach for atomicity. gen_random_uuid() is
    // already relied on elsewhere (rfps.share_token default).
    const result = await db.execute(sql`
      INSERT INTO contract_doc_events (id, doc_id, type, actor_user_id, actor_party, ip, user_agent)
      SELECT gen_random_uuid(), ${docId}, 'viewed', ${meta.actorUserId}, ${party}, ${meta.ip}, ${meta.userAgent}
      WHERE NOT EXISTS (
        SELECT 1 FROM contract_doc_events
        WHERE doc_id = ${docId} AND type = 'viewed' AND actor_party = ${party}
      )
      RETURNING id
    `);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = result as any;
    const rows: unknown[] = Array.isArray(r) ? r : (r?.rows ?? []);
    return rows.length > 0;
  }

  async listEvents(docId: string, tx?: Tx): Promise<ContractDocEvent[]> {
    const db = this.h(tx);
    const rows: EventRow[] = await db
      .select()
      .from(contractDocEvents)
      .where(eq(contractDocEvents.docId, docId))
      .orderBy(asc(contractDocEvents.createdAt));
    return rows.map(rowToEvent);
  }
}
