import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { pgSigningTemplates } from '@/lib/db/schema';
import { ContractDocSchema } from '@/lib/contract-doc/schema';
import { migrateContractDoc } from '@/lib/types/contract-doc';
import type { ContractDoc } from '@/lib/types/contract-doc';
import type { PgSigningTemplate } from '@/lib/types/signing';
import type { PgSigningTemplateRepo, Tx } from '../types';

// Explicit column projection (BID_COLUMNS precedent) — 스키마 드리프트 가드.
const TEMPLATE_COLUMNS = {
  id: pgSigningTemplates.id,
  workspaceId: pgSigningTemplates.workspaceId,
  snowsignTemplateId: pgSigningTemplates.snowsignTemplateId,
  kind: pgSigningTemplates.kind,
  document: pgSigningTemplates.document,
  name: pgSigningTemplates.name,
  createdBy: pgSigningTemplates.createdBy,
  createdAt: pgSigningTemplates.createdAt,
  updatedAt: pgSigningTemplates.updatedAt,
} as const;

type TemplateRow = {
  [K in keyof typeof TEMPLATE_COLUMNS]: (typeof pgSigningTemplates.$inferSelect)[K];
};

/**
 * 행 → 도메인. **여기가 fail-closed 좁힘 지점이다.**
 *
 * DB CHECK 가 반쪽짜리 행을 막지만, 손으로 시드한 테스트 DB 나 CHECK 이전에
 * 만들어진 행은 그 보장을 벗어날 수 있다. 그런 행을 조용히 반쪽 도메인 객체로
 * 넘기면 상류가 `snowsignTemplateId` 를 undefined 인 채 provider 로 보낸다 —
 * 그래서 던진다. 데이터 오류를 나중이 아니라 읽는 순간 드러낸다.
 */
function rowToTemplate(row: TemplateRow): PgSigningTemplate {
  const base = {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.kind === 'composed') {
    if (row.document == null) {
      throw new Error(`composed signing template ${row.id} has no document`);
    }
    // 관대한 읽기 — 어떤 `_v` 로 저장됐든 현재 정규형으로 올린다.
    const document = migrateContractDoc(row.document);
    // ...그리고 올린 결과의 **모양**은 엄격히 본다. 마이그레이션은 조항 배열을 그대로
    // 통과시키므로(`Array.isArray` 검사뿐) `body` 없는 조항이 여기서 안 걸리면
    // 조판까지 흘러가 `wrapText(undefined)` 로 터진다 — 읽는 순간이 아니라 렌더 도중에,
    // 즉 계약을 보내려는 순간에. CHECK 는 "document 가 있는가"만 보고 내용은 안 본다.
    if (!ContractDocSchema.safeParse(document).success) {
      throw new Error(`composed signing template ${row.id} has a malformed document`);
    }
    return { ...base, kind: 'composed', document };
  }
  if (row.snowsignTemplateId == null) {
    throw new Error(`pdf signing template ${row.id} has no provider template id`);
  }
  return { ...base, kind: 'pdf', snowsignTemplateId: row.snowsignTemplateId };
}

export class DrizzlePgSigningTemplateRepository implements PgSigningTemplateRepo {
  constructor(private readonly _db: Tx) {}

  private h(tx?: Tx): Tx {
    return tx ?? this._db;
  }

  async create(
    template: {
      id?: string;
      workspaceId: string;
      snowsignTemplateId: string;
      name: string;
      createdBy: string;
    },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db.insert(pgSigningTemplates).values({
      id: template.id ?? randomUUID(),
      workspaceId: template.workspaceId,
      snowsignTemplateId: template.snowsignTemplateId,
      kind: 'pdf',
      name: template.name,
      createdBy: template.createdBy,
    });
  }

  async createComposed(
    template: {
      id?: string;
      workspaceId: string;
      name: string;
      document: ContractDoc;
      createdBy: string;
    },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db.insert(pgSigningTemplates).values({
      id: template.id ?? randomUUID(),
      workspaceId: template.workspaceId,
      // composed 행은 provider 템플릿이 없다 — CHECK 가 이 NULL 을 요구한다.
      snowsignTemplateId: null,
      kind: 'composed',
      document: template.document,
      name: template.name,
      createdBy: template.createdBy,
    });
  }

  async findById(id: string, tx?: Tx): Promise<PgSigningTemplate | undefined> {
    const db = this.h(tx);
    const [row] = (await db
      .select(TEMPLATE_COLUMNS)
      .from(pgSigningTemplates)
      .where(eq(pgSigningTemplates.id, id))
      .limit(1)) as TemplateRow[];
    return row ? rowToTemplate(row) : undefined;
  }

  async listByWorkspace(workspaceId: string, tx?: Tx): Promise<PgSigningTemplate[]> {
    const db = this.h(tx);
    const rows = (await db
      .select(TEMPLATE_COLUMNS)
      .from(pgSigningTemplates)
      .where(eq(pgSigningTemplates.workspaceId, workspaceId))
      .orderBy(asc(pgSigningTemplates.createdAt))) as TemplateRow[];
    return rows.map(rowToTemplate);
  }

  async updateName(id: string, name: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    // 다른 두 UPDATE 와 같이 `updatedAt` 을 올린다 — 한 경로만 빼면 컬럼이 "마지막 편집"
    // 을 말한다고 믿을 수 없게 되고, 그걸 믿는 다음 코드가 조용히 틀린다.
    await db
      .update(pgSigningTemplates)
      .set({ name, updatedAt: new Date() })
      .where(eq(pgSigningTemplates.id, id));
  }

  async updateProviderTemplate(
    id: string,
    snowsignTemplateId: string,
    name: string,
    tx?: Tx,
  ): Promise<boolean> {
    const db = this.h(tx);
    const rows = (await db
      .update(pgSigningTemplates)
      .set({ snowsignTemplateId, name, updatedAt: new Date() })
      // 대상을 kind 로 좁힌다. CHECK 도 종류를 넘나드는 쓰기를 막지만, 레포가
      // 먼저 좁히면 실패가 "0행"이라는 호출자가 이미 다루는 모양으로 나온다
      // (제약 위반 예외로 터지지 않는다).
      .where(and(eq(pgSigningTemplates.id, id), eq(pgSigningTemplates.kind, 'pdf')))
      .returning({ id: pgSigningTemplates.id })) as { id: string }[];
    return rows.length > 0;
  }

  async updateComposedDocument(
    id: string,
    name: string,
    document: ContractDoc,
    tx?: Tx,
  ): Promise<boolean> {
    const db = this.h(tx);
    const rows = (await db
      .update(pgSigningTemplates)
      // 행 id 를 유지하는 in-place UPDATE — delete+create 는
      // `bids.signing_template_id`(ON DELETE SET NULL)를 끊어 견적에 걸어 둔
      // 서식 선택을 조용히 지운다.
      .set({ name, document, updatedAt: new Date() })
      .where(and(eq(pgSigningTemplates.id, id), eq(pgSigningTemplates.kind, 'composed')))
      .returning({ id: pgSigningTemplates.id })) as { id: string }[];
    return rows.length > 0;
  }

  async remove(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(pgSigningTemplates).where(eq(pgSigningTemplates.id, id));
  }
}
