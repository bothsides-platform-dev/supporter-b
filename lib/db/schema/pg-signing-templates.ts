import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './workspaces';
import { users } from './users';

/**
 * PG 가 등록한 재사용 계약서 서식. **두 종류가 한 테이블에 산다** (`kind`):
 *
 *  · `pdf`      — 완성된 PDF 를 올리고 서명칸을 드래그해 배치한 것. 문서와 좌표는
 *                 스노우싸인에 있고 우리는 링크(`snowsign_template_id`)만 든다.
 *  · `composed` — 조항을 직접 작성한 것. **문서가 우리 DB(`document`)에 있고**
 *                 provider 템플릿은 만들지 않는다(딜 값이 딜마다 달라 고정 PDF 로
 *                 표현할 수 없다 — 발송 시점에 렌더해 건별 계약으로 보낸다).
 *
 * 별도 테이블로 가르지 않은 이유: `bids.signing_template_id` 링크가 둘로 갈라지면
 * "어느 쪽이 채워졌나" 불변식이 새로 생기고 견적 위저드 피커도 두 목록을 합쳐야
 * 한다. 좁은 읽기(`findSigningTemplateId`)가 하나로 유지되는 것이 봉인 경계에 낫다.
 */
export const pgSigningTemplates = pgTable(
  'pg_signing_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** `composed` 행에서는 NULL. 유니크 인덱스는 NULL 을 서로 다르게 보므로 공존한다. */
    snowsignTemplateId: text('snowsign_template_id'),
    /** 'pdf' | 'composed'. pgEnum 이 아닌 text — 이 레포는 push-only 라 ALTER TYPE 이 위험하다. */
    kind: text('kind').notNull().default('pdf'),
    /** `composed` 행의 조항 문서(`ContractDoc`). `pdf` 행에서는 NULL. */
    document: jsonb('document'),
    name: text('name').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    /**
     * 마지막 편집 시각. composed 행은 **제자리 편집**되므로 `created_at` 만으로는
     * 언제 바뀌었는지 알 수 없다(PDF 행은 재생성이라 구분이 덜 급하다).
     *
     * ⚠️ 아직 **읽는 화면이 없다** — 목록은 여전히 `created_at` 오름차순이다. 세 UPDATE
     * 경로가 전부 이 값을 올리므로 기록은 정확하고, 최신순 정렬을 붙이려면 여기서
     * 시작하면 된다. 마이그레이션으로 들어온 기존 행은 실제 편집 시각이 아니라
     * **마이그레이션 시각**을 갖는다.
     */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex('pg_signing_templates_ws_template_uniq').on(t.workspaceId, t.snowsignTemplateId),
    index('pg_signing_templates_ws_idx').on(t.workspaceId),
    // 반쪽짜리 행을 **DB 가** 막는다. 주석으로 둔 불변식은 언젠가 깨지고, 깨진
    // 행은 "pdf 인 줄 알았는데 문서가 있는" 조용한 오분류로 나타난다.
    // 스키마 파일에 두는 것이 중요하다 — PGlite 테스트 DDL 이 `lib/db/schema-ddl.ts`
    // 로 여기서 생성되므로, .sql 에만 있으면 테스트가 이 제약을 건드리지 못한다.
    check(
      'pg_signing_templates_kind_shape',
      sql`(kind = 'pdf' and snowsign_template_id is not null and document is null)
          or (kind = 'composed' and snowsign_template_id is null and document is not null)`,
    ),
  ],
);
