# 계약서 템플릿 재사용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PG가 자체 PDF 서명칸 배치 에디터로 계약서 템플릿을 워크스페이스에 여러 개 등록하고, 견적마다 어떤 템플릿을 쓸지 고른 뒤, award 후 PG의 확인 클릭 한 번으로(임베드 없이) 스노우싸인 API를 직접 호출해 발송한다.

**Architecture:** 스노우싸인 Public API를 직접 호출(`POST /v1/templates`, `POST /v1/templates/{id}/create-contract`, `POST /v1/contracts/{id}/send`)하는 서버측 흐름 + 로컬에서 PDF를 렌더링하고 서명칸을 배치하는 클라이언트 에디터(pdf.js + react-rnd). 임베드(iframe)를 전혀 쓰지 않으므로 기존 발송 리스/하트비트/이어받기 인프라가 필요 없다 — 단, 동시 클릭에 의한 중복 초안 생성을 막기 위해 기존 `claimForSend`/`releaseSendClaim` 원자적 클레임만 짧게 재사용한다(하트비트 없이 claim→작업→release 한 번).

**Tech Stack:** Next.js Server Actions, Drizzle ORM + PGlite(테스트), `pdfjs-dist`(신규), `react-rnd`(신규), Vitest.

**참고 문서:** `docs/superpowers/specs/2026-08-03-contract-template-reuse-design.md`(설계 스펙), `docs/SNOWSIGN_API.md`(스노우싸인 API 레퍼런스), `CLAUDE.md`(TDD 하드룰·서비스 레이어 규칙).

## Global Constraints

- 모든 코드 변경은 RED → GREEN → REFACTOR 순서를 지킨다(`superpowers:test-driven-development` 하드룰) — 실패하는 테스트를 먼저 작성하고 실행해 RED을 직접 확인한 뒤 구현한다.
- 서비스 레이어 규칙(`CLAUDE.md`): 서비스가 트랜잭션·알림 팬아웃·이메일 아웃박스를 소유. `Actor = { userId, workspaceId }`, `ServiceResult<T> = { ok: true } & T | { ok: false; error: string }`.
- 신규 서버 액션은 `lib/server/actions/_session.ts`의 `requirePgActor`를 세션 검증에 쓴다(`_shared.ts` 패턴 대신).
- 리포지토리 경계: DB 접근은 `lib/server/repositories/**`만 소유. 다른 코드는 `@/lib/db/schema`를 값으로 정적 import할 수 없다(ESLint `repo-boundary/db-access`).
- role 문자열은 `'구매사'`/`'PG사'` 한글 라벨 고정(스노우싸인 서명 화면·이메일에 그대로 노출될 가능성 — 설계 스펙 참조). 내부 판별은 `SigningParticipantRole`(`'buyer'`/`'pg'`)을 그대로 쓴다.
- 변수 치환·필드 수정·서명자 선택 드롭다운·`stamp`/`checkbox` 필드는 범위 밖(설계 스펙 "범위 밖" 절).
- 각 태스크의 테스트는 `pnpm test <path>`로 RED → GREEN을 직접 확인한다. 전체 그린은 `pnpm test`.

---

### Task 1: DB 스키마 — `pg_signing_templates` + `bids.signing_template_id`

**Files:**
- Create: `lib/db/schema/pg-signing-templates.ts`
- Modify: `lib/db/schema/bids.ts`
- Modify: `lib/db/schema/index.ts`
- Modify: `lib/types/signing.ts`

**Interfaces:**
- Produces: `pgSigningTemplates` 테이블(drizzle), `bids.signingTemplateId` 컬럼, `PgSigningTemplate` 타입, `SigningTemplateFieldType`(`'signature'|'name'|'date'|'text'`), `SigningTemplateFieldParty`(`'buyer'|'pg'`), `SigningTemplateFieldInput` 타입 — 이후 모든 태스크가 이 타입들을 그대로 참조한다.

이 태스크는 순수 스키마 정의라 RED/GREEN 사이클이 성립하지 않는다(동작이 없다 — 실제 커버리지는 Task 2의 리포지토리 테스트에서 나온다). 대신 타입체크 + DDL 생성 스모크로 검증한다.

- [ ] **Step 1: `pg_signing_templates` 테이블 정의**

`lib/db/schema/pg-signing-templates.ts`:

```ts
import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspaces';
import { users } from './users';

/**
 * PG가 자체 PDF 서명칸 배치 에디터로 만들어 스노우싸인에 등록한 계약서 템플릿.
 * 역할은 항상 구매사/PG 둘로 고정되고(에디터가 배치 시점에 태그), 변수 치환은
 * 쓰지 않는다 — 옛 pg_signing_templates(v0.4.37.0에서 폐지) 대비 roleMapping/
 * variableMapping 컬럼이 없다.
 */
export const pgSigningTemplates = pgTable(
  'pg_signing_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    snowsignTemplateId: text('snowsign_template_id').notNull(),
    name: text('name').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex('pg_signing_templates_ws_template_uniq').on(t.workspaceId, t.snowsignTemplateId),
    index('pg_signing_templates_ws_idx').on(t.workspaceId),
  ],
);
```

- [ ] **Step 2: `bids.signing_template_id` FK 추가**

`lib/db/schema/bids.ts` 상단 import에 추가:

```ts
import { pgSigningTemplates } from './pg-signing-templates';
```

`bids` 테이블 정의의 `boardColumnId` 필드 바로 아래에 추가:

```ts
    /**
     * 견적별 사전 선택한 계약서 템플릿(선택). award 후 딜룸에서 "연결된 템플릿으로
     * 보내기"에 쓰인다. 템플릿이 삭제되면 SET NULL로 사전 선택만 풀리고 견적 자체는
     * 멀쩡하다.
     */
    signingTemplateId: uuid('signing_template_id').references(() => pgSigningTemplates.id, {
      onDelete: 'set null',
    }),
```

`(t) => [...]` 배열에 인덱스 추가(대부분의 견적은 템플릿을 안 고르므로 부분 인덱스):

```ts
    index('bids_signing_template_idx')
      .on(t.signingTemplateId)
      .where(sql`signing_template_id is not null`),
```

- [ ] **Step 3: 스키마 index export**

`lib/db/schema/index.ts` 끝에 추가(다른 signing 관련 export 옆):

```ts
export * from './pg-signing-templates';
```

- [ ] **Step 4: 도메인 타입 추가**

`lib/types/signing.ts` 끝에 추가:

```ts
/** PG 워크스페이스에 등록된 재사용 계약서 템플릿. */
export type PgSigningTemplate = {
  id: string;
  workspaceId: string;
  snowsignTemplateId: string;
  name: string;
  createdBy: string;
  createdAt: string; // ISO 8601
};

export type SigningTemplateFieldType = 'signature' | 'name' | 'date' | 'text';
export type SigningTemplateFieldParty = 'buyer' | 'pg';

/**
 * 에디터가 들고 있는 필드 1개 — signature_fields payload로 변환되기 전 내부 표현.
 * 좌표는 pdf.js `getViewport({ scale: 1 })` 기준 픽셀(좌상단 원점).
 */
export type SigningTemplateFieldInput = {
  /** 에디터 내부 React key. API로 나가지 않는다. */
  id: string;
  type: SigningTemplateFieldType;
  party: SigningTemplateFieldParty;
  /** 1부터 시작. */
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
```

- [ ] **Step 5: 검증**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음(스키마 컴파일 확인). 이 시점에 `bids.ts`가 `signingTemplateId`를 아직 읽지 않는 다른 코드에 영향 없음을 확인.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema/pg-signing-templates.ts lib/db/schema/bids.ts lib/db/schema/index.ts lib/types/signing.ts
git commit -m "feat(signing): pg_signing_templates 스키마 + bids.signing_template_id 추가"
```

---

### Task 2: `PgSigningTemplateRepo` — 인터페이스 + Drizzle 구현 + 팩토리 배선

**Files:**
- Modify: `lib/server/repositories/types.ts`
- Create: `lib/server/repositories/drizzle/pg-signing-template.ts`
- Test: `lib/server/repositories/drizzle/__tests__/pg-signing-template.test.ts`
- Modify: `lib/server/repositories/factory.ts`

**Interfaces:**
- Consumes: `PgSigningTemplate`(Task 1), `pgSigningTemplates`(Task 1).
- Produces: `PgSigningTemplateRepo` 인터페이스(`create`/`findById`/`listByWorkspace`/`updateName`/`remove`), `getPgSigningTemplateRepo()` — Task 5(서비스)가 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/server/repositories/drizzle/__tests__/pg-signing-template.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzlePgSigningTemplateRepository } from '../pg-signing-template';
import { seedPgWorkspace, seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  return { db, repo: new DrizzlePgSigningTemplateRepository(db) };
}

describe('DrizzlePgSigningTemplateRepository', () => {
  it('create() + findById() round-trips a template', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tpl1');
    const user = await seedUser(db);

    await repo.create({
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      workspaceId: ws.id,
      snowsignTemplateId: 'sst-1',
      name: '표준 계약서',
      createdBy: user.id,
    });

    const found = await repo.findById('aaaaaaaa-0000-4000-8000-000000000001');
    expect(found?.workspaceId).toBe(ws.id);
    expect(found?.snowsignTemplateId).toBe('sst-1');
    expect(found?.name).toBe('표준 계약서');
    expect(found?.createdBy).toBe(user.id);
  });

  it('findById() returns undefined for a missing id', async () => {
    const { repo } = await setup();
    const found = await repo.findById('aaaaaaaa-0000-4000-8000-000000000099');
    expect(found).toBeUndefined();
  });

  it('listByWorkspace() returns only that workspace templates, oldest first', async () => {
    const { db, repo } = await setup();
    const wsA = await seedPgWorkspace(db, 'signing.tplA');
    const wsB = await seedPgWorkspace(db, 'signing.tplB');
    const user = await seedUser(db);

    await repo.create({ workspaceId: wsA.id, snowsignTemplateId: 'a1', name: '첫번째', createdBy: user.id });
    await repo.create({ workspaceId: wsA.id, snowsignTemplateId: 'a2', name: '두번째', createdBy: user.id });
    await repo.create({ workspaceId: wsB.id, snowsignTemplateId: 'b1', name: '다른워크스페이스', createdBy: user.id });

    const rows = await repo.listByWorkspace(wsA.id);
    expect(rows.map((r) => r.name)).toEqual(['첫번째', '두번째']);
  });

  it('updateName() renames a template', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplRename');
    const user = await seedUser(db);
    await repo.create({ id: 'aaaaaaaa-0000-4000-8000-000000000002', workspaceId: ws.id, snowsignTemplateId: 's', name: '원래이름', createdBy: user.id });

    await repo.updateName('aaaaaaaa-0000-4000-8000-000000000002', '새이름');

    const found = await repo.findById('aaaaaaaa-0000-4000-8000-000000000002');
    expect(found?.name).toBe('새이름');
  });

  it('remove() hard-deletes a template', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplRemove');
    const user = await seedUser(db);
    await repo.create({ id: 'aaaaaaaa-0000-4000-8000-000000000003', workspaceId: ws.id, snowsignTemplateId: 's', name: '지울것', createdBy: user.id });

    await repo.remove('aaaaaaaa-0000-4000-8000-000000000003');

    expect(await repo.findById('aaaaaaaa-0000-4000-8000-000000000003')).toBeUndefined();
  });
});
```

- [ ] **Step 2: RED 확인**

```bash
pnpm test lib/server/repositories/drizzle/__tests__/pg-signing-template.test.ts
```

Expected: FAIL — `Cannot find module '../pg-signing-template'`.

- [ ] **Step 3: `PgSigningTemplateRepo` 인터페이스 추가**

`lib/server/repositories/types.ts` — 상단 `@/lib/types/signing` import 목록에 `PgSigningTemplate` 추가. `SigningContractRepo` 인터페이스(172번째 줄 부근) 바로 뒤에 추가:

```ts
export interface PgSigningTemplateRepo {
  /** 템플릿 생성 — id 미지정 시 발급. */
  create(
    template: {
      id?: string;
      workspaceId: string;
      snowsignTemplateId: string;
      name: string;
      createdBy: string;
    },
    tx?: Tx,
  ): Promise<void>;
  /** id 단건 조회. 없으면 undefined. */
  findById(id: string, tx?: Tx): Promise<PgSigningTemplate | undefined>;
  /** 한 워크스페이스의 모든 템플릿, 생성일 오름차순. */
  listByWorkspace(workspaceId: string, tx?: Tx): Promise<PgSigningTemplate[]>;
  /** 이름 변경 — 소유 워크스페이스 검증은 서비스 레이어 책임. */
  updateName(id: string, name: string, tx?: Tx): Promise<void>;
  /** 단건 하드 삭제. */
  remove(id: string, tx?: Tx): Promise<void>;
}
```

- [ ] **Step 4: Drizzle 구현 작성**

`lib/server/repositories/drizzle/pg-signing-template.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { pgSigningTemplates } from '@/lib/db/schema';
import type { PgSigningTemplate } from '@/lib/types/signing';
import type { PgSigningTemplateRepo, Tx } from '../types';

// Explicit column projection (BID_COLUMNS precedent) — 스키마 드리프트 가드.
const TEMPLATE_COLUMNS = {
  id: pgSigningTemplates.id,
  workspaceId: pgSigningTemplates.workspaceId,
  snowsignTemplateId: pgSigningTemplates.snowsignTemplateId,
  name: pgSigningTemplates.name,
  createdBy: pgSigningTemplates.createdBy,
  createdAt: pgSigningTemplates.createdAt,
} as const;

type TemplateRow = {
  [K in keyof typeof TEMPLATE_COLUMNS]: (typeof pgSigningTemplates.$inferSelect)[K];
};

function rowToTemplate(row: TemplateRow): PgSigningTemplate {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    snowsignTemplateId: row.snowsignTemplateId,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
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
    await db.update(pgSigningTemplates).set({ name }).where(eq(pgSigningTemplates.id, id));
  }

  async remove(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.delete(pgSigningTemplates).where(eq(pgSigningTemplates.id, id));
  }
}
```

- [ ] **Step 5: GREEN 확인**

```bash
pnpm test lib/server/repositories/drizzle/__tests__/pg-signing-template.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: 팩토리 배선**

`lib/server/repositories/factory.ts`에서 `BidQuoteTemplateRepo`/`bidQuoteTemplate` 배선을 그대로 미러링한다:

1. 상단 타입 import 목록에 `PgSigningTemplateRepo` 추가.
2. 리포지토리 번들 타입에 `pgSigningTemplate: PgSigningTemplateRepo;` 추가(`bidQuoteTemplate` 필드 바로 아래).
3. 번들 생성 함수 안, `DrizzleBidQuoteTemplateRepository` 동적 import 옆에 추가:
   ```ts
   const { DrizzlePgSigningTemplateRepository } = await import(
     './drizzle/pg-signing-template'
   );
   ```
4. 번들 객체 리터럴에 추가: `pgSigningTemplate: new DrizzlePgSigningTemplateRepository(db),`
5. 파일 끝(다른 `get*Repo` export들 옆)에 추가:
   ```ts
   export async function getPgSigningTemplateRepo(): Promise<PgSigningTemplateRepo> {
     return (await getBundle()).pgSigningTemplate;
   }
   ```

- [ ] **Step 7: 전체 리포지토리 스위트 재확인**

```bash
pnpm test lib/server/repositories
```

Expected: PASS — 기존 리포지토리 테스트가 factory.ts 변경으로 깨지지 않았는지 확인.

- [ ] **Step 8: Commit**

```bash
git add lib/server/repositories/types.ts lib/server/repositories/drizzle/pg-signing-template.ts lib/server/repositories/drizzle/__tests__/pg-signing-template.test.ts lib/server/repositories/factory.ts
git commit -m "feat(signing): PgSigningTemplateRepo 추가 + 팩토리 배선"
```

---

### Task 3: 순수 함수 — 필드 상태 → API payload 변환 + 완전성 검증

**Files:**
- Create: `lib/signing/template-fields.ts`
- Test: `lib/signing/__tests__/template-fields.test.ts`

**Interfaces:**
- Consumes: `SigningTemplateFieldInput`(Task 1).
- Produces: `buildSignatureFieldsPayload(fields): SnowSignSignatureFieldInput[]`, `validateTemplateFields(fields): {ok:true}|{ok:false,error:string}` — Task 4(클라이언트)와 Task 5(서비스)가 소비. `SnowSignSignatureFieldInput`은 Task 4가 정의하지만, 이 태스크가 먼저 실행되므로 여기서 로컬로 동일 shape을 정의하고 Task 4에서 그 타입을 import하도록 맞춘다(아래 코드 참조).

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/signing/__tests__/template-fields.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSignatureFieldsPayload, validateTemplateFields } from '../template-fields';
import type { SigningTemplateFieldInput } from '@/lib/types/signing';

function field(overrides: Partial<SigningTemplateFieldInput>): SigningTemplateFieldInput {
  return {
    id: 'f1',
    type: 'signature',
    party: 'buyer',
    pageNumber: 1,
    x: 10,
    y: 20,
    width: 120,
    height: 50,
    ...overrides,
  };
}

describe('buildSignatureFieldsPayload', () => {
  it('maps party to the Korean role label and passes coordinates through', () => {
    const payload = buildSignatureFieldsPayload([
      field({ party: 'buyer', type: 'signature', pageNumber: 2, x: 10, y: 20, width: 120, height: 50 }),
      field({ id: 'f2', party: 'pg', type: 'date', pageNumber: 1, x: 5, y: 6, width: 100, height: 24 }),
    ]);
    expect(payload).toEqual([
      { role: '구매사', type: 'signature', pageNumber: 2, positionX: 10, positionY: 20, width: 120, height: 50 },
      { role: 'PG사', type: 'date', pageNumber: 1, positionX: 5, positionY: 6, width: 100, height: 24 },
    ]);
  });

  it('returns an empty array for no fields', () => {
    expect(buildSignatureFieldsPayload([])).toEqual([]);
  });
});

describe('validateTemplateFields', () => {
  it('fails when there is no buyer signable field', () => {
    const result = validateTemplateFields([field({ party: 'pg', type: 'signature' })]);
    expect(result).toEqual({ ok: false, error: 'MISSING_SIGNABLE_FIELD' });
  });

  it('fails when there is no pg signable field', () => {
    const result = validateTemplateFields([field({ party: 'buyer', type: 'signature' })]);
    expect(result).toEqual({ ok: false, error: 'MISSING_SIGNABLE_FIELD' });
  });

  it('fails when both sides only have non-signable fields (date/text)', () => {
    const result = validateTemplateFields([
      field({ party: 'buyer', type: 'date' }),
      field({ party: 'pg', type: 'text' }),
    ]);
    expect(result).toEqual({ ok: false, error: 'MISSING_SIGNABLE_FIELD' });
  });

  it('succeeds when both sides have a signature or name field', () => {
    const result = validateTemplateFields([
      field({ party: 'buyer', type: 'signature' }),
      field({ id: 'f2', party: 'pg', type: 'name' }),
    ]);
    expect(result).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: RED 확인**

```bash
pnpm test lib/signing/__tests__/template-fields.test.ts
```

Expected: FAIL — `Cannot find module '../template-fields'`.

- [ ] **Step 3: 구현**

`lib/signing/template-fields.ts`:

```ts
import type {
  SigningTemplateFieldInput,
  SigningTemplateFieldParty,
  SigningTemplateFieldType,
} from '@/lib/types/signing';

/**
 * 스노우싸인 signature_fields 항목의 camelCase 중간 표현 — snake_case 변환은
 * SnowSignClient.createTemplate이 소유한다(다른 클라이언트 메서드와 동일한 seam).
 */
export type SnowSignSignatureFieldInput = {
  role: string;
  type: SigningTemplateFieldType;
  pageNumber: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
};

const PARTY_ROLE_LABEL: Record<SigningTemplateFieldParty, string> = {
  buyer: '구매사',
  pg: 'PG사',
};

export function buildSignatureFieldsPayload(
  fields: SigningTemplateFieldInput[],
): SnowSignSignatureFieldInput[] {
  return fields.map((f) => ({
    role: PARTY_ROLE_LABEL[f.party],
    type: f.type,
    pageNumber: f.pageNumber,
    positionX: f.x,
    positionY: f.y,
    width: f.width,
    height: f.height,
  }));
}

export type TemplateFieldsValidation = { ok: true } | { ok: false; error: string };

/** 서명 가능한 필드 타입 — signature/name은 API가 항상 is_required=true로 강제한다. */
const SIGNABLE_TYPES = new Set<SigningTemplateFieldType>(['signature', 'name']);

/** 저장 전 검증 — 구매사·PG사 각각 서명 가능한 필드가 최소 1개 있어야 한다. */
export function validateTemplateFields(
  fields: SigningTemplateFieldInput[],
): TemplateFieldsValidation {
  const hasBuyerSignable = fields.some((f) => f.party === 'buyer' && SIGNABLE_TYPES.has(f.type));
  const hasPgSignable = fields.some((f) => f.party === 'pg' && SIGNABLE_TYPES.has(f.type));
  if (!hasBuyerSignable || !hasPgSignable) {
    return { ok: false, error: 'MISSING_SIGNABLE_FIELD' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: GREEN 확인**

```bash
pnpm test lib/signing/__tests__/template-fields.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/signing/template-fields.ts lib/signing/__tests__/template-fields.test.ts
git commit -m "feat(signing): 템플릿 필드 → API payload 변환 순수 함수"
```

---

### Task 4: `SnowSignClient` 확장 — 업로드 세션 + 템플릿 생성 + 템플릿발 계약 생성 + 발송

**Files:**
- Modify: `lib/server/signing/snowsign-client.ts`
- Test: `lib/server/signing/__tests__/snowsign-client.test.ts`
- Modify: `lib/server/services/__tests__/contract-signing.test.ts` (기존 `mockClient()` 헬퍼가 인터페이스 확장에 맞춰 갱신 필요 — 안 하면 컴파일 에러)

**Interfaces:**
- Consumes: `SnowSignSignatureFieldInput`(Task 3).
- Produces: `SnowSignClient.createUploadSession`/`createTemplate`/`createContractFromTemplate`/`sendContract` — Task 5·6이 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/server/signing/__tests__/snowsign-client.test.ts`에 기존 `describe` 블록 옆에 추가(파일 상단 import에 `RealSnowSignClient`가 이미 있다는 전제 — 없으면 기존 테스트의 import 방식을 그대로 따른다):

```ts
describe('RealSnowSignClient — templates', () => {
  it('createUploadSession() posts purpose/filename/content_type/size_bytes and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            upload_id: 'upl_1',
            upload_url: 'https://s3.example.com/upload',
            fields: { key: 'k' },
            max_size_bytes: 52428800,
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    process.env.SNOWSIGN_API_KEY = 'k';

    const client = new RealSnowSignClient({ retryDelay: () => 0 });
    const result = await client.createUploadSession({
      purpose: 'template_document',
      filename: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1000,
    });

    expect(result).toEqual({
      uploadId: 'upl_1',
      uploadUrl: 'https://s3.example.com/upload',
      fields: { key: 'k' },
      maxSizeBytes: 52428800,
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toEqual({
      purpose: 'template_document',
      filename: 'a.pdf',
      content_type: 'application/pdf',
      size_bytes: 1000,
    });
  });

  it('createTemplate() posts signers + snake_case signature_fields and returns templateId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { template_id: 'tpl_1', name: '표준' } }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    process.env.SNOWSIGN_API_KEY = 'k';

    const client = new RealSnowSignClient({ retryDelay: () => 0 });
    const result = await client.createTemplate({
      name: '표준',
      documentUploadId: 'upl_1',
      signers: ['구매사', 'PG사'],
      signatureFields: [
        { role: '구매사', type: 'signature', pageNumber: 1, positionX: 1, positionY: 2, width: 3, height: 4 },
      ],
    });

    expect(result).toEqual({ templateId: 'tpl_1' });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.signers).toEqual(['구매사', 'PG사']);
    expect(body.signature_fields).toEqual([
      { role: '구매사', type: 'signature', page_number: 1, position_x: 1, position_y: 2, width: 3, height: 4, position_unit: 'pixel' },
    ]);
  });

  it('createContractFromTemplate() posts title + participants and returns contractId/status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { contract_id: 'c1', status: 'draft' } }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    process.env.SNOWSIGN_API_KEY = 'k';

    const client = new RealSnowSignClient({ retryDelay: () => 0 });
    const result = await client.createContractFromTemplate('tpl_1', {
      title: '외주 계약서',
      participants: [{ role: '구매사', name: '홍길동', email: 'a@b.com' }],
    });

    expect(result).toEqual({ contractId: 'c1', status: 'draft' });
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/templates/tpl_1/create-contract');
  });

  it('sendContract() posts to /send and returns status + sentAt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { contract_id: 'c1', status: 'pending', sent_at: '2026-01-01T00:00:00Z' } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    process.env.SNOWSIGN_API_KEY = 'k';

    const client = new RealSnowSignClient({ retryDelay: () => 0 });
    const result = await client.sendContract('c1');

    expect(result).toEqual({ contractId: 'c1', status: 'pending', sentAt: '2026-01-01T00:00:00Z' });
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/contracts/c1/send');
  });
});
```

(파일 상단에 이미 `vi`, `RealSnowSignClient`가 import돼 있지 않다면 기존 파일의 첫 `describe` 블록이 쓰는 것과 동일한 import 문을 그대로 따른다 — 파일을 먼저 Read해서 정확한 import 스타일을 확인할 것.)

- [ ] **Step 2: RED 확인**

```bash
pnpm test lib/server/signing/__tests__/snowsign-client.test.ts
```

Expected: FAIL — `client.createUploadSession is not a function` 등.

- [ ] **Step 3: `SnowSignClient` 인터페이스 + 구현 확장**

`lib/server/signing/snowsign-client.ts` 수정:

1. `SnowSignSignatureFieldInput`을 `@/lib/signing/template-fields`에서 import(새 타입 재정의하지 않는다):
   ```ts
   import type { SnowSignSignatureFieldInput } from '@/lib/signing/template-fields';
   ```
2. 새 응답 타입 추가(`SnowSignContractPage` 타입 정의 근처):
   ```ts
   export type SnowSignUploadSession = {
     uploadId: string;
     uploadUrl: string;
     fields: Record<string, string>;
     maxSizeBytes: number;
   };

   export type SnowSignTemplateRef = { templateId: string };

   export type SnowSignTemplateContractRef = { contractId: string; status: string };

   export type SnowSignSendResult = { contractId: string; status: string; sentAt?: string };
   ```
3. `SnowSignClient` 인터페이스에 4개 메서드 추가(기존 `cancel(...)` 아래):
   ```ts
     createUploadSession(input: {
       purpose: 'contract_document' | 'template_document';
       filename: string;
       contentType: string;
       sizeBytes: number;
     }): Promise<SnowSignUploadSession>;
     createTemplate(input: {
       name: string;
       documentUploadId: string;
       signers: string[];
       signatureFields: SnowSignSignatureFieldInput[];
     }): Promise<SnowSignTemplateRef>;
     createContractFromTemplate(
       templateId: string,
       input: { title: string; participants: { role: string; name: string; email: string }[] },
     ): Promise<SnowSignTemplateContractRef>;
     sendContract(contractId: string, message?: string): Promise<SnowSignSendResult>;
   ```
4. `RealSnowSignClient` 클래스에 구현 추가(`cancel(...)` 메서드 바로 뒤):
   ```ts
     async createUploadSession(input: {
       purpose: 'contract_document' | 'template_document';
       filename: string;
       contentType: string;
       sizeBytes: number;
     }): Promise<SnowSignUploadSession> {
       const d = await this.request<
         | { upload_id?: string; upload_url?: string; fields?: Record<string, string>; max_size_bytes?: number }
         | undefined
       >('POST', '/v1/uploads', {
         purpose: input.purpose,
         filename: input.filename,
         content_type: input.contentType,
         size_bytes: input.sizeBytes,
       });
       return {
         uploadId: reqString(d?.upload_id, 'upload_id'),
         uploadUrl: reqAbsoluteUrl(d?.upload_url, 'upload_url'),
         fields: d?.fields ?? {},
         maxSizeBytes: typeof d?.max_size_bytes === 'number' ? d.max_size_bytes : 52_428_800,
       };
     }

     async createTemplate(input: {
       name: string;
       documentUploadId: string;
       signers: string[];
       signatureFields: SnowSignSignatureFieldInput[];
     }): Promise<SnowSignTemplateRef> {
       const d = await this.request<{ template_id?: string } | undefined>('POST', '/v1/templates', {
         name: input.name,
         document_upload_id: input.documentUploadId,
         signers: input.signers,
         signature_fields: input.signatureFields.map((f) => ({
           role: f.role,
           type: f.type,
           page_number: f.pageNumber,
           position_x: f.positionX,
           position_y: f.positionY,
           width: f.width,
           height: f.height,
           position_unit: 'pixel',
         })),
       });
       return { templateId: reqString(d?.template_id, 'template_id') };
     }

     async createContractFromTemplate(
       templateId: string,
       input: { title: string; participants: { role: string; name: string; email: string }[] },
     ): Promise<SnowSignTemplateContractRef> {
       const d = await this.request<{ contract_id?: string; status?: string } | undefined>(
         'POST',
         `/v1/templates/${encodeURIComponent(templateId)}/create-contract`,
         {
           title: input.title,
           participants: input.participants.map((p) => ({ role: p.role, name: p.name, email: p.email })),
         },
       );
       return {
         contractId: reqString(d?.contract_id, 'contract_id'),
         status: reqString(d?.status, 'status'),
       };
     }

     async sendContract(contractId: string, message?: string): Promise<SnowSignSendResult> {
       const d = await this.request<
         { contract_id?: string; status?: string; sent_at?: string } | undefined
       >('POST', `/v1/contracts/${encodeURIComponent(contractId)}/send`, message ? { message } : {});
       return {
         contractId: reqString(d?.contract_id, 'contract_id'),
         status: reqString(d?.status, 'status'),
         sentAt: d?.sent_at,
       };
     }
   ```

- [ ] **Step 4: GREEN 확인**

```bash
pnpm test lib/server/signing/__tests__/snowsign-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: 기존 mock 헬퍼 갱신(컴파일 에러 방지)**

`lib/server/services/__tests__/contract-signing.test.ts`의 `mockClient()` 함수는 `as SnowSignClient` 캐스팅을 쓰지 않으므로, 인터페이스에 메서드가 늘면 이 파일이 컴파일 에러가 난다. `mockClient` 안에 추가:

```ts
    createUploadSession: vi.fn(),
    createTemplate: vi.fn(),
    createContractFromTemplate: vi.fn(),
    sendContract: vi.fn(),
```

(`cancel: vi.fn(),` 바로 아래, `...overrides` 앞.)

- [ ] **Step 6: 전체 서명 스위트 재확인**

```bash
pnpm test lib/server/signing lib/server/services/__tests__/contract-signing.test.ts
```

Expected: PASS — 기존 테스트가 인터페이스 확장으로 깨지지 않았는지 확인.

- [ ] **Step 7: Commit**

```bash
git add lib/server/signing/snowsign-client.ts lib/server/signing/__tests__/snowsign-client.test.ts lib/server/services/__tests__/contract-signing.test.ts
git commit -m "feat(signing): SnowSignClient에 템플릿 생성/발송 API 추가"
```

---

### Task 5: `SigningTemplateService` — 템플릿 CRUD

**Files:**
- Create: `lib/server/services/signing-template.ts`
- Test: `lib/server/services/__tests__/signing-template.test.ts`

**Interfaces:**
- Consumes: `PgSigningTemplateRepo`(Task 2), `SnowSignClient`(Task 4), `buildSignatureFieldsPayload`/`validateTemplateFields`(Task 3).
- Produces: `SigningTemplateService`(`createUploadSession`/`createTemplate`/`list`/`rename`/`remove`), `getSigningTemplateService()` — Task 8(서버 액션)이 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/server/services/__tests__/signing-template.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SigningTemplateService } from '../signing-template';
import type { PgSigningTemplateRepo } from '@/lib/server/repositories/types';
import type { SnowSignClient } from '@/lib/server/signing/snowsign-client';
import type { PgSigningTemplate } from '@/lib/types/signing';

function fakeRepo(seed: PgSigningTemplate[] = []): PgSigningTemplateRepo {
  const rows = [...seed];
  return {
    create: vi.fn(async (t) => {
      rows.push({
        id: t.id ?? randomUUID(),
        workspaceId: t.workspaceId,
        snowsignTemplateId: t.snowsignTemplateId,
        name: t.name,
        createdBy: t.createdBy,
        createdAt: new Date().toISOString(),
      });
    }),
    findById: vi.fn(async (id) => rows.find((r) => r.id === id)),
    listByWorkspace: vi.fn(async (wsId) => rows.filter((r) => r.workspaceId === wsId)),
    updateName: vi.fn(async (id, name) => {
      const row = rows.find((r) => r.id === id);
      if (row) row.name = name;
    }),
    remove: vi.fn(async (id) => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx >= 0) rows.splice(idx, 1);
    }),
  };
}

function fakeSnowSign(overrides: Partial<SnowSignClient> = {}): SnowSignClient {
  return {
    createEmbedSession: vi.fn(),
    listContracts: vi.fn(),
    getContract: vi.fn(),
    getStatus: vi.fn(),
    downloadUrl: vi.fn(),
    auditCertificateUrl: vi.fn(),
    remind: vi.fn(),
    cancel: vi.fn(),
    createUploadSession: vi.fn(async () => ({
      uploadId: 'upl_1',
      uploadUrl: 'https://example.com/upload',
      fields: {},
      maxSizeBytes: 52428800,
    })),
    createTemplate: vi.fn(async () => ({ templateId: 'sst_1' })),
    createContractFromTemplate: vi.fn(),
    sendContract: vi.fn(),
    ...overrides,
  };
}

const actor = { userId: 'u1', workspaceId: 'ws1' };
const signableField = {
  id: 'f1',
  type: 'signature' as const,
  party: 'buyer' as const,
  pageNumber: 1,
  x: 0,
  y: 0,
  width: 100,
  height: 40,
};
const pgSignableField = { ...signableField, id: 'f2', party: 'pg' as const };

describe('SigningTemplateService', () => {
  it('createUploadSession() delegates to SnowSignClient with purpose=template_document', async () => {
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(fakeRepo(), snowsign);

    const result = await service.createUploadSession(actor, {
      filename: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 100,
    });

    expect(result).toEqual({
      ok: true,
      uploadId: 'upl_1',
      uploadUrl: 'https://example.com/upload',
      fields: {},
    });
    expect(snowsign.createUploadSession).toHaveBeenCalledWith({
      purpose: 'template_document',
      filename: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 100,
    });
  });

  it('createTemplate() rejects when fields fail validation, without calling SnowSign', async () => {
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(fakeRepo(), snowsign);

    const result = await service.createTemplate(actor, {
      name: '표준',
      documentUploadId: 'upl_1',
      fields: [signableField], // pg 쪽 서명 필드 없음
    });

    expect(result).toEqual({ ok: false, error: 'MISSING_SIGNABLE_FIELD' });
    expect(snowsign.createTemplate).not.toHaveBeenCalled();
  });

  it('createTemplate() calls SnowSign with fixed signers and persists the link row', async () => {
    const repo = fakeRepo();
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(repo, snowsign);

    const result = await service.createTemplate(actor, {
      name: '표준 계약서',
      documentUploadId: 'upl_1',
      fields: [signableField, pgSignableField],
    });

    expect(result.ok).toBe(true);
    expect(snowsign.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ name: '표준 계약서', documentUploadId: 'upl_1', signers: ['구매사', 'PG사'] }),
    );
    const listed = await service.list(actor);
    expect(listed.ok && listed.templates.map((t) => t.name)).toEqual(['표준 계약서']);
  });

  it('rename() returns TEMPLATE_NOT_FOUND for a missing id', async () => {
    const service = new SigningTemplateService(fakeRepo(), fakeSnowSign());
    const result = await service.rename(actor, 'missing', 'x');
    expect(result).toEqual({ ok: false, error: 'TEMPLATE_NOT_FOUND' });
  });

  it('rename() returns FORBIDDEN for another workspace template', async () => {
    const repo = fakeRepo([
      { id: 't1', workspaceId: 'other-ws', snowsignTemplateId: 's', name: '남의것', createdBy: 'u9', createdAt: new Date().toISOString() },
    ]);
    const service = new SigningTemplateService(repo, fakeSnowSign());
    const result = await service.rename(actor, 't1', '새이름');
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('remove() deletes an owned template', async () => {
    const repo = fakeRepo([
      { id: 't1', workspaceId: actor.workspaceId, snowsignTemplateId: 's', name: '내것', createdBy: actor.userId, createdAt: new Date().toISOString() },
    ]);
    const service = new SigningTemplateService(repo, fakeSnowSign());
    const result = await service.remove(actor, 't1');
    expect(result).toEqual({ ok: true });
    expect(repo.remove).toHaveBeenCalledWith('t1');
  });
});
```

- [ ] **Step 2: RED 확인**

```bash
pnpm test lib/server/services/__tests__/signing-template.test.ts
```

Expected: FAIL — `Cannot find module '../signing-template'`.

- [ ] **Step 3: 구현**

`lib/server/services/signing-template.ts`:

```ts
import { randomUUID } from 'node:crypto';

import type { PgSigningTemplateRepo } from '@/lib/server/repositories/types';
import type { PgSigningTemplate, SigningTemplateFieldInput } from '@/lib/types/signing';
import { buildSignatureFieldsPayload, validateTemplateFields } from '@/lib/signing/template-fields';
import { SnowSignError, type SnowSignClient } from '@/lib/server/signing/snowsign-client';
import type { Actor, ServiceResult } from './types';

/** 스노우싸인 role 문자열 — 항상 이 두 값 고정(구매사/PG사). 매핑 단계가 없다. */
const ROLE_LABELS = ['구매사', 'PG사'];

export class SigningTemplateService {
  constructor(
    private readonly templateRepo: PgSigningTemplateRepo,
    private readonly snowsign: SnowSignClient,
  ) {}

  /** PDF 업로드용 presigned 세션 발급 — 에디터가 브라우저에서 직접 PUT한다. */
  async createUploadSession(
    _actor: Actor,
    input: { filename: string; contentType: string; sizeBytes: number },
  ): Promise<ServiceResult<{ uploadId: string; uploadUrl: string; fields: Record<string, string> }>> {
    try {
      const s = await this.snowsign.createUploadSession({
        purpose: 'template_document',
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      });
      return { ok: true, uploadId: s.uploadId, uploadUrl: s.uploadUrl, fields: s.fields };
    } catch (e) {
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }
  }

  /**
   * 업로드된 PDF + 배치된 필드로 스노우싸인 템플릿을 만들고 워크스페이스에 등록한다.
   * 역할은 항상 구매사/PG 고정(signers 고정) — roleMapping 단계 없음.
   */
  async createTemplate(
    actor: Actor,
    input: { name: string; documentUploadId: string; fields: SigningTemplateFieldInput[] },
  ): Promise<ServiceResult<{ templateId: string }>> {
    const validation = validateTemplateFields(input.fields);
    if (!validation.ok) return validation;

    let created: { templateId: string };
    try {
      created = await this.snowsign.createTemplate({
        name: input.name,
        documentUploadId: input.documentUploadId,
        signers: ROLE_LABELS,
        signatureFields: buildSignatureFieldsPayload(input.fields),
      });
    } catch (e) {
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SNOWSIGN_ERROR' };
    }

    const templateId = randomUUID();
    await this.templateRepo.create({
      id: templateId,
      workspaceId: actor.workspaceId,
      snowsignTemplateId: created.templateId,
      name: input.name,
      createdBy: actor.userId,
    });
    return { ok: true, templateId };
  }

  /** 워크스페이스의 템플릿 목록. */
  async list(actor: Actor): Promise<ServiceResult<{ templates: PgSigningTemplate[] }>> {
    const templates = await this.templateRepo.listByWorkspace(actor.workspaceId);
    return { ok: true, templates };
  }

  /** 이름 변경 — 소유 워크스페이스만. */
  async rename(actor: Actor, templateId: string, name: string): Promise<ServiceResult> {
    const owned = await this.requireOwned(templateId, actor.workspaceId);
    if (!owned.ok) return owned;
    await this.templateRepo.updateName(templateId, name);
    return { ok: true };
  }

  /**
   * 하드 삭제 — 우리 링크 행만 지운다. 스노우싸인 원본 템플릿(수정 API가 없어 재사용
   * 불가)은 고아로 남되 무해.
   */
  async remove(actor: Actor, templateId: string): Promise<ServiceResult> {
    const owned = await this.requireOwned(templateId, actor.workspaceId);
    if (!owned.ok) return owned;
    await this.templateRepo.remove(templateId);
    return { ok: true };
  }

  private async requireOwned(
    templateId: string,
    workspaceId: string,
  ): Promise<{ ok: true; template: PgSigningTemplate } | { ok: false; error: string }> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) return { ok: false, error: 'TEMPLATE_NOT_FOUND' };
    if (template.workspaceId !== workspaceId) return { ok: false, error: 'FORBIDDEN' };
    return { ok: true, template };
  }
}

// ─── Factory (QuoteTemplateService 패턴 미러) ────────────────────────────
declare global {
  var __bidit_signing_template_service__: SigningTemplateService | undefined;
}

export async function getSigningTemplateService(): Promise<SigningTemplateService> {
  if (!globalThis.__bidit_signing_template_service__) {
    const { getPgSigningTemplateRepo } = await import('@/lib/server/repositories/factory');
    const { getSnowSignClient } = await import('@/lib/server/signing/snowsign-client');
    const templateRepo = await getPgSigningTemplateRepo();
    globalThis.__bidit_signing_template_service__ = new SigningTemplateService(
      templateRepo,
      getSnowSignClient(),
    );
  }
  return globalThis.__bidit_signing_template_service__!;
}

export function __resetSigningTemplateServiceForTest(): void {
  globalThis.__bidit_signing_template_service__ = undefined;
}

export function __setSigningTemplateServiceForTest(service: SigningTemplateService): void {
  globalThis.__bidit_signing_template_service__ = service;
}
```

- [ ] **Step 4: GREEN 확인**

```bash
pnpm test lib/server/services/__tests__/signing-template.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/server/services/signing-template.ts lib/server/services/__tests__/signing-template.test.ts
git commit -m "feat(signing): SigningTemplateService — 템플릿 CRUD"
```

---

### Task 6: `ContractSigningService.sendFromTemplate` — 임베드 없는 발송

**Files:**
- Modify: `lib/server/services/contract-signing.ts`
- Modify: `lib/server/services/__tests__/contract-signing.test.ts`

**Interfaces:**
- Consumes: `PgSigningTemplateRepo`(Task 2, 신규 생성자 파라미터), `SnowSignClient.createContractFromTemplate`/`sendContract`(Task 4).
- Produces: `ContractSigningService.sendFromTemplate(rfpId, actor): Promise<ServiceResult>` — Task 9(서버 액션)이 소비. **주의**: 생성자 시그니처가 바뀐다(`templateRepo` 파라미터 추가) — 모든 호출부(팩토리, 테스트)를 함께 갱신해야 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/server/services/__tests__/contract-signing.test.ts`의 기존 `describe('ContractSigningService', ...)` 블록 안, 다른 `describe('createSendEmbedSession', ...)` 옆에 새 블록 추가:

```ts
describe('sendFromTemplate', () => {
  it('sends via SnowSign create-contract-from-template + send, and marks the contract sent', async () => {
    const env = await seedAwaitingContract(); // 기존 파일에 이미 있는 헬퍼 — awaiting_pg_template 계약 + 낙찰 bid 준비
    const templateRepo = fakeTemplateRepo([
      { id: 'tpl1', workspaceId: env.pgWsId, snowsignTemplateId: 'sst1', name: '표준', createdBy: env.pgUserId, createdAt: new Date().toISOString() },
    ]);
    await db.update(bids).set({ signingTemplateId: 'tpl1' }).where(eq(bids.id, env.awardedBidId));

    const client = mockClient({
      createContractFromTemplate: vi.fn(async () => ({ contractId: 'c1', status: 'draft' })),
      sendContract: vi.fn(async () => ({ contractId: 'c1', status: 'pending', sentAt: '2026-01-01T00:00:00Z' })),
    });
    const service = await buildService(client, templateRepo);

    const result = await service.sendFromTemplate(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId });

    expect(result).toEqual({ ok: true });
    const [row] = await db.select().from(signingContracts).where(eq(signingContracts.rfpId, env.rfpId));
    expect(row.status).toBe('sent');
    expect(row.providerRef).toBe('c1');
  });

  it('returns NO_LINKED_TEMPLATE when the awarded bid has no signingTemplateId', async () => {
    const env = await seedAwaitingContract();
    const service = await buildService(mockClient(), fakeTemplateRepo());

    const result = await service.sendFromTemplate(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId });

    expect(result).toEqual({ ok: false, error: 'NO_LINKED_TEMPLATE' });
  });

  it('returns FORBIDDEN for a non-party actor', async () => {
    const env = await seedAwaitingContract();
    const service = await buildService(mockClient(), fakeTemplateRepo());

    const result = await service.sendFromTemplate(env.rfpId, { userId: 'stranger', workspaceId: 'stranger-ws' });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('reuses an already-created providerRef on retry instead of creating a new draft', async () => {
    const env = await seedAwaitingContract();
    const templateRepo = fakeTemplateRepo([
      { id: 'tpl1', workspaceId: env.pgWsId, snowsignTemplateId: 'sst1', name: '표준', createdBy: env.pgUserId, createdAt: new Date().toISOString() },
    ]);
    await db.update(bids).set({ signingTemplateId: 'tpl1' }).where(eq(bids.id, env.awardedBidId));
    await db
      .update(signingContracts)
      .set({ providerRef: 'already-created' })
      .where(eq(signingContracts.rfpId, env.rfpId));

    const createSpy = vi.fn();
    const client = mockClient({
      createContractFromTemplate: createSpy,
      sendContract: vi.fn(async () => ({ contractId: 'already-created', status: 'pending' })),
    });
    const service = await buildService(client, templateRepo);

    const result = await service.sendFromTemplate(env.rfpId, { userId: env.pgUserId, workspaceId: env.pgWsId });

    expect(result).toEqual({ ok: true });
    expect(createSpy).not.toHaveBeenCalled();
  });
});
```

이 테스트는 `seedAwaitingContract()`라는 헬퍼가 파일에 이미 존재한다고 가정한다 — 없다면(파일을 먼저 Read해서 확인) 기존 `describe('cancel', ...)` 등에서 쓰는 awaiting 계약 seed 로직을 참고해 다음 형태로 최상단 helper 구역에 추가한다:

```ts
async function seedAwaitingContract() {
  const buyer = await seedUser(db);
  const buyerWs = await seedBuyerWorkspace(db, 'sft-buyer');
  await seedMembership(db, buyer.id, buyerWs.id);
  const pgUser = await seedUser(db);
  const pgWs = await seedPgWorkspace(db, 'sft-pg');
  await seedMembership(db, pgUser.id, pgWs.id);
  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id, status: 'awarded' });
  const awardedBidId = randomUUID();
  await db.insert(bids).values({
    id: awardedBidId,
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    invitationId: (await db.insert(rfpInvitations).values({ id: randomUUID(), rfpId: rfp.id, pgWsId: pgWs.id, status: 'accepted', tokenHash: 'x' }).returning())[0].id,
    settleCycle: 'D+1',
    submittedBy: pgUser.id,
    status: 'awarded',
  });
  await db.update(rfps).set({ awardedBidId }).where(eq(rfps.id, rfp.id));
  const contractId = randomUUID();
  await db.insert(signingContracts).values({
    id: contractId,
    rfpId: rfp.id,
    status: 'awaiting_pg_template',
    round: 1,
    createdBy: buyer.id,
  });
  return { rfpId: rfp.id, buyerWsId: buyerWs.id, pgWsId: pgWs.id, pgUserId: pgUser.id, awardedBidId, contractId };
}

function fakeTemplateRepo(seed: import('@/lib/types/signing').PgSigningTemplate[] = []) {
  return {
    create: vi.fn(),
    findById: vi.fn(async (id: string) => seed.find((r) => r.id === id)),
    listByWorkspace: vi.fn(async (wsId: string) => seed.filter((r) => r.workspaceId === wsId)),
    updateName: vi.fn(),
    remove: vi.fn(),
  };
}
```

`buildService`도 `templateRepo` 파라미터를 받도록 갱신(Step 3에서 함께 처리).

- [ ] **Step 2: RED 확인**

```bash
pnpm test lib/server/services/__tests__/contract-signing.test.ts -t sendFromTemplate
```

Expected: FAIL — `service.sendFromTemplate is not a function`.

- [ ] **Step 3: 테스트 하네스 갱신 (생성자 시그니처 변경 반영)**

`buildService()` 헬퍼를 다음과 같이 갱신(새 `templateRepo` 파라미터, 기본값은 빈 fake):

```ts
async function buildService(
  client: SnowSignClient,
  templateRepo: PgSigningTemplateRepo = fakeTemplateRepo(),
): Promise<ContractSigningService> {
  const [signingRepo, rfpRepo, bidRepo, userRepo, wsRepo, auditRepo] =
    await Promise.all([
      getSigningContractRepo(),
      getRfpRepo(),
      getBidRepo(),
      getUserRepo(),
      getWorkspaceRepo(),
      getAuditLogRepo(),
    ]);
  return new ContractSigningService(
    db,
    signingRepo,
    rfpRepo,
    bidRepo,
    userRepo,
    wsRepo,
    auditRepo,
    client,
    templateRepo,
  );
}
```

파일 안에 `new ContractSigningService(...)`를 직접 호출하는 다른 지점(예: 약 2232번째 줄)도 같은 순서로 `templateRepo` 인자를 마지막에 추가한다 — 파일에서 `new ContractSigningService(` 전체를 검색해 빠짐없이 갱신할 것.

`PgSigningTemplateRepo` 타입을 파일 상단 import에 추가.

- [ ] **Step 4: 서비스 생성자 + `sendFromTemplate` 구현**

`lib/server/services/contract-signing.ts` 상단 import에 추가:

```ts
import type { PgSigningTemplateRepo } from '@/lib/server/repositories/types';
```

(기존 `AuditLogRepo, BidRepo, RfpRepo, SigningContractRepo, UserRepo, WorkspaceRepo` type import 블록에 `PgSigningTemplateRepo` 추가하는 형태로 합쳐도 된다.)

생성자에 파라미터 추가(마지막 `snowsign` 다음):

```ts
export class ContractSigningService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly signingRepo: SigningContractRepo,
    private readonly rfpRepo: RfpRepo,
    private readonly bidRepo: BidRepo,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly auditRepo: AuditLogRepo,
    private readonly snowsign: SnowSignClient,
    private readonly templateRepo: PgSigningTemplateRepo,
  ) {}
```

`onAward` 메서드 뒤 어딘가(예: `createSendEmbedSession` 다음)에 새 메서드 추가:

```ts
  /**
   * 연결된 템플릿으로 발송 — 임베드 없이 서버 API 2회(create-contract-from-template
   * + send)로 끝난다. 인터랙티브 세션이 없어 하트비트·이어받기는 필요 없지만, 두
   * 동료가 동시에 눌렀을 때 스노우싸인에 초안이 두 개 쌓이는 것은 막아야 한다 —
   * 기존 발송 리스 claim/release를 그대로 재사용한다(하트비트 없이 claim→작업→
   * release 한 번. 성공하면 markSentIfAwaiting이 awaiting을 벗어나 claim 자체가
   * 의미를 잃는다).
   */
  async sendFromTemplate(rfpId: string, actor: Actor): Promise<ServiceResult> {
    const rfp = await this.rfpRepo.findById(rfpId);
    if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
    if ((await this.resolvePartyByRfp(rfp, actor)) !== 'pg') return { ok: false, error: 'FORBIDDEN' };

    const active = await this.signingRepo.findActiveByRfp(rfpId);
    if (!active) return { ok: false, error: 'CONTRACT_NOT_FOUND' };
    if (active.status !== 'awaiting_pg_template') return { ok: false, error: 'ALREADY_SENT' };

    if (!rfp.awardedBidId) return { ok: false, error: 'NO_LINKED_TEMPLATE' };
    const bid = await this.bidRepo.findById(rfp.awardedBidId);
    if (!bid || !bid.signingTemplateId) return { ok: false, error: 'NO_LINKED_TEMPLATE' };
    const template = await this.templateRepo.findById(bid.signingTemplateId);
    if (!template || template.workspaceId !== actor.workspaceId) {
      return { ok: false, error: 'NO_LINKED_TEMPLATE' };
    }

    const now = new Date();
    const claimed = await this.signingRepo.claimForSend(
      active.id,
      now,
      new Date(now.getTime() - EMBED_SEND_LEASE_MS),
      actor.userId,
    );
    if (!claimed) return { ok: false, error: 'SEND_HELD_BY_TEAMMATE' };

    const buyerContact = await this.userRepo.findContactById(rfp.createdBy);
    const pgContact = await this.userRepo.findContactById(actor.userId);
    if (!buyerContact || !pgContact) {
      await this.releaseClaimQuietly(active.id, now);
      return { ok: false, error: 'CONTACT_NOT_FOUND' };
    }

    try {
      // 재시도 시 이미 만든 draft가 있으면 재사용 — create를 다시 부르지 않는다
      // (부분 실패로 스노우싸인 쪽에 초안이 여러 개 쌓이는 것을 막는다).
      let providerRef = active.providerRef;
      if (!providerRef) {
        const created = await this.snowsign.createContractFromTemplate(template.snowsignTemplateId, {
          title: `${rfp.title} 계약서`,
          participants: [
            { role: '구매사', name: buyerContact.name, email: buyerContact.email },
            { role: 'PG사', name: pgContact.name, email: pgContact.email },
          ],
        });
        providerRef = created.contractId;
        await this.signingRepo.patchContract(active.id, { providerRef });
      }

      const sent = await this.snowsign.sendContract(providerRef);
      const sentAt = sent.sentAt ?? new Date().toISOString();
      const participants: SigningParticipant[] = [
        {
          id: randomUUID(),
          contractId: active.id,
          userId: rfp.createdBy,
          name: buyerContact.name,
          email: buyerContact.email,
          role: 'buyer',
          securityMethod: 'email',
          status: 'pending',
        },
        {
          id: randomUUID(),
          contractId: active.id,
          userId: actor.userId,
          name: pgContact.name,
          email: pgContact.email,
          role: 'pg',
          securityMethod: 'email',
          status: 'pending',
        },
      ];

      const pendingEmits: Notification[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this._db.transaction(async (tx: any) => {
        const ok = await this.signingRepo.markSentIfAwaiting(active.id, { sentAt }, tx);
        if (!ok) throw new ContractNoLongerAwaitingError();
        await this.signingRepo.insertParticipants(participants, tx);
        await this.auditRepo.insert(
          {
            actorUserId: actor.userId,
            actorWorkspaceId: actor.workspaceId,
            action: 'signing.sent',
            entityType: 'rfp',
            entityId: rfp.code,
            metadata: { contractId: active.id, providerRef, source: 'template' },
          },
          tx,
        );
        for (const rcpt of await this.bothPartyRecipients(rfp, bid.pgWsId, tx)) {
          pendingEmits.push(
            ...(await notify(tx, {
              recipients: [rcpt],
              channels: ['inapp'],
              type: 'signing.sent',
              title: `[${rfp.code}] 전자서명이 시작됐어요`,
              body: '이메일로 받은 링크에서 서명을 진행해 주세요.',
              linkUrl: `/rfp/${rfp.code}`,
            })),
          );
        }
      });
      emitAfterCommit(pendingEmits);
      flushAfterCommit();
      return { ok: true };
    } catch (e) {
      if (e instanceof ContractNoLongerAwaitingError) {
        return { ok: false, error: 'CONTRACT_CHANGED' };
      }
      await this.releaseClaimQuietly(active.id, now);
      logger.error('signing.send_from_template_failed', { contractId: active.id, err: String(e) });
      captureSigningError('signing.send_from_template_failed', e, {
        contractId: active.id,
        rfpCode: rfp.code,
      });
      return { ok: false, error: e instanceof SnowSignError ? e.code : 'SEND_FAILED' };
    }
  }

  private async releaseClaimQuietly(contractId: string, claimedAt: Date): Promise<void> {
    try {
      await this.signingRepo.releaseSendClaim(contractId, claimedAt);
    } catch (re) {
      logger.warn('signing.release_claim_failed', { contractId, err: String(re) });
    }
  }
```

`RFP` 타입에 `title` 필드가 있는지 확인 필요 — 없다면(파일을 먼저 확인) `rfp.title` 대신 존재하는 필드명(예: `rfp.subject`)으로 맞춘다.

- [ ] **Step 5: 팩토리 함수 갱신**

`getContractSigningService()`의 `Promise.all` import 목록에 `getPgSigningTemplateRepo` 추가하고, 리포지토리 조회 목록에 추가하고, 생성자 호출 마지막 인자로 넘긴다:

```ts
export async function getContractSigningService(): Promise<ContractSigningService> {
  if (!globalThis.__bidit_contract_signing_service__) {
    const [
      { db },
      {
        getSigningContractRepo,
        getRfpRepo,
        getBidRepo,
        getUserRepo,
        getWorkspaceRepo,
        getAuditLogRepo,
        getPgSigningTemplateRepo,
      },
      { getSnowSignClient },
    ] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/server/repositories/factory'),
      import('@/lib/server/signing/snowsign-client'),
    ]);
    const [signingRepo, rfpRepo, bidRepo, userRepo, wsRepo, auditRepo, templateRepo] =
      await Promise.all([
        getSigningContractRepo(),
        getRfpRepo(),
        getBidRepo(),
        getUserRepo(),
        getWorkspaceRepo(),
        getAuditLogRepo(),
        getPgSigningTemplateRepo(),
      ]);
    globalThis.__bidit_contract_signing_service__ = new ContractSigningService(
      db,
      signingRepo,
      rfpRepo,
      bidRepo,
      userRepo,
      wsRepo,
      auditRepo,
      getSnowSignClient(),
      templateRepo,
    );
  }
  return globalThis.__bidit_contract_signing_service__!;
}
```

- [ ] **Step 6: GREEN 확인**

```bash
pnpm test lib/server/services/__tests__/contract-signing.test.ts
```

Expected: PASS 전체(신규 4개 + 기존 전부 — 생성자 시그니처 변경이 기존 케이스를 깨지 않았는지 확인).

- [ ] **Step 7: Commit**

```bash
git add lib/server/services/contract-signing.ts lib/server/services/__tests__/contract-signing.test.ts
git commit -m "feat(signing): ContractSigningService.sendFromTemplate — 임베드 없는 발송"
```

---

### Task 7: 템플릿 CRUD 서버 액션

**Files:**
- Create: `lib/server/actions/signing/createSigningTemplateUploadSessionAction.ts`
- Create: `lib/server/actions/signing/createSigningTemplateAction.ts`
- Create: `lib/server/actions/signing/listSigningTemplatesAction.ts`
- Create: `lib/server/actions/signing/renameSigningTemplateAction.ts`
- Create: `lib/server/actions/signing/deleteSigningTemplateAction.ts`
- Test: `lib/server/actions/signing/__tests__/signing-template-actions.test.ts`

**Interfaces:**
- Consumes: `SigningTemplateService`(Task 5), `requirePgActor`(기존 `_session.ts`).
- Produces: 5개 서버 액션 — Task 12(관리 화면)가 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/server/actions/signing/__tests__/signing-template-actions.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/actions/_session', () => ({
  requirePgActor: vi.fn(),
}));

import { requirePgActor } from '@/lib/server/actions/_session';
import {
  __setSigningTemplateServiceForTest,
  __resetSigningTemplateServiceForTest,
} from '@/lib/server/services/signing-template';
import { createSigningTemplateUploadSessionAction } from '../createSigningTemplateUploadSessionAction';
import { createSigningTemplateAction } from '../createSigningTemplateAction';
import { listSigningTemplatesAction } from '../listSigningTemplatesAction';
import { renameSigningTemplateAction } from '../renameSigningTemplateAction';
import { deleteSigningTemplateAction } from '../deleteSigningTemplateAction';

const actor = { ok: true as const, userId: 'u1', workspaceId: 'ws1', email: 'u1@example.com' };

function fakeService(overrides: Record<string, unknown> = {}) {
  return {
    createUploadSession: vi.fn(async () => ({ ok: true, uploadId: 'u', uploadUrl: 'https://x', fields: {} })),
    createTemplate: vi.fn(async () => ({ ok: true, templateId: 't1' })),
    list: vi.fn(async () => ({ ok: true, templates: [] })),
    rename: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(requirePgActor).mockResolvedValue(actor);
});
afterEach(() => {
  __resetSigningTemplateServiceForTest();
  vi.clearAllMocks();
});

describe('signing template actions', () => {
  it('createSigningTemplateUploadSessionAction() delegates to the service with the resolved actor', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await createSigningTemplateUploadSessionAction({
      filename: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
    });

    expect(result).toEqual({ ok: true, uploadId: 'u', uploadUrl: 'https://x', fields: {} });
    expect(service.createUploadSession).toHaveBeenCalledWith(
      { userId: 'u1', workspaceId: 'ws1' },
      { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10 },
    );
  });

  it('createSigningTemplateAction() rejects invalid input without calling the service', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await createSigningTemplateAction({ name: '', documentUploadId: 'u', fields: [] });

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(service.createTemplate).not.toHaveBeenCalled();
  });

  it('createSigningTemplateAction() delegates valid input to the service', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await createSigningTemplateAction({
      name: '표준',
      documentUploadId: 'upl_1',
      fields: [
        { id: 'f1', type: 'signature', party: 'buyer', pageNumber: 1, x: 0, y: 0, width: 10, height: 10 },
      ],
    });

    expect(result).toEqual({ ok: true, templateId: 't1' });
  });

  it('listSigningTemplatesAction() returns the actor workspace templates', async () => {
    const service = fakeService({ list: vi.fn(async () => ({ ok: true, templates: [{ id: 't1' }] })) });
    __setSigningTemplateServiceForTest(service as never);

    const result = await listSigningTemplatesAction();

    expect(result).toEqual({ ok: true, templates: [{ id: 't1' }] });
  });

  it('renameSigningTemplateAction() rejects an empty name', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await renameSigningTemplateAction({ templateId: 't1', name: '' });

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(service.rename).not.toHaveBeenCalled();
  });

  it('deleteSigningTemplateAction() delegates to the service', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await deleteSigningTemplateAction({ templateId: 't1' });

    expect(result).toEqual({ ok: true });
    expect(service.remove).toHaveBeenCalledWith({ userId: 'u1', workspaceId: 'ws1' }, 't1');
  });

  it('propagates FORBIDDEN_PG when the session is not a PG actor', async () => {
    vi.mocked(requirePgActor).mockResolvedValue({ ok: false, error: 'FORBIDDEN_PG' });
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await listSigningTemplatesAction();

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
    expect(service.list).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: RED 확인**

```bash
pnpm test lib/server/actions/signing/__tests__/signing-template-actions.test.ts
```

Expected: FAIL — 액션 파일들이 아직 없음.

- [ ] **Step 3: 5개 액션 구현**

`lib/server/actions/signing/createSigningTemplateUploadSessionAction.ts`:

```ts
'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({
    filename: z.string().min(1),
    contentType: z.literal('application/pdf'),
    sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  })
  .strict();

/** 계약서 템플릿 PDF 업로드용 presigned 세션 발급. */
export async function createSigningTemplateUploadSessionAction(
  input: z.input<typeof Input>,
): Promise<ActionResult<{ uploadId: string; uploadUrl: string; fields: Record<string, string> }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getSigningTemplateService();
  return service.createUploadSession(
    { userId: actor.userId, workspaceId: actor.workspaceId },
    parsed.data,
  );
}
```

`lib/server/actions/signing/createSigningTemplateAction.ts`:

```ts
'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import type { ActionResult } from '@/lib/server/actions/_result';

const FieldInput = z
  .object({
    id: z.string().min(1),
    type: z.enum(['signature', 'name', 'date', 'text']),
    party: z.enum(['buyer', 'pg']),
    pageNumber: z.number().int().positive(),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();

const Input = z
  .object({
    name: z.string().min(1).max(80),
    documentUploadId: z.string().min(1),
    fields: z.array(FieldInput).min(1),
  })
  .strict();

/** 배치된 필드로 스노우싸인 템플릿을 만들고 워크스페이스에 등록한다. */
export async function createSigningTemplateAction(
  input: z.input<typeof Input>,
): Promise<ActionResult<{ templateId: string }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getSigningTemplateService();
  return service.createTemplate(
    { userId: actor.userId, workspaceId: actor.workspaceId },
    parsed.data,
  );
}
```

`lib/server/actions/signing/listSigningTemplatesAction.ts`:

```ts
'use server';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import type { PgSigningTemplate } from '@/lib/types/signing';
import type { ActionResult } from '@/lib/server/actions/_result';

/** 세션의 PG 워크스페이스가 보유한 계약서 템플릿 목록. */
export async function listSigningTemplatesAction(): Promise<
  ActionResult<{ templates: PgSigningTemplate[] }>
> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;

  const service = await getSigningTemplateService();
  return service.list({ userId: actor.userId, workspaceId: actor.workspaceId });
}
```

`lib/server/actions/signing/renameSigningTemplateAction.ts`:

```ts
'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ templateId: z.string().min(1), name: z.string().min(1).max(80) }).strict();

/** 계약서 템플릿 이름 변경 — 소유 워크스페이스만. */
export async function renameSigningTemplateAction(
  input: z.input<typeof Input>,
): Promise<ActionResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getSigningTemplateService();
  return service.rename(
    { userId: actor.userId, workspaceId: actor.workspaceId },
    parsed.data.templateId,
    parsed.data.name,
  );
}
```

`lib/server/actions/signing/deleteSigningTemplateAction.ts`:

```ts
'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ templateId: z.string().min(1) }).strict();

/** 계약서 템플릿 삭제(하드) — 소유 워크스페이스만. 견적 사전 선택은 SET NULL로 풀린다. */
export async function deleteSigningTemplateAction(
  input: z.input<typeof Input>,
): Promise<ActionResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getSigningTemplateService();
  return service.remove({ userId: actor.userId, workspaceId: actor.workspaceId }, parsed.data.templateId);
}
```

- [ ] **Step 4: GREEN 확인**

```bash
pnpm test lib/server/actions/signing/__tests__/signing-template-actions.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/server/actions/signing/createSigningTemplateUploadSessionAction.ts lib/server/actions/signing/createSigningTemplateAction.ts lib/server/actions/signing/listSigningTemplatesAction.ts lib/server/actions/signing/renameSigningTemplateAction.ts lib/server/actions/signing/deleteSigningTemplateAction.ts lib/server/actions/signing/__tests__/signing-template-actions.test.ts
git commit -m "feat(signing): 계약서 템플릿 CRUD 서버 액션"
```

---

### Task 8: `sendSigningContractFromTemplateAction`

**Files:**
- Create: `lib/server/actions/signing/sendSigningContractFromTemplateAction.ts`
- Test: `lib/server/actions/signing/__tests__/sendSigningContractFromTemplateAction.test.ts`

**Interfaces:**
- Consumes: `ContractSigningService.sendFromTemplate`(Task 6).
- Produces: `sendSigningContractFromTemplateAction` — Task 11(SigningTab)이 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/server/actions/signing/__tests__/sendSigningContractFromTemplateAction.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/actions/_session', () => ({ requirePgActor: vi.fn() }));
vi.mock('@/lib/server/repositories/factory', () => ({ getRfpRepo: vi.fn() }));
vi.mock('@/lib/server/services/contract-signing', () => ({ getContractSigningService: vi.fn() }));

import { requirePgActor } from '@/lib/server/actions/_session';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { sendSigningContractFromTemplateAction } from '../sendSigningContractFromTemplateAction';

const actor = { ok: true as const, userId: 'u1', workspaceId: 'ws1', email: 'u1@example.com' };

beforeEach(() => {
  vi.mocked(requirePgActor).mockResolvedValue(actor);
});
afterEach(() => vi.clearAllMocks());

describe('sendSigningContractFromTemplateAction', () => {
  it('resolves the rfp by code and delegates sendFromTemplate to the service', async () => {
    vi.mocked(getRfpRepo).mockResolvedValue({
      findByCode: vi.fn(async () => ({ id: 'rfp-uuid' })),
    } as never);
    const sendFromTemplate = vi.fn(async () => ({ ok: true }));
    vi.mocked(getContractSigningService).mockResolvedValue({ sendFromTemplate } as never);

    const result = await sendSigningContractFromTemplateAction({ rfpCode: 'P-2608-0001' });

    expect(result).toEqual({ ok: true });
    expect(sendFromTemplate).toHaveBeenCalledWith('rfp-uuid', { userId: 'u1', workspaceId: 'ws1' });
  });

  it('returns RFP_NOT_FOUND when the code does not resolve', async () => {
    vi.mocked(getRfpRepo).mockResolvedValue({ findByCode: vi.fn(async () => undefined) } as never);

    const result = await sendSigningContractFromTemplateAction({ rfpCode: 'missing' });

    expect(result).toEqual({ ok: false, error: 'RFP_NOT_FOUND' });
  });
});
```

- [ ] **Step 2: RED 확인**

```bash
pnpm test lib/server/actions/signing/__tests__/sendSigningContractFromTemplateAction.test.ts
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`lib/server/actions/signing/sendSigningContractFromTemplateAction.ts`(기존 `issueSigningSendEmbedSessionAction.ts` 패턴 그대로):

```ts
'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ rfpCode: z.string().min(1) }).strict();

/**
 * 딜룸 계약 탭 — 낙찰 견적에 연결된 템플릿으로 임베드 없이 발송한다.
 * ACL(낙찰 PG)·상태(awaiting)·템플릿 연결 여부는 서비스가 검증한다.
 */
export async function sendSigningContractFromTemplateAction(
  input: { rfpCode: string },
): Promise<ActionResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };

  const service = await getContractSigningService();
  return service.sendFromTemplate(rfp.id, { userId: actor.userId, workspaceId: actor.workspaceId });
}
```

- [ ] **Step 4: GREEN 확인**

```bash
pnpm test lib/server/actions/signing/__tests__/sendSigningContractFromTemplateAction.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/actions/signing/sendSigningContractFromTemplateAction.ts lib/server/actions/signing/__tests__/sendSigningContractFromTemplateAction.test.ts
git commit -m "feat(signing): 템플릿 발송 서버 액션"
```

---

### Task 9: Bid 리포지토리/액션 — `signingTemplateId` 영속화

**Files:**
- Modify: `lib/server/repositories/types.ts` (`Bid` 타입에 `signingTemplateId` 추가 — 이미 있다면 스킵)
- Modify: `lib/server/repositories/drizzle/bid.ts`
- Modify: `lib/server/actions/bid/submitBidAction.ts`
- Test: 기존 `lib/server/repositories/drizzle/__tests__/bid.test.ts`, `lib/server/actions/bid/__tests__/submitBid.test.ts`에 케이스 추가

**Interfaces:**
- Consumes: `bids.signingTemplateId`(Task 1).
- Produces: `Bid.signingTemplateId` — Task 10(로더)·Task 6(서비스, 이미 사용)이 소비.

- [ ] **Step 1: 실패하는 테스트 추가**

`lib/server/repositories/drizzle/__tests__/bid.test.ts`에 기존 `save()` 테스트 옆에 추가(파일을 먼저 Read해서 `BID_COLUMNS`/`rowToBid` 존재를 확인한 뒤 진행):

```ts
it('save() persists signingTemplateId and findById() round-trips it', async () => {
  const { db, repo } = await setup(); // 기존 파일의 setup 헬퍼 재사용
  const ws = await seedPgWorkspace(db, 'bid.tpl');
  const buyerWs = await seedBuyerWorkspace(db, 'bid.tpl.buyer');
  const user = await seedUser(db);
  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: user.id });
  const invitation = await seedInvitation(db, rfp.id, ws.id); // 파일에 이미 있는 헬퍼 이름을 확인해 맞출 것

  await repo.save({
    id: 'aaaaaaaa-0000-4000-8000-0000000000aa',
    rfpId: rfp.id,
    pgWsId: ws.id,
    invitationId: invitation.id,
    settleCycle: 'D+1',
    settleLimit: 0,
    guaranteeInsurance: 0,
    signupFee: 0,
    paymentFees: {},
    customFees: {},
    memo: '',
    round: 1,
    status: 'submitted',
    submittedBy: user.id,
    signingTemplateId: 'bbbbbbbb-0000-4000-8000-0000000000bb', // FK 없는 uuid라도 PGlite는 FK 검증하므로, 실제로는 seed된 pg_signing_templates row id를 넣는다
    // ...
  });

  const found = await repo.findById('aaaaaaaa-0000-4000-8000-0000000000aa');
  expect(found?.signingTemplateId).toBe('bbbbbbbb-0000-4000-8000-0000000000bb');
});
```

이 테스트는 `signingTemplateId`가 FK라 존재하는 `pg_signing_templates` 행을 먼저 seed해야 한다 — 실제 작성 시 `DrizzlePgSigningTemplateRepository`로 템플릿 하나를 만들고 그 id를 쓰도록 고친다(위 스텁은 방향성 예시). **파일을 먼저 Read해서 `Bid` 저장 테스트의 정확한 필드 목록·seed 헬퍼 이름을 확인한 뒤 맞춰 쓸 것.**

- [ ] **Step 2: RED 확인**

```bash
pnpm test lib/server/repositories/drizzle/__tests__/bid.test.ts
```

Expected: FAIL — `signingTemplateId`가 `Bid` 타입/저장 로직에 없어 타입 에러 또는 `undefined`.

- [ ] **Step 3: 구현**

`lib/server/repositories/types.ts`의 `Bid` 타입(별도 `lib/types/bid.ts`에 있을 수 있음 — 실제 위치를 확인)에 `signingTemplateId?: string;` 추가.

`lib/server/repositories/drizzle/bid.ts`의 `BID_COLUMNS`에 `signingTemplateId: bids.signingTemplateId,` 추가, `rowToBid`에 `signingTemplateId: row.signingTemplateId ?? undefined,` 추가, `save()`의 insert values에 `signingTemplateId: bid.signingTemplateId ?? null,` 추가.

`lib/server/actions/bid/submitBidAction.ts`의 zod Input 스키마에 `signingTemplateId: z.string().uuid().optional(),` 추가하고, 서비스 호출 payload에 그대로 전달.

- [ ] **Step 4: GREEN 확인**

```bash
pnpm test lib/server/repositories/drizzle/__tests__/bid.test.ts lib/server/actions/bid/__tests__/submitBid.test.ts
```

Expected: PASS 전체(기존 케이스 포함).

- [ ] **Step 5: Commit**

```bash
git add lib/server/repositories/types.ts lib/server/repositories/drizzle/bid.ts lib/server/actions/bid/submitBidAction.ts lib/server/repositories/drizzle/__tests__/bid.test.ts lib/server/actions/bid/__tests__/submitBid.test.ts
git commit -m "feat(signing): bids.signingTemplateId 영속화"
```

---

### Task 10: 로더 통합 — BidWizard용 템플릿 목록 + 딜룸용 연결된 템플릿

**Files:**
- Modify: `lib/server/rfp-detail-loader.ts`
- Test: 기존 `lib/server/__tests__/rfp-detail-loader-signing.test.ts`에 케이스 추가

**Interfaces:**
- Consumes: `PgSigningTemplateRepo.listByWorkspace`(Task 2), `bid.signingTemplateId`(Task 9).
- Produces: `PgRfpDetailData.signingTemplates: PgSigningTemplate[]`(BidWizard용), `PgRfpDetailData.linkedSigningTemplateName: string | null`(딜룸 표시·view-model용) — Task 11·13이 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

기존 `lib/server/__tests__/rfp-detail-loader-signing.test.ts`를 먼저 Read해서 구조를 파악한 뒤, 같은 스타일로 추가:

```ts
it('loadPgRfpDetail() surfaces the workspace signing templates for the BidWizard picker', async () => {
  // 기존 파일의 env 셋업 재사용 + pgSigningTemplate 리포로 템플릿 1개 생성
  // ...
  const detail = await loadPgRfpDetail({ code: rfp.code, workspaceId: pgWs.id, userId: pgUser.id });
  expect(detail?.signingTemplates.map((t) => t.name)).toContain('표준 계약서');
});

it('loadPgRfpDetail() surfaces the linked template name when the awarded bid has one', async () => {
  // awardedToMe=true 인 env + myBid.signingTemplateId 세팅
  // ...
  const detail = await loadPgRfpDetail({ code: rfp.code, workspaceId: pgWs.id, userId: pgUser.id });
  expect(detail?.linkedSigningTemplateName).toBe('표준 계약서');
});

it('loadPgRfpDetail() returns null linkedSigningTemplateName when the awarded bid has no template', async () => {
  const detail = await loadPgRfpDetail({ code: rfp.code, workspaceId: pgWs.id, userId: pgUser.id });
  expect(detail?.linkedSigningTemplateName).toBeNull();
});
```

(정확한 함수 시그니처·env 셋업은 기존 파일을 Read해서 그대로 맞춘다 — 이 플랜은 방향성만 제공한다.)

- [ ] **Step 2: RED 확인**

```bash
pnpm test lib/server/__tests__/rfp-detail-loader-signing.test.ts
```

Expected: FAIL — `signingTemplates`/`linkedSigningTemplateName`이 `undefined`.

- [ ] **Step 3: 구현**

`lib/server/rfp-detail-loader.ts`의 `PgRfpDetailData` 타입에 추가:

```ts
  /** 워크스페이스가 보유한 계약서 템플릿 — BidWizard 선택용. */
  signingTemplates: PgSigningTemplate[];
  /** awardedToMe && myBid.signingTemplateId가 가리키는 템플릿 이름. 없으면 null. */
  linkedSigningTemplateName: string | null;
```

`loadPgRfpDetail` 본문에서(기존 `signing` 로딩 근처):

```ts
  const { getPgSigningTemplateRepo } = await import('@/lib/server/repositories/factory');
  const templateRepo = await getPgSigningTemplateRepo();
  const signingTemplates = await templateRepo.listByWorkspace(workspaceId);

  let linkedSigningTemplateName: string | null = null;
  if (awardedToMe && myBid?.signingTemplateId) {
    const linked = await templateRepo.findById(myBid.signingTemplateId);
    linkedSigningTemplateName = linked?.name ?? null;
  }
```

반환 객체에 `signingTemplates, linkedSigningTemplateName` 추가.

- [ ] **Step 4: GREEN 확인**

```bash
pnpm test lib/server/__tests__/rfp-detail-loader-signing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/rfp-detail-loader.ts lib/server/__tests__/rfp-detail-loader-signing.test.ts
git commit -m "feat(signing): 로더가 워크스페이스 템플릿 목록 + 연결된 템플릿명을 노출"
```

---

### Task 11: `signing-view-model.ts` — `sendFromTemplate` 액션 추가

**Files:**
- Modify: `components/deal-room/signing/signing-view-model.ts`
- Modify: `components/deal-room/signing/__tests__/signing-view-model.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수, 새 파라미터만 추가).
- Produces: `SigningActionId`에 `'sendFromTemplate'` 추가, `buildSigningCardView(signing, side, opts?: { linkedTemplateName?: string | null })` — Task 12(SigningTab)가 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`signing-view-model.test.ts`의 `awaiting_pg_template` 케이스들 옆에 추가:

```ts
it('awaiting_pg_template + pg + linked template shows a sendFromTemplate action before upload', () => {
  const view = buildSigningCardView(makeSigning('awaiting_pg_template', []), 'pg', {
    linkedTemplateName: '표준 계약서',
  });
  expect(view.actions.map((a) => a.id)).toEqual(['sendFromTemplate', 'upload', 'recover']);
  expect(view.actions[0]).toMatchObject({ label: '연결된 템플릿으로 보내기' });
});

it('awaiting_pg_template + pg + no linked template keeps the existing upload/recover actions only', () => {
  const view = buildSigningCardView(makeSigning('awaiting_pg_template', []), 'pg');
  expect(view.actions.map((a) => a.id)).toEqual(['upload', 'recover']);
});

it('awaiting_pg_template + buyer ignores linkedTemplateName (no actions either way)', () => {
  const view = buildSigningCardView(makeSigning('awaiting_pg_template', []), 'buyer', {
    linkedTemplateName: '표준 계약서',
  });
  expect(view.actions).toEqual([]);
});
```

(`makeSigning` 같은 테스트 헬퍼가 파일에 이미 있다면 그대로 재사용 — 파일을 먼저 Read해서 정확한 헬퍼 이름/시그니처를 확인할 것.)

- [ ] **Step 2: RED 확인**

```bash
pnpm test components/deal-room/signing/__tests__/signing-view-model.test.ts
```

Expected: FAIL — 새 파라미터가 없어 `sendFromTemplate` 액션이 안 나옴.

- [ ] **Step 3: 구현**

`SigningActionId` 유니온에 `'sendFromTemplate'` 추가:

```ts
export type SigningActionId = 'remind' | 'cancel' | 'resend' | 'upload' | 'recover' | 'sendFromTemplate';
```

`buildSigningCardView` 시그니처에 세 번째 옵션 파라미터 추가:

```ts
export function buildSigningCardView(
  signing: SigningView,
  side: SigningSide,
  opts?: { linkedTemplateName?: string | null },
): SigningCardView {
```

`case 'awaiting_pg_template':` 블록의 `actions: isPg ? [...] : []` 부분을 다음처럼 바꾼다(기존 `upload`/`recover` 배열 앞에 조건부로 삽입):

```ts
        actions: isPg
          ? [
              ...(opts?.linkedTemplateName
                ? [
                    {
                      id: 'sendFromTemplate' as const,
                      label: '연결된 템플릿으로 보내기',
                      variant: 'filled' as const,
                      okMsg: '계약서를 보냈어요',
                      failMsg: '계약서를 보내지 못했어요',
                    },
                  ]
                : []),
              {
                id: 'upload',
                label: '계약서 올리기',
                variant: 'filled',
                okMsg: '계약서를 보냈어요',
                failMsg: '계약서를 보내지 못했어요',
              },
              { id: 'recover', label: '보낸 계약서 찾기', variant: 'text' },
            ]
          : [],
```

`buildSigningSummary`도 세 번째 파라미터를 그대로 받아 `buildSigningCardView`에 전달하도록 시그니처 확장:

```ts
export function buildSigningSummary(
  signing: SigningView,
  side: SigningSide,
  opts?: { linkedTemplateName?: string | null },
): { label: string; dot: ChipColor; signed?: number; total?: number } {
  const { chip } = buildSigningCardView(signing, side, opts);
```

- [ ] **Step 4: GREEN 확인**

```bash
pnpm test components/deal-room/signing/__tests__/signing-view-model.test.ts
```

Expected: PASS 전체(기존 8상태×2역할 매트릭스 케이스 포함 — `opts` 생략 시 기존 동작과 동일해야 한다).

- [ ] **Step 5: Commit**

```bash
git add components/deal-room/signing/signing-view-model.ts components/deal-room/signing/__tests__/signing-view-model.test.ts
git commit -m "feat(signing): 뷰모델에 sendFromTemplate 액션 추가"
```

---

### Task 12: `SigningTab` 배선

**Files:**
- Modify: `components/deal-room/signing/SigningTab.tsx`
- Modify: `components/deal-room/signing/__tests__/SigningTab.test.tsx`

**Interfaces:**
- Consumes: `sendSigningContractFromTemplateAction`(Task 8), `buildSigningCardView` 확장(Task 11), `linkedSigningTemplateName`(Task 10, props로 전달됨 — 상위 `DealRoomCenter`/`PgDealRoomBody`가 loader 결과를 그대로 내려준다는 전제. **이 전달 배선은 별도 확인이 필요** — `PgDealRoomBody.tsx`/`DealRoomCenter.tsx`가 `signing`을 `SigningTab`에 넘기는 지점을 찾아 `linkedSigningTemplateName`도 같은 경로로 prop을 추가해야 한다. 이 태스크에서 함께 처리한다).

- [ ] **Step 1: 실패하는 테스트 작성**

`SigningTab.test.tsx`를 먼저 Read해서 기존 `onAction`/`case 'upload'` 테스트 패턴을 파악한 뒤, 같은 스타일로 추가:

```tsx
it('awaiting_pg_template + linked template: clicking "연결된 템플릿으로 보내기" calls sendSigningContractFromTemplateAction and refreshes on success', async () => {
  vi.mocked(sendSigningContractFromTemplateAction).mockResolvedValue({ ok: true });
  render(
    <SigningTab
      rfpCode="P-2608-0001"
      side="pg"
      signing={{ contract: awaitingContract, participants: [] }}
      linkedSigningTemplateName="표준 계약서"
      /* ...기존 필수 props */
    />,
  );

  await userEvent.click(screen.getByRole('button', { name: '연결된 템플릿으로 보내기' }));

  expect(sendSigningContractFromTemplateAction).toHaveBeenCalledWith({ rfpCode: 'P-2608-0001' });
  await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
});

it('awaiting_pg_template + linked template: failure shows the failMsg toast without refreshing', async () => {
  vi.mocked(sendSigningContractFromTemplateAction).mockResolvedValue({ ok: false, error: 'SNOWSIGN_ERROR' });
  render(/* 위와 동일 */);

  await userEvent.click(screen.getByRole('button', { name: '연결된 템플릿으로 보내기' }));

  expect(await screen.findByText('계약서를 보내지 못했어요')).toBeInTheDocument();
});
```

(`vi.mock`, 라우터 refresh 스파이, 필수 props 목록은 파일에 이미 있는 것을 그대로 재사용 — 정확한 이름은 실제 파일을 Read해서 맞출 것.)

- [ ] **Step 2: RED 확인**

```bash
pnpm test components/deal-room/signing/__tests__/SigningTab.test.tsx
```

Expected: FAIL — `linkedSigningTemplateName` prop 없음 / 버튼 없음 / import 없음.

- [ ] **Step 3: 구현**

`SigningTab.tsx`:

1. import 추가: `import { sendSigningContractFromTemplateAction } from '@/lib/server/actions/signing/sendSigningContractFromTemplateAction';`
2. Props 타입에 `linkedSigningTemplateName?: string | null;` 추가.
3. `buildSigningCardView(signing, side)` 호출을 `buildSigningCardView(signing, side, { linkedTemplateName: linkedSigningTemplateName })`로 교체(뷰모델을 쓰는 지점이 한 곳 이상이면 전부).
4. `onAction`의 `switch (a.id)`에 케이스 추가(기존 `case 'upload':` 앞 또는 뒤):

```ts
      case 'sendFromTemplate':
        void run(() => sendSigningContractFromTemplateAction({ rfpCode }), a);
        break;
```

(`run(...)` 헬퍼가 기존 `case 'upload':`/`case 'remind':`에서 쓰는 것과 동일한 이름·시그니처라는 전제 — 실제 파일의 헬퍼 이름을 그대로 따를 것. 성공 시 토스트(`a.okMsg`) + `router.refresh()`, 실패 시 `a.failMsg` 토스트를 내는 기존 패턴을 그대로 재사용한다.)

- [ ] **Step 4: 상위 컴포넌트에서 `linkedSigningTemplateName` prop 전달**

`components/deal-room/pg/PgDealRoomBody.tsx`(또는 `SigningTab`을 렌더하는 실제 상위 컴포넌트 — `DealRoomCenter.tsx`도 확인)에서 `signing` prop을 넘기는 지점을 찾아, 같은 자리에서 `linkedSigningTemplateName={data.linkedSigningTemplateName}`을 함께 전달하도록 수정한다(Task 10에서 로더가 이미 이 필드를 `PgRfpDetailData`에 채워둔 상태).

- [ ] **Step 5: GREEN 확인**

```bash
pnpm test components/deal-room/signing components/deal-room/pg
```

Expected: PASS 전체.

- [ ] **Step 6: Commit**

```bash
git add components/deal-room/signing/SigningTab.tsx components/deal-room/signing/__tests__/SigningTab.test.tsx components/deal-room/pg/PgDealRoomBody.tsx
git commit -m "feat(signing): SigningTab에 템플릿 발송 액션 배선"
```

---

### Task 13: 신규 의존성 추가 — `pdfjs-dist` + `react-rnd`

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: Task 14(에디터)가 소비하는 두 라이브러리.

TDD 하드룰 면제 대상(순수 설정/의존성 추가, 동작 없음).

- [ ] **Step 1: 설치**

```bash
pnpm add pdfjs-dist react-rnd
```

- [ ] **Step 2: 확인**

```bash
pnpm tsc --noEmit
```

Expected: 에러 없음(아직 아무도 새 패키지를 import하지 않으므로 순수 설치 확인).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(signing): pdfjs-dist + react-rnd 의존성 추가"
```

---

### Task 14: 순수 로직 — 필드 편집 리듀서 (드래그/리사이즈 좌표 계산)

에디터 컴포넌트(Task 15)가 쓸 상태 전이 로직을 먼저 순수 함수로 뽑아 TDD 대상으로 만든다. 포인터 이벤트 배선 자체(Task 15)는 이 리듀서를 감싸는 얇은 어댑터가 된다.

**Files:**
- Create: `components/contract-templates/template-editor-state.ts`
- Test: `components/contract-templates/__tests__/template-editor-state.test.ts`

**Interfaces:**
- Consumes: `SigningTemplateFieldInput`, `SigningTemplateFieldType`, `SigningTemplateFieldParty`(Task 1).
- Produces: `addField`, `moveField`, `resizeField`, `removeField`, `clampToPage` — Task 15가 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`components/contract-templates/__tests__/template-editor-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addField, clampToPage, moveField, removeField, resizeField } from '../template-editor-state';
import type { SigningTemplateFieldInput } from '@/lib/types/signing';

const PAGE = { width: 600, height: 800 };

function field(overrides: Partial<SigningTemplateFieldInput> = {}): SigningTemplateFieldInput {
  return { id: 'f1', type: 'signature', party: 'buyer', pageNumber: 1, x: 10, y: 10, width: 120, height: 50, ...overrides };
}

describe('addField', () => {
  it('appends a new field with the default size for its type, centered-ish on the page', () => {
    const fields = addField([], { type: 'signature', party: 'buyer', pageNumber: 1 }, PAGE);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ type: 'signature', party: 'buyer', pageNumber: 1, width: 120, height: 50 });
  });

  it('uses the name/text/date default size (140x24)', () => {
    const fields = addField([], { type: 'text', party: 'pg', pageNumber: 2 }, PAGE);
    expect(fields[0]).toMatchObject({ width: 140, height: 24 });
  });
});

describe('moveField', () => {
  it('updates x/y and clamps within the page bounds', () => {
    const fields = [field({ x: 10, y: 10 })];
    const moved = moveField(fields, 'f1', { x: -5, y: 1000 }, PAGE);
    expect(moved[0].x).toBe(0); // clamped to 0
    expect(moved[0].y).toBe(PAGE.height - moved[0].height); // clamped to bottom
  });

  it('is a no-op for an unknown field id', () => {
    const fields = [field()];
    expect(moveField(fields, 'missing', { x: 1, y: 1 }, PAGE)).toEqual(fields);
  });
});

describe('resizeField', () => {
  it('updates width/height with a minimum of 20x16', () => {
    const fields = [field({ width: 120, height: 50 })];
    const resized = resizeField(fields, 'f1', { width: 5, height: 2 });
    expect(resized[0]).toMatchObject({ width: 20, height: 16 });
  });
});

describe('removeField', () => {
  it('removes the field with the given id', () => {
    const fields = [field({ id: 'f1' }), field({ id: 'f2' })];
    expect(removeField(fields, 'f1').map((f) => f.id)).toEqual(['f2']);
  });
});

describe('clampToPage', () => {
  it('clamps a rect to stay within the page', () => {
    expect(clampToPage({ x: -10, y: -10, width: 50, height: 50 }, PAGE)).toEqual({ x: 0, y: 0, width: 50, height: 50 });
    expect(clampToPage({ x: 590, y: 790, width: 50, height: 50 }, PAGE)).toEqual({
      x: PAGE.width - 50,
      y: PAGE.height - 50,
      width: 50,
      height: 50,
    });
  });
});
```

- [ ] **Step 2: RED 확인**

```bash
pnpm test components/contract-templates/__tests__/template-editor-state.test.ts
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`components/contract-templates/template-editor-state.ts`:

```ts
import { randomUUID } from 'crypto';
import type {
  SigningTemplateFieldInput,
  SigningTemplateFieldParty,
  SigningTemplateFieldType,
} from '@/lib/types/signing';

export type PageSize = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** API 예시 기준 기본 크기. */
const DEFAULT_SIZE: Record<SigningTemplateFieldType, { width: number; height: number }> = {
  signature: { width: 120, height: 50 },
  name: { width: 140, height: 24 },
  text: { width: 140, height: 24 },
  date: { width: 120, height: 24 },
};

const MIN_WIDTH = 20;
const MIN_HEIGHT = 16;

export function clampToPage(rect: Rect, page: PageSize): Rect {
  const width = Math.min(rect.width, page.width);
  const height = Math.min(rect.height, page.height);
  return {
    width,
    height,
    x: Math.max(0, Math.min(rect.x, page.width - width)),
    y: Math.max(0, Math.min(rect.y, page.height - height)),
  };
}

export function addField(
  fields: SigningTemplateFieldInput[],
  input: { type: SigningTemplateFieldType; party: SigningTemplateFieldParty; pageNumber: number },
  page: PageSize,
): SigningTemplateFieldInput[] {
  const { width, height } = DEFAULT_SIZE[input.type];
  const centered = clampToPage(
    { x: (page.width - width) / 2, y: (page.height - height) / 2, width, height },
    page,
  );
  return [
    ...fields,
    {
      id: randomUUID(),
      type: input.type,
      party: input.party,
      pageNumber: input.pageNumber,
      ...centered,
    },
  ];
}

export function moveField(
  fields: SigningTemplateFieldInput[],
  id: string,
  pos: { x: number; y: number },
  page: PageSize,
): SigningTemplateFieldInput[] {
  return fields.map((f) => {
    if (f.id !== id) return f;
    const clamped = clampToPage({ x: pos.x, y: pos.y, width: f.width, height: f.height }, page);
    return { ...f, x: clamped.x, y: clamped.y };
  });
}

export function resizeField(
  fields: SigningTemplateFieldInput[],
  id: string,
  size: { width: number; height: number },
): SigningTemplateFieldInput[] {
  return fields.map((f) =>
    f.id === id
      ? { ...f, width: Math.max(MIN_WIDTH, size.width), height: Math.max(MIN_HEIGHT, size.height) }
      : f,
  );
}

export function removeField(fields: SigningTemplateFieldInput[], id: string): SigningTemplateFieldInput[] {
  return fields.filter((f) => f.id !== id);
}
```

브라우저 번들에서 `node:crypto`의 `randomUUID`가 클라이언트 컴포넌트에서 동작하지 않는다면(빌드 확인 필요), `crypto.randomUUID()`(Web Crypto, 브라우저 전역)로 교체한다 — Step 5의 dev 서버 확인에서 검증.

- [ ] **Step 4: GREEN 확인**

```bash
pnpm test components/contract-templates/__tests__/template-editor-state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/contract-templates/template-editor-state.ts components/contract-templates/__tests__/template-editor-state.test.ts
git commit -m "feat(signing): 템플릿 에디터 필드 상태 리듀서"
```

---

### Task 15: `ContractTemplateEditor` — PDF 렌더링 + 드래그앤드롭 배치 + 저장

**Files:**
- Create: `components/contract-templates/ContractTemplateEditor.tsx`
- Test: `components/contract-templates/__tests__/ContractTemplateEditor.test.tsx`

**Interfaces:**
- Consumes: `template-editor-state.ts`(Task 14), `createSigningTemplateUploadSessionAction`/`createSigningTemplateAction`(Task 7), `pdfjs-dist`/`react-rnd`(Task 13).
- Produces: `<ContractTemplateEditor onSaved={(templateId) => void} onCancel={() => void} />` — Task 16(관리 화면)이 소비.

이 컴포넌트는 시각/인터랙션 비중이 커서 TDD 하드룰의 "시각/스타일만 손대는 변경" 면제에 걸치지 않는다(상태·핸들러·저장 로직이 있으므로 비예외) — 저장 트리거와 검증 실패 처리를 테스트로 고정하고, PDF 렌더링 자체는 브라우저 수동 QA로 확인한다(pdf.js의 canvas 렌더링은 jsdom에서 의미 있게 검증되지 않는다).

- [ ] **Step 1: 실패하는 테스트 작성**

`components/contract-templates/__tests__/ContractTemplateEditor.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/server/actions/signing/createSigningTemplateUploadSessionAction', () => ({
  createSigningTemplateUploadSessionAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/createSigningTemplateAction', () => ({
  createSigningTemplateAction: vi.fn(),
}));
// pdf.js는 jsdom에서 canvas 렌더링이 무의미하므로 페이지 수/뷰포트만 흉내내는 얇은 mock을 쓴다.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getViewport: () => ({ width: 600, height: 800 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }),
}));

import { createSigningTemplateUploadSessionAction } from '@/lib/server/actions/signing/createSigningTemplateUploadSessionAction';
import { createSigningTemplateAction } from '@/lib/server/actions/signing/createSigningTemplateAction';
import { ContractTemplateEditor } from '../ContractTemplateEditor';

beforeEach(() => {
  vi.mocked(createSigningTemplateUploadSessionAction).mockResolvedValue({
    ok: true,
    uploadId: 'upl_1',
    uploadUrl: 'https://example.com/upload',
    fields: {},
  });
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe('ContractTemplateEditor', () => {
  it('disables save until both a buyer and a pg signable field are placed', async () => {
    render(<ContractTemplateEditor onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('calls createSigningTemplateAction with the placed fields and reports onSaved on success', async () => {
    vi.mocked(createSigningTemplateAction).mockResolvedValue({ ok: true, templateId: 't1' });
    const onSaved = vi.fn();
    render(<ContractTemplateEditor onSaved={onSaved} onCancel={vi.fn()} />);

    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('계약서 PDF'), file);
    await waitFor(() => expect(createSigningTemplateUploadSessionAction).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: '구매사 서명' }));
    await userEvent.click(screen.getByRole('button', { name: 'PG사 서명' }));
    await userEvent.type(screen.getByLabelText('템플릿 이름'), '표준 계약서');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(createSigningTemplateAction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '표준 계약서',
          documentUploadId: 'upl_1',
          fields: expect.arrayContaining([
            expect.objectContaining({ party: 'buyer', type: 'signature' }),
            expect.objectContaining({ party: 'pg', type: 'signature' }),
          ]),
        }),
      ),
    );
    expect(onSaved).toHaveBeenCalledWith('t1');
  });
});
```

- [ ] **Step 2: RED 확인**

```bash
pnpm test components/contract-templates/__tests__/ContractTemplateEditor.test.tsx
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`components/contract-templates/ContractTemplateEditor.tsx`:

```tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import { Rnd } from 'react-rnd';
import * as pdfjsLib from 'pdfjs-dist';

import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { toast } from '@/lib/toast';
import { createSigningTemplateUploadSessionAction } from '@/lib/server/actions/signing/createSigningTemplateUploadSessionAction';
import { createSigningTemplateAction } from '@/lib/server/actions/signing/createSigningTemplateAction';
import { addField, clampToPage, moveField, removeField, resizeField, type PageSize } from './template-editor-state';
import { validateTemplateFields } from '@/lib/signing/template-fields';
import type {
  SigningTemplateFieldInput,
  SigningTemplateFieldParty,
  SigningTemplateFieldType,
} from '@/lib/types/signing';

// pdf.js 워커 — Next.js는 워커 파일을 정적 자산으로 서빙해야 한다. 번들러가 처리하도록
// import.meta.url 기반 워커를 쓴다(pdfjs-dist v4+ 표준 패턴).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const FIELD_TOOLS: { type: SigningTemplateFieldType; party: SigningTemplateFieldParty; label: string }[] = [
  { type: 'signature', party: 'buyer', label: '구매사 서명' },
  { type: 'signature', party: 'pg', label: 'PG사 서명' },
  { type: 'name', party: 'buyer', label: '구매사 이름' },
  { type: 'name', party: 'pg', label: 'PG사 이름' },
  { type: 'date', party: 'buyer', label: '구매사 날짜' },
  { type: 'date', party: 'pg', label: 'PG사 날짜' },
  { type: 'text', party: 'buyer', label: '구매사 텍스트' },
  { type: 'text', party: 'pg', label: 'PG사 텍스트' },
];

type Props = { onSaved: (templateId: string) => void; onCancel: () => void };

export function ContractTemplateEditor({ onSaved, onCancel }: Props) {
  const [name, setName] = useState('');
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [pages, setPages] = useState<PageSize[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [fields, setFields] = useState<SigningTemplateFieldInput[]>([]);
  const [saving, setSaving] = useState(false);

  const page = pages[currentPage - 1];
  const canSave = useMemo(
    () => !!uploadId && !!name.trim() && validateTemplateFields(fields).ok,
    [uploadId, name, fields],
  );

  const handleUpload = useCallback(async (file: File) => {
    const session = await createSigningTemplateUploadSessionAction({
      filename: file.name,
      contentType: 'application/pdf',
      sizeBytes: file.size,
    });
    if (!session.ok) {
      toast('업로드 세션을 만들지 못했어요', { type: 'error' });
      return;
    }
    setUploadId(session.uploadId);

    const form = new FormData();
    for (const [k, v] of Object.entries(session.fields)) form.append(k, v);
    form.append('file', file);
    const put = await fetch(session.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': 'application/pdf' } });
    if (!put.ok) {
      toast('PDF 업로드에 실패했어요', { type: 'error' });
      return;
    }

    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const sizes: PageSize[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const p = await doc.getPage(i);
      const vp = p.getViewport({ scale: 1 });
      sizes.push({ width: vp.width, height: vp.height });
    }
    setPages(sizes);
    setCurrentPage(1);
  }, []);

  const handleAddField = useCallback(
    (type: SigningTemplateFieldType, party: SigningTemplateFieldParty) => {
      if (!page) return;
      setFields((f) => addField(f, { type, party, pageNumber: currentPage }, page));
    },
    [page, currentPage],
  );

  const handleSave = useCallback(async () => {
    if (!uploadId || !canSave) return;
    setSaving(true);
    const result = await createSigningTemplateAction({ name: name.trim(), documentUploadId: uploadId, fields });
    setSaving(false);
    if (!result.ok) {
      toast('템플릿을 저장하지 못했어요', { type: 'error' });
      return;
    }
    toast('템플릿을 저장했어요');
    onSaved(result.templateId);
  }, [uploadId, canSave, name, fields, onSaved]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <Label htmlFor="tpl-name">템플릿 이름</Label>
        <input
          id="tpl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-[6px] border px-2 py-1 text-sm"
        />
        <Label htmlFor="tpl-pdf">계약서 PDF</Label>
        <input
          id="tpl-pdf"
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
      </div>

      {pages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {FIELD_TOOLS.map((tool) => (
            <button
              key={`${tool.type}-${tool.party}`}
              type="button"
              onClick={() => handleAddField(tool.type, tool.party)}
              className="rounded-[6px] border px-2 py-1 text-xs"
            >
              {tool.label}
            </button>
          ))}
        </div>
      )}

      {pages.map((p, idx) => {
        const pageNumber = idx + 1;
        return (
          <div
            key={pageNumber}
            data-page={pageNumber}
            style={{ position: 'relative', width: p.width, height: p.height }}
            className="border"
            onMouseEnter={() => setCurrentPage(pageNumber)}
          >
            {fields
              .filter((f) => f.pageNumber === pageNumber)
              .map((f) => (
                <Rnd
                  key={f.id}
                  size={{ width: f.width, height: f.height }}
                  position={{ x: f.x, y: f.y }}
                  bounds="parent"
                  onDragStop={(_e, d) => setFields((prev) => moveField(prev, f.id, { x: d.x, y: d.y }, p))}
                  onResizeStop={(_e, _dir, ref) =>
                    setFields((prev) =>
                      resizeField(prev, f.id, {
                        width: parseInt(ref.style.width, 10),
                        height: parseInt(ref.style.height, 10),
                      }),
                    )
                  }
                >
                  <div className="flex h-full w-full items-center justify-between border bg-white/70 px-1 text-[10px]">
                    <span>{f.party === 'buyer' ? '구매사' : 'PG사'} {f.type}</span>
                    <button type="button" onClick={() => setFields((prev) => removeField(prev, f.id))}>
                      x
                    </button>
                  </div>
                </Rnd>
              ))}
          </div>
        );
      })}

      <div className="flex justify-end gap-2">
        <Button variant="text" onClick={onCancel}>
          취소
        </Button>
        <Button disabled={!canSave || saving} onClick={handleSave}>
          저장
        </Button>
      </div>
    </div>
  );
}
```

`_e`/`_dir`/`clampToPage`(react-rnd의 `bounds="parent"`가 시각적 클램핑을 대신하므로 직접 호출은 생략, 저장 시 서버 검증은 별도)는 실제 빌드/타입체크에서 미사용 경고가 나면 정리한다. `Button`/`Label` 컴포넌트의 정확한 props(variant 값 등)는 기존 컴포넌트를 Read해서 맞춘다.

- [ ] **Step 4: GREEN 확인**

```bash
pnpm test components/contract-templates/__tests__/ContractTemplateEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 5: 브라우저 수동 QA**

```bash
pnpm dev
```

`/contract-templates`(Task 16에서 라우트 생성 후)에서 실제 PDF를 업로드해 페이지가 렌더링되고 필드를 드래그·리사이즈할 수 있는지 확인한다. **주의**: 이 태스크 시점엔 아직 라우트가 없으므로, Task 16 완료 후 이 QA를 다시 수행하는 것으로 미뤄도 된다 — 지금은 컴포넌트 테스트 그린만으로 충분하다.

- [ ] **Step 6: Commit**

```bash
git add components/contract-templates/ContractTemplateEditor.tsx components/contract-templates/__tests__/ContractTemplateEditor.test.tsx
git commit -m "feat(signing): 계약서 템플릿 PDF 에디터"
```

---

### Task 16: 템플릿 관리 화면 + 내비게이션

**Files:**
- Create: `app/(app)/contract-templates/page.tsx`
- Create: `components/contract-templates/ContractTemplateList.tsx`
- Test: `components/contract-templates/__tests__/ContractTemplateList.test.tsx`
- Modify: `lib/nav/nav-config.ts`

**Interfaces:**
- Consumes: `listSigningTemplatesAction`/`renameSigningTemplateAction`/`deleteSigningTemplateAction`(Task 7), `ContractTemplateEditor`(Task 15).

- [ ] **Step 1: 실패하는 테스트 작성**

`components/contract-templates/__tests__/ContractTemplateList.test.tsx`(기존 `QuoteTemplateList.test.tsx`를 Read해서 동일한 mock 패턴을 따를 것):

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/server/actions/signing/deleteSigningTemplateAction', () => ({
  deleteSigningTemplateAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/renameSigningTemplateAction', () => ({
  renameSigningTemplateAction: vi.fn(),
}));

import { deleteSigningTemplateAction } from '@/lib/server/actions/signing/deleteSigningTemplateAction';
import { ContractTemplateList } from '../ContractTemplateList';

const initialTemplates = [
  { id: 't1', workspaceId: 'ws1', snowsignTemplateId: 's1', name: '표준 계약서', createdBy: 'u1', createdAt: '2026-01-01T00:00:00Z' },
];

describe('ContractTemplateList', () => {
  it('renders the initial templates', () => {
    render(<ContractTemplateList initialTemplates={initialTemplates} />);
    expect(screen.getByText('표준 계약서')).toBeInTheDocument();
  });

  it('shows the editor when "새 템플릿 만들기" is clicked', async () => {
    render(<ContractTemplateList initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    expect(screen.getByLabelText('템플릿 이름')).toBeInTheDocument();
  });

  it('deletes a template and removes it from the list', async () => {
    vi.mocked(deleteSigningTemplateAction).mockResolvedValue({ ok: true });
    render(<ContractTemplateList initialTemplates={initialTemplates} />);

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(screen.queryByText('표준 계약서')).not.toBeInTheDocument());
    expect(deleteSigningTemplateAction).toHaveBeenCalledWith({ templateId: 't1' });
  });
});
```

- [ ] **Step 2: RED 확인**

```bash
pnpm test components/contract-templates/__tests__/ContractTemplateList.test.tsx
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`components/contract-templates/ContractTemplateList.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/primitives/PageHeader';
import { Button } from '@/components/primitives/Button';
import { toast } from '@/lib/toast';
import { deleteSigningTemplateAction } from '@/lib/server/actions/signing/deleteSigningTemplateAction';
import { ContractTemplateEditor } from './ContractTemplateEditor';
import type { PgSigningTemplate } from '@/lib/types/signing';

type Props = { initialTemplates: PgSigningTemplate[] };

export function ContractTemplateList({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [editing, setEditing] = useState(false);

  const handleDelete = async (id: string) => {
    const result = await deleteSigningTemplateAction({ templateId: id });
    if (!result.ok) {
      toast('삭제하지 못했어요', { type: 'error' });
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast('템플릿을 삭제했어요');
  };

  if (editing) {
    return (
      <ContractTemplateEditor
        onCancel={() => setEditing(false)}
        onSaved={(templateId) => {
          setEditing(false);
          setTemplates((prev) => [
            ...prev,
            { id: templateId, workspaceId: '', snowsignTemplateId: '', name: '', createdBy: '', createdAt: new Date().toISOString() },
          ]);
        }}
      />
    );
  }

  return (
    <>
      <PageHeader title="계약서 템플릿" count={templates.length}>
        <Button onClick={() => setEditing(true)}>새 템플릿 만들기</Button>
      </PageHeader>
      <ul className="flex flex-col gap-2 p-4">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center justify-between border-b py-2">
            <span>{t.name}</span>
            <Button variant="text" danger onClick={() => void handleDelete(t.id)}>
              삭제
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
```

(`onSaved`에서 서버가 돌려주는 건 `templateId` 뿐이므로 이름 등 나머지 필드가 비어 보일 수 있다 — 저장 성공 후 `listSigningTemplatesAction()`을 다시 불러 목록을 새로고침하는 편이 더 정확하다. 구현 시 `router.refresh()` 또는 재조회로 교체 검토. `PageHeader`/`Button`의 정확한 props(`danger` 등)는 기존 컴포넌트를 Read해서 맞춘다.)

`app/(app)/contract-templates/page.tsx`(`quote-templates/page.tsx` 패턴 그대로):

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listSigningTemplatesAction } from '@/lib/server/actions/signing/listSigningTemplatesAction';
import { PageEnter } from '@/components/primitives/PageEnter';
import { ContractTemplateList } from '@/components/contract-templates/ContractTemplateList';

export const dynamic = 'force-dynamic';

export default async function ContractTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/contract-templates');
  }
  if (session.user.workspaceType !== 'pg') {
    redirect('/home');
  }

  const result = await listSigningTemplatesAction();
  const initialTemplates = result.ok ? result.templates : [];

  return (
    <PageEnter className="flex h-full flex-col">
      <ContractTemplateList initialTemplates={initialTemplates} />
    </PageEnter>
  );
}
```

- [ ] **Step 4: 내비게이션 등록**

`lib/nav/nav-config.ts`에서 `quote-templates` 항목(174번째 줄 부근)을 찾아 바로 아래에 미러링 항목 추가:

```ts
  {
    id: 'contract-templates',
    label: '계약서 템플릿',
    href: '/contract-templates',
    // ...quote-templates 항목의 icon/visibleFor 등 나머지 필드를 동일 스타일로 채운다
  },
```

`if (pathname === '/quote-templates') return [{ label: '견적 템플릿' }];` 옆에 브레드크럼 항목 추가:

```ts
  if (pathname === '/contract-templates') return [{ label: '계약서 템플릿' }];
```

- [ ] **Step 5: GREEN 확인**

```bash
pnpm test components/contract-templates lib/nav
```

Expected: PASS.

- [ ] **Step 6: 브라우저 수동 QA**

```bash
pnpm dev
```

PG 계정으로 로그인해 `/contract-templates`가 사이드바에 나타나는지, 새 템플릿 만들기 → PDF 업로드 → 필드 배치 → 저장까지 실제로 동작하는지 확인한다(스노우싸인 실 API 키가 로컬에 없다면 이 마지막 저장 호출은 `SNOWSIGN_NO_KEY` 에러로 실패하는 게 정상 — 그 앞까지의 UI 흐름만 확인).

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/contract-templates/page.tsx components/contract-templates/ContractTemplateList.tsx components/contract-templates/__tests__/ContractTemplateList.test.tsx lib/nav/nav-config.ts
git commit -m "feat(signing): 계약서 템플릿 관리 화면 + 내비게이션"
```

---

### Task 17: BidWizard — 템플릿 선택 피커

**Files:**
- Modify: `components/inbox/bid-wizard/BidWizard.tsx`
- Modify: `components/inbox/bid-wizard/__tests__/BidWizard.test.tsx`

**Interfaces:**
- Consumes: `PgRfpDetailData.signingTemplates`(Task 10), `submitBidAction`(Task 9, 이미 `signingTemplateId` 지원).

- [ ] **Step 1: 실패하는 테스트 작성**

`BidWizard.test.tsx`의 기존 `templates`(견적 요율표) prop 테스트 옆에 추가(정확한 렌더 헬퍼·필수 props는 파일을 Read해서 맞출 것):

```tsx
it('shows a signing template picker when signingTemplates is non-empty, and includes the selection on submit', async () => {
  vi.mocked(submitBidAction).mockResolvedValue({ ok: true, bidId: 'b1' });
  render(
    <BidWizard
      rfp={rfp}
      buyerName="구매사"
      signingTemplates={[{ id: 'st1', workspaceId: 'ws1', snowsignTemplateId: 's', name: '표준 계약서', createdBy: 'u1', createdAt: '2026-01-01T00:00:00Z' }]}
      /* ...기존 필수 props */
    />,
  );

  await userEvent.selectOptions(screen.getByLabelText('계약서 템플릿'), '표준 계약서');
  /* ...필수 단계 채우기 + 제출 버튼 클릭 (기존 submit 테스트와 동일 절차) */

  expect(submitBidAction).toHaveBeenCalledWith(expect.objectContaining({ signingTemplateId: 'st1' }));
});

it('omits signingTemplateId when no template is selected', async () => {
  vi.mocked(submitBidAction).mockResolvedValue({ ok: true, bidId: 'b1' });
  render(<BidWizard rfp={rfp} buyerName="구매사" signingTemplates={[]} /* ... */ />);
  /* ...제출 */
  expect(submitBidAction).toHaveBeenCalledWith(
    expect.not.objectContaining({ signingTemplateId: expect.anything() }),
  );
});
```

- [ ] **Step 2: RED 확인**

```bash
pnpm test components/inbox/bid-wizard/__tests__/BidWizard.test.tsx
```

Expected: FAIL — `signingTemplates` prop/피커 없음.

- [ ] **Step 3: 구현**

`BidWizard.tsx`:

1. Props 타입에 `signingTemplates?: PgSigningTemplate[];` 추가(`templates?: QuoteTemplateOption[];` 바로 아래), `PgSigningTemplate` 타입 import 추가.
2. 컴포넌트 내부에 상태 추가: `const [signingTemplateId, setSigningTemplateId] = useState<string | undefined>(undefined);`
3. 리뷰 단계(`BidStepReviewContainer` 근처, 제출 직전) UI에 피커 추가:
   ```tsx
   {signingTemplates && signingTemplates.length > 0 && (
     <div>
       <Label htmlFor="signing-template">계약서 템플릿</Label>
       <Select
         id="signing-template"
         value={signingTemplateId ?? ''}
         onChange={(e) => setSigningTemplateId(e.target.value || undefined)}
       >
         <option value="">선택 안 함</option>
         {signingTemplates.map((t) => (
           <option key={t.id} value={t.id}>
             {t.name}
           </option>
         ))}
       </Select>
     </div>
   )}
   ```
4. `submitBidAction` 호출부(기존 `handleSubmit` 안)에 `signingTemplateId` 필드를 조건부로 추가:
   ```ts
   ...(signingTemplateId ? { signingTemplateId } : {}),
   ```

- [ ] **Step 4: GREEN 확인**

```bash
pnpm test components/inbox/bid-wizard
```

Expected: PASS 전체.

- [ ] **Step 5: 상위 페이지에서 `signingTemplates` prop 전달**

`BidWizard`를 렌더하는 페이지(`app/(app)/inbox/[rfpId]/...` 계열 — 정확한 파일은 `grep -rn "signingTemplates\|<BidWizard" app/`으로 확인)에서 `rfp.signingTemplates`(Task 10에서 로더가 채운 값)를 그대로 prop으로 전달한다.

- [ ] **Step 6: 전체 회귀 확인**

```bash
pnpm test
```

Expected: PASS 전체(스위트 전체 그린).

- [ ] **Step 7: Commit**

```bash
git add components/inbox/bid-wizard/BidWizard.tsx components/inbox/bid-wizard/__tests__/BidWizard.test.tsx
git commit -m "feat(signing): BidWizard에 계약서 템플릿 선택 피커 추가"
```

---

## 완료 후 확인

- [ ] `pnpm tsc --noEmit` — 전체 타입체크 그린
- [ ] `pnpm lint` — 전체 린트 그린
- [ ] `pnpm test` — 전체 유닛 테스트 그린
- [ ] 브라우저 수동 QA: PG로 로그인 → `/contract-templates`에서 템플릿 생성(스노우싸인 키가 로컬에 없으면 마지막 저장 호출 전까지) → BidWizard에서 템플릿 선택 → (award 가능한 seed 데이터가 있다면) 딜룸 계약 탭에서 "연결된 템플릿으로 보내기" 버튼 노출 확인
- [ ] `docs/superpowers/specs/2026-08-03-contract-template-reuse-design.md`의 각 절이 대응하는 태스크로 커버됐는지 재확인(Task 1↔데이터 모델, Task 4↔SnowSignClient, Task 6↔부분 실패 처리, Task 11-12↔UI, Task 13-16↔에디터)
