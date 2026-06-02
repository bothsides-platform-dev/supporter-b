# Admin App Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `app/admin/`을 메인 앱에서 분리해 독립 Next.js 앱 `admin-supporter-b` 레포로 추출하고, 메인 앱에서는 admin 코드를 제거한다.

**Architecture:** `admin-supporter-b`는 독립 Next.js 16.2.4 앱으로, 같은 Postgres에 직접 연결한다. DB 마이그레이션은 메인 앱만 소유한다. admin 앱은 포트 3001에서 실행되며 Caddy가 `admin.supporter-b.store`로 라우팅한다.

**Tech Stack:** Next.js 16.2.4, React 19, TypeScript strict, Tailwind v4, Drizzle ORM (no drizzle-kit), Jose JWT, Resend, @sentry/nextjs

---

## 전제 조건

- GitHub에 `admin-supporter-b` 레포가 이미 생성되어 있어야 한다 (빈 레포 OK)
- 이 플랜은 메인 앱과 동일한 머신에서 실행 가능하다
- 모든 admin 앱 작업은 새로 클론한 디렉토리에서 수행한다 (`~/project/admin-supporter-b` 기준)

---

## Task 1: 새 레포 초기화 + package.json

**Files:**
- Create: `~/project/admin-supporter-b/package.json`
- Create: `~/project/admin-supporter-b/tsconfig.json`
- Create: `~/project/admin-supporter-b/.gitignore`

- [ ] **Step 1: 레포 클론 및 디렉토리 초기화**

```bash
cd ~/project
git clone git@github.com:bothsides-platform-dev/admin-supporter-b.git
cd admin-supporter-b
```

- [ ] **Step 2: package.json 작성**

```bash
cat > package.json << 'EOF'
{
  "name": "admin-supporter-b",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "@react-email/render": "^0.0.26",
    "@sentry/nextjs": "^10.51.0",
    "clsx": "^2.1.1",
    "drizzle-orm": "^0.45.0",
    "jose": "6",
    "next": "16.2.4",
    "postgres": "^3.4.7",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "resend": "^6.4.0",
    "tailwind-merge": "^3.5.0",
    "tw-animate-css": "^1.4.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.2.4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9.39.4",
    "eslint-config-next": "16.2.4",
    "tailwindcss": "^4.2.4",
    "typescript": "^6.0.3"
  }
}
EOF
```

- [ ] **Step 3: tsconfig.json 복사 (메인 앱에서)**

```bash
cp ~/project/bidit/tsconfig.json tsconfig.json
```

`tsconfig.json`이 복사됐는지 확인:
```bash
cat tsconfig.json | grep '"paths"' 
# "@/*": ["./*"] 가 있어야 함
```

- [ ] **Step 4: .gitignore 작성**

```bash
cp ~/project/bidit/.gitignore .gitignore
```

- [ ] **Step 5: pnpm install**

```bash
pnpm install
```

Expected: `node_modules` 디렉토리 생성, lock file 생성

- [ ] **Step 6: 필수 디렉토리 구조 생성**

```bash
mkdir -p app/login app/'(protected)'/{audit-log,buyers/'[id]',review/'[id]',rfps/'[id]',sellers/'[id]'}
mkdir -p components/primitives
mkdir -p lib/{auth,db/schema,integrations,server/{actions/{admin,auth},outbox/templates,queries/admin,repositories/drizzle}}
mkdir -p lib/types
mkdir -p styles
mkdir -p public/fonts
```

---

## Task 2: DB 스키마 복사 + db/index.ts 생성

**Files:**
- Copy: `lib/db/schema/` (전체 파일)
- Create: `lib/db/index.ts` (client.ts 어댑트)

- [ ] **Step 1: 스키마 파일 전체 복사**

```bash
cp ~/project/bidit/lib/db/schema/*.ts lib/db/schema/
```

복사 확인:
```bash
ls lib/db/schema/
# _enums.ts admin.ts attachment-blobs.ts attachments.ts bids.ts ... 등이 있어야 함
```

- [ ] **Step 2: lib/db/index.ts 작성 (client.ts 어댑트)**

```typescript
// Production Postgres client for admin app.
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var -- global augmentation requires var
  var __admin_pg__: ReturnType<typeof postgres> | undefined;
}

const client =
  globalThis.__admin_pg__ ??
  postgres(process.env.DATABASE_URL!, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__admin_pg__ = client;
}

export const db = drizzle(client, { schema, casing: 'snake_case' });
export type DB = typeof db;
```

파일 경로: `lib/db/index.ts`

---

## Task 3: lib 유틸리티 파일 복사

**Files:**
- Copy: `lib/auth/admin-session.ts`
- Copy: `lib/types/biz-profile.ts`
- Copy: `lib/utils.ts`
- Copy: `lib/integrations/resend.ts`
- Copy: `lib/integrations/admin-email.ts`

- [ ] **Step 1: 파일 복사**

```bash
cp ~/project/bidit/lib/auth/admin-session.ts lib/auth/admin-session.ts
cp ~/project/bidit/lib/types/biz-profile.ts lib/types/biz-profile.ts
cp ~/project/bidit/lib/utils.ts lib/utils.ts
cp ~/project/bidit/lib/integrations/resend.ts lib/integrations/resend.ts
cp ~/project/bidit/lib/integrations/admin-email.ts lib/integrations/admin-email.ts
```

- [ ] **Step 2: admin-session.ts — /admin prefix 제거**

`lib/auth/admin-session.ts`에서:
```
redirect('/admin/login')  →  redirect('/login')
```

```bash
sed -i '' "s|redirect('/admin/login')|redirect('/login')|g" lib/auth/admin-session.ts
grep "redirect" lib/auth/admin-session.ts
# redirect('/login') 이 보여야 함, '/admin/login' 없어야 함
```

---

## Task 4: Outbox + Repository 인프라 복사

**Files:**
- Copy: `lib/server/outbox/post-commit.ts`, `types.ts`, `templates/` (workspaceApproved, workspaceRejected, _layout, types)
- Copy: `lib/server/repositories/drizzle/outbox.ts`
- Create: `lib/server/repositories/types.ts` (최소화 버전)

- [ ] **Step 1: outbox 파일 복사**

```bash
cp ~/project/bidit/lib/server/outbox/post-commit.ts lib/server/outbox/post-commit.ts
cp ~/project/bidit/lib/server/outbox/types.ts lib/server/outbox/types.ts
cp ~/project/bidit/lib/server/outbox/templates/types.ts lib/server/outbox/templates/types.ts
cp ~/project/bidit/lib/server/outbox/templates/_layout.tsx lib/server/outbox/templates/_layout.tsx
cp ~/project/bidit/lib/server/outbox/templates/workspaceApproved.tsx lib/server/outbox/templates/workspaceApproved.tsx
cp ~/project/bidit/lib/server/outbox/templates/workspaceRejected.tsx lib/server/outbox/templates/workspaceRejected.tsx
```

- [ ] **Step 2: DrizzleOutboxRepository 복사 + import 경로 수정**

```bash
cp ~/project/bidit/lib/server/repositories/drizzle/outbox.ts lib/server/repositories/drizzle/outbox.ts
```

`lib/server/repositories/drizzle/outbox.ts`에서 `@/lib/db/client` → `@/lib/db/index`:
```bash
sed -i '' "s|from '@/lib/db/client'|from '@/lib/db/index'|g" lib/server/repositories/drizzle/outbox.ts
grep "from '@/lib/db/" lib/server/repositories/drizzle/outbox.ts
# @/lib/db/index 가 보여야 함
```

- [ ] **Step 3: 최소화된 repositories/types.ts 작성**

admin 앱은 OutboxRepo와 Tx만 필요. PgliteDB 의존성 없음:

```typescript
// Minimal type definitions for admin app — only outbox repo is used.
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { DB } from '@/lib/db/index';
import type { OutboxEntry, OutboxEvent, Sender } from '../outbox/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = DB | PgTransaction<any, any, any>;

export interface OutboxRepo {
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
  pending(limit: number, tx?: Tx): Promise<OutboxEntry[]>;
  markResult(
    id: string,
    result: { ok: true } | { ok: false; error: string },
    tx?: Tx,
  ): Promise<void>;
  flush(
    sender: Sender,
    limit?: number,
    tx?: Tx,
  ): Promise<{ ok: number; failed: number }>;
}
```

파일 경로: `lib/server/repositories/types.ts`

- [ ] **Step 4: post-commit.ts — factory.ts 의존성 제거**

`lib/server/outbox/post-commit.ts`에서 `getOutboxRepo()` (factory.ts 기반)를 직접 초기화로 교체:

```typescript
// Post-commit outbox flush — fire-and-forget after a successful action tx.
import { after } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { db } from '@/lib/db/index';
import { DrizzleOutboxRepository } from '@/lib/server/repositories/drizzle/outbox';
import { getResendSender } from '@/lib/integrations/resend';

const FLUSH_BATCH = 50;

async function doFlush(): Promise<void> {
  try {
    const outbox = new DrizzleOutboxRepository(db);
    await outbox.flush(getResendSender(), FLUSH_BATCH);
  } catch (err) {
    console.error('post-commit flush failed', err);
    Sentry.captureException(err, { extra: { context: 'post-commit-flush' } });
  }
}

export function flushAfterCommit(): void {
  try {
    after(doFlush);
  } catch {
    // Outside a Next.js request scope — no-op.
  }
}
```

---

## Task 5: _shared.ts 복사 + appBaseUrl() 추가

**Files:**
- Create: `lib/server/actions/auth/_shared.ts` (복사 + 수정)

- [ ] **Step 1: _shared.ts 복사**

```bash
cp ~/project/bidit/lib/server/actions/auth/_shared.ts lib/server/actions/auth/_shared.ts
```

- [ ] **Step 2: import 경로 수정 (client → index)**

```bash
sed -i '' "s|from '@/lib/db/client'|from '@/lib/db/index'|g" lib/server/actions/auth/_shared.ts
grep "from '@/lib/db/" lib/server/actions/auth/_shared.ts
# @/lib/db/index 가 보여야 함
```

- [ ] **Step 3: appBaseUrl() 함수 추가**

`lib/server/actions/auth/_shared.ts` 파일에서 `baseUrl()` 함수 다음에 추가:

```typescript
// User-facing app origin — for email links pointing to the MAIN app
// (login, signup). Admin app sets PUBLIC_APP_URL to https://supporter-b.store.
export function appBaseUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    'http://localhost:3000'
  );
}
```

`baseUrl()` 함수 바로 뒤에 삽입. 이 함수는 사용자 대상 이메일(승인/거부)의 `/login`, `/signup/*` URL에 사용된다.

- [ ] **Step 4: `__setActionDbForTest` 등 테스트 전용 코드 제거 (선택)**

admin 앱은 vitest 없음. 단순화를 위해 `__setActionDbForTest`와 `declare global { var __bidit_action_db_override__ }` 블록을 제거해도 되지만, 타입 오류 없으면 그대로 둬도 무방.

---

## Task 6: 서버 쿼리 + 액션 복사 + PgliteDB 제거

**Files:**
- Copy: `lib/server/queries/admin/` (7개 파일)
- Copy: `lib/server/actions/admin/` (9개 파일, `__tests__` 제외)

- [ ] **Step 1: 쿼리 파일 복사**

```bash
cp ~/project/bidit/lib/server/queries/admin/audit-log.ts lib/server/queries/admin/
cp ~/project/bidit/lib/server/queries/admin/buyers.ts lib/server/queries/admin/
cp ~/project/bidit/lib/server/queries/admin/dashboard.ts lib/server/queries/admin/
cp ~/project/bidit/lib/server/queries/admin/review.ts lib/server/queries/admin/
cp ~/project/bidit/lib/server/queries/admin/rfps.ts lib/server/queries/admin/
cp ~/project/bidit/lib/server/queries/admin/sellers.ts lib/server/queries/admin/
cp ~/project/bidit/lib/server/queries/admin/workspaceOwner.ts lib/server/queries/admin/
```

- [ ] **Step 2: 액션 파일 복사 (`__tests__` 디렉토리 제외)**

```bash
for f in approveWorkspaceAction createAdminNoteAction extendRfpDeadlineAction hideQuoteAction rejectWorkspaceAction requestMoreInfoAction sendReminderAction suspendWorkspaceAction unsuspendWorkspaceAction; do
  cp ~/project/bidit/lib/server/actions/admin/${f}.ts lib/server/actions/admin/
done
```

- [ ] **Step 3: PgliteDB import 전부 제거**

```bash
# PgliteDB import 제거
find lib/server/{queries,actions} -name "*.ts" | xargs sed -i '' "/from '@\/lib\/db\/client-pglite'/d"

# PgliteDB 타입 union 제거 (| PgliteDB 패턴)
find lib/server/{queries,actions} -name "*.ts" | xargs sed -i '' 's/ | PgliteDB//g'

# PgliteDB import type 줄 제거
find lib/server/{queries,actions} -name "*.ts" | xargs sed -i '' '/import type { PgliteDB }/d'
```

확인:
```bash
grep -rn "PgliteDB\|client-pglite" lib/server/
# 0건이어야 함
```

- [ ] **Step 4: /admin prefix 제거 (revalidatePath + dashboard hrefs)**

```bash
# revalidatePath('/admin/...') → revalidatePath('/...')
find lib/server/actions/admin -name "*.ts" | xargs sed -i '' "s|revalidatePath('/admin/|revalidatePath('/|g"
find lib/server/actions/admin -name "*.ts" | xargs sed -i '' "s|revalidatePath('/admin')|revalidatePath('/')|g"

# dashboard.ts 내 href '/admin/review/' → '/review/' 등
sed -i '' "s|'/admin/review/|'/review/|g" lib/server/queries/admin/dashboard.ts
sed -i '' "s|'/admin/rfps/|'/rfps/|g" lib/server/queries/admin/dashboard.ts
sed -i '' "s|'/admin/buyers/|'/buyers/|g" lib/server/queries/admin/dashboard.ts
sed -i '' "s|'/admin/sellers/|'/sellers/|g" lib/server/queries/admin/dashboard.ts
```

확인:
```bash
grep -rn "'/admin" lib/server/
# 0건이어야 함
```

- [ ] **Step 5: approveWorkspaceAction + rejectWorkspaceAction — appBaseUrl() 적용**

`lib/server/actions/admin/approveWorkspaceAction.ts`에서:
- `import { actionDb, baseUrl } from '@/lib/server/actions/auth/_shared'` → `import { actionDb, baseUrl, appBaseUrl } from '@/lib/server/actions/auth/_shared'`
- `loginUrl: \`${baseUrl()}/login\`` → `loginUrl: \`${appBaseUrl()}/login\``

```bash
sed -i '' "s|import { actionDb, baseUrl }|import { actionDb, baseUrl, appBaseUrl }|" lib/server/actions/admin/approveWorkspaceAction.ts
sed -i '' 's|`${baseUrl()}/login`|`${appBaseUrl()}/login`|' lib/server/actions/admin/approveWorkspaceAction.ts
```

`lib/server/actions/admin/rejectWorkspaceAction.ts`에서도 동일하게 `/signup/buyer`, `/signup/pg` URL에 `appBaseUrl()` 적용:
```bash
sed -i '' "s|import { actionDb, baseUrl }|import { actionDb, baseUrl, appBaseUrl }|" lib/server/actions/admin/rejectWorkspaceAction.ts
sed -i '' 's|`${baseUrl()}/signup|`${appBaseUrl()}/signup|g' lib/server/actions/admin/rejectWorkspaceAction.ts
```

확인:
```bash
grep "appBaseUrl\|baseUrl" lib/server/actions/admin/approveWorkspaceAction.ts
grep "appBaseUrl\|baseUrl" lib/server/actions/admin/rejectWorkspaceAction.ts
# appBaseUrl()이 이메일 링크에, baseUrl()이 admin-internal 링크에 각각 쓰이는지 확인
```

---

## Task 7: 컴포넌트 + 스타일 복사

**Files:**
- Copy: `components/AdminShell.tsx` (from `components/admin/AdminShell.tsx`)
- Copy: `components/AdminStatusBadge.tsx`
- Copy: `components/primitives/Chip.tsx`
- Copy: `styles/tokens.css`
- Copy: `public/fonts/PretendardVariable.woff2`

- [ ] **Step 1: 컴포넌트 복사**

```bash
cp ~/project/bidit/components/admin/AdminShell.tsx components/AdminShell.tsx
cp ~/project/bidit/components/admin/AdminStatusBadge.tsx components/AdminStatusBadge.tsx
cp ~/project/bidit/components/primitives/Chip.tsx components/primitives/Chip.tsx
```

- [ ] **Step 2: AdminShell.tsx — nav href + import 수정**

```bash
# /admin/* → /* (nav hrefs)
sed -i '' "s|href=\"/admin/|href=\"/|g" components/AdminShell.tsx
sed -i '' "s|href=\"/admin\"|href=\"/\"|g" components/AdminShell.tsx

# logoutAction import 경로 수정 (app/admin/login → app/login)
sed -i '' "s|from '@/app/admin/login/actions'|from '@/app/login/actions'|" components/AdminShell.tsx
```

확인:
```bash
grep "href\|from '@/app" components/AdminShell.tsx
# /admin 없어야 함
```

- [ ] **Step 3: 스타일 + 폰트 복사**

```bash
cp ~/project/bidit/styles/tokens.css styles/tokens.css
cp ~/project/bidit/public/fonts/PretendardVariable.woff2 public/fonts/PretendardVariable.woff2
```

---

## Task 8: app 페이지 복사 + 경로 변환

**Files:**
- Copy: `app/admin/login/*` → `app/login/*`
- Copy: `app/admin/(protected)/**` → `app/(protected)/**`

- [ ] **Step 1: login 페이지 복사**

```bash
cp ~/project/bidit/app/admin/login/actions.ts app/login/actions.ts
cp ~/project/bidit/app/admin/login/page.tsx app/login/page.tsx
```

- [ ] **Step 2: login/actions.ts — redirect 경로 수정**

```bash
sed -i '' "s|redirect('/admin')|redirect('/')|g" app/login/actions.ts
sed -i '' "s|redirect('/admin/login')|redirect('/login')|g" app/login/actions.ts

grep "redirect" app/login/actions.ts
# redirect('/') 과 redirect('/login') 만 보여야 함
```

- [ ] **Step 3: (protected) 페이지 복사**

```bash
cp ~/project/bidit/app/admin/'(protected)'/layout.tsx 'app/(protected)/layout.tsx'
cp ~/project/bidit/app/admin/'(protected)'/page.tsx 'app/(protected)/page.tsx'
cp ~/project/bidit/app/admin/'(protected)'/audit-log/page.tsx 'app/(protected)/audit-log/page.tsx'
cp ~/project/bidit/app/admin/'(protected)'/buyers/page.tsx 'app/(protected)/buyers/page.tsx'
cp ~/project/bidit/app/admin/'(protected)'/buyers/'[id]'/page.tsx 'app/(protected)/buyers/[id]/page.tsx'
cp ~/project/bidit/app/admin/'(protected)'/review/page.tsx 'app/(protected)/review/page.tsx'
cp ~/project/bidit/app/admin/'(protected)'/review/'[id]'/page.tsx 'app/(protected)/review/[id]/page.tsx'
cp ~/project/bidit/app/admin/'(protected)'/rfps/page.tsx 'app/(protected)/rfps/page.tsx'
cp ~/project/bidit/app/admin/'(protected)'/rfps/'[id]'/page.tsx 'app/(protected)/rfps/[id]/page.tsx'
cp ~/project/bidit/app/admin/'(protected)'/sellers/page.tsx 'app/(protected)/sellers/page.tsx'
cp ~/project/bidit/app/admin/'(protected)'/sellers/'[id]'/page.tsx 'app/(protected)/sellers/[id]/page.tsx'
```

- [ ] **Step 4: 페이지 파일 내 /admin prefix 제거**

```bash
find app -name "*.tsx" -o -name "*.ts" | xargs grep -l "/admin" | while read f; do
  sed -i '' "s|href=\"/admin/|href=\"/|g" "$f"
  sed -i '' "s|href=\"/admin\"|href=\"/\"|g" "$f"
  sed -i '' "s|'/admin/|'/|g" "$f"
  sed -i '' "s|'/admin'|'/'|g" "$f"
done
```

확인:
```bash
grep -rn "'/admin\|/admin\"" app/
# 0건이어야 함
```

- [ ] **Step 5: AdminShell import 경로 수정 (페이지 파일)**

`(protected)/layout.tsx`에서 AdminShell import가 `@/components/admin/AdminShell` → `@/components/AdminShell`:

```bash
sed -i '' "s|from '@/components/admin/AdminShell'|from '@/components/AdminShell'|g" 'app/(protected)/layout.tsx'
grep "AdminShell" 'app/(protected)/layout.tsx'
# @/components/AdminShell 이어야 함
```

---

## Task 9: 루트 레이아웃 + 글로벌 CSS + 설정 파일 작성

**Files:**
- Create: `app/layout.tsx`
- Create: `app/globals.css`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `ecosystem.config.cjs`
- Create: `.env.example`

- [ ] **Step 1: app/layout.tsx 작성**

```typescript
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const pretendard = localFont({
  src: '../public/fonts/PretendardVariable.woff2',
  variable: '--font-sans',
  display: 'swap',
  weight: '45 920',
});

export const metadata: Metadata = {
  title: 'Supporter B Admin',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: app/globals.css 작성**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "../styles/tokens.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--md-sys-color-background);
  --color-foreground: var(--md-sys-color-on-background);
  --color-primary: var(--md-sys-color-primary);
  --color-primary-foreground: var(--md-sys-color-on-primary);
  --color-border: var(--md-sys-color-outline-variant);
  --color-surface: var(--md-sys-color-surface);
  --color-surface-container: var(--md-sys-color-surface-container);
  --color-surface-container-high: var(--md-sys-color-surface-container-high);
  --color-on-surface: var(--md-sys-color-on-surface);
  --color-on-surface-variant: var(--md-sys-color-on-surface-variant);
  --color-outline: var(--md-sys-color-outline);
  --color-outline-variant: var(--md-sys-color-outline-variant);
  --color-error: var(--md-sys-color-error);
  --color-warning: var(--md-sys-color-warning);
  --color-tertiary: var(--md-sys-color-tertiary);
  --font-sans: var(--font-sans);
}

:root {
  color-scheme: light;
}

@layer base {
  * {
    box-sizing: border-box;
  }

  body {
    font-family: var(--font-sans);
    font-size: var(--md-typescale-body-large-size, 14px);
    line-height: var(--md-typescale-body-large-line-height, 1.5);
    background-color: var(--md-sys-color-background);
    color: var(--md-sys-color-on-background);
  }

  .md-numeric {
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }
}
```

- [ ] **Step 3: next.config.ts 작성**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['pino', 'pino-pretty'],
};

export default nextConfig;
```

- [ ] **Step 4: postcss.config.mjs 복사**

```bash
cp ~/project/bidit/postcss.config.mjs postcss.config.mjs
```

- [ ] **Step 5: ecosystem.config.cjs 작성**

```javascript
module.exports = {
  apps: [
    {
      name: 'admin-supporter-b',
      cwd: __dirname,
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production', PORT: '3001' },
    },
  ],
};
```

- [ ] **Step 6: .env.example 작성**

```bash
cat > .env.example << 'EOF'
# Shared Postgres (same DB as main app)
DATABASE_URL=postgres://supporter_b:supporter_b@localhost:5432/supporter_b

# Admin JWT auth
ADMIN_ID=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=   # openssl rand -base64 32 (min 32 chars)

# Resend (workspace approve/reject emails)
RESEND_API_KEY=
RESEND_FROM=send@supporter-b.store

# Main app URL — used in approval/rejection email links sent to users
# Must point to the MAIN app, NOT this admin app
PUBLIC_APP_URL=https://supporter-b.store

# This admin app's own origin
NEXT_PUBLIC_BASE_URL=https://admin.supporter-b.store
EOF
```

---

## Task 10: Typecheck + Build 검증

**Files:** (수정 없음)

- [ ] **Step 1: eslint config 복사**

```bash
cp ~/project/bidit/eslint.config.mjs eslint.config.mjs 2>/dev/null || true
```

`eslint.config.mjs`가 없으면 minimal 버전 작성:
```javascript
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
```

- [ ] **Step 2: typecheck 실행**

```bash
pnpm typecheck 2>&1 | head -50
```

Expected: 0 errors. 에러가 있으면 각 에러 메시지에 따라 수정:
- `Cannot find module '@/lib/db/client'` → 해당 파일에서 `@/lib/db/index`로 변경
- `PgliteDB` 관련 → `grep -rn "PgliteDB\|client-pglite" lib/` 로 찾아 제거
- `'/admin` 문자열 → 경로 수정

- [ ] **Step 3: 잔여 /admin 경로 검증**

```bash
grep -rn "'/admin\|/admin\"" app/ lib/ components/
# 반드시 0건이어야 함
```

- [ ] **Step 4: 잔여 PgliteDB 의존성 검증**

```bash
grep -rn "client-pglite\|PgliteDB" lib/
# 반드시 0건이어야 함
```

- [ ] **Step 5: build 실행**

로컬 `.env` 없이 빌드 테스트 (DATABASE_URL 없이도 빌드는 됨):

```bash
pnpm build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` 또는 `Route ... kB` 테이블 출력.

- [ ] **Step 6: 첫 커밋**

```bash
git add -A
git commit -m "chore: extract admin section from main app

Admin app is now a standalone Next.js 16.2.4 app.
Shares the same Postgres DB (DATABASE_URL).
Runs on port 3001 (admin.supporter-b.store).
Migration ownership stays in main app.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

---

## Task 11: 메인 앱 — admin 코드 제거

**주의**: 이 태스크는 `~/project/bidit` (메인 앱 레포)에서 수행한다. 새 브랜치에서 작업.

- [ ] **Step 1: 메인 앱에서 새 브랜치 생성**

```bash
cd ~/project/bidit
git checkout main && git pull
git checkout -b chore/remove-admin-section
```

- [ ] **Step 2: 삭제 전 교차 참조 검증**

삭제 전 admin 파일이 메인 앱 다른 곳에서 참조되지 않는지 확인:

```bash
grep -rn "from '@/lib/auth/admin-session'" --include="*.ts" --include="*.tsx" app/ lib/ | grep -v "app/admin/"
grep -rn "from '@/components/admin/" --include="*.ts" --include="*.tsx" app/ lib/ | grep -v "app/admin/"
grep -rn "from '@/lib/server/queries/admin/" --include="*.ts" --include="*.tsx" app/ lib/ | grep -v "lib/server/queries/admin/"
grep -rn "from '@/lib/server/actions/admin/" --include="*.ts" --include="*.tsx" app/ lib/ | grep -v "lib/server/actions/admin/"
```

Expected: 모두 0건. 결과가 있으면 각 참조 파일을 조사 후 처리.

- [ ] **Step 3: admin 파일 삭제**

```bash
rm -rf app/admin/
rm -f components/admin/AdminShell.tsx
rm -f components/admin/AdminStatusBadge.tsx
# components/admin/ 디렉토리가 비면 삭제
rmdir components/admin/ 2>/dev/null || true

rm -f lib/auth/admin-session.ts
rm -f lib/auth/__tests__/admin-session.test.ts

rm -rf lib/server/queries/admin/
rm -rf lib/server/actions/admin/
```

- [ ] **Step 4: 메인 앱 typecheck + test**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test 2>&1 | tail -20
```

Expected: 전체 테스트 그린 (admin 관련 테스트 제외 후 기존 테스트 모두 패스).

- [ ] **Step 5: 커밋 + PR**

```bash
git add -A
git commit -m "chore: remove admin section (extracted to admin-supporter-b repo)

Admin app is now maintained at github.com/bothsides-platform-dev/admin-supporter-b.
Removed: app/admin/, components/admin/, lib/auth/admin-session.ts,
         lib/server/queries/admin/, lib/server/actions/admin/

DB schema ownership (lib/db/schema/admin.ts) stays here.
Admin-email notifications (lib/integrations/admin-email.ts) stay here.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

PR 생성 (`/ship` 스킬 사용).

---

## Task 12: Lightsail 배포

이 태스크는 Lightsail VM SSH 접속 후 수행.

- [ ] **Step 1: 레포 클론**

```bash
cd ~
git clone git@github.com:bothsides-platform-dev/admin-supporter-b.git
cd admin-supporter-b
pnpm install
```

- [ ] **Step 2: 환경변수 설정**

```bash
cp .env.example .env.production
# 편집: DATABASE_URL (메인 앱과 동일), ADMIN_ID, ADMIN_PASSWORD,
#       ADMIN_SESSION_SECRET (openssl rand -base64 32),
#       RESEND_API_KEY, PUBLIC_APP_URL=https://supporter-b.store,
#       NEXT_PUBLIC_BASE_URL=https://admin.supporter-b.store
nano .env.production
```

- [ ] **Step 3: 빌드 + PM2 시작**

```bash
pnpm build
pm2 start ecosystem.config.cjs
pm2 save
pm2 list
# admin-supporter-b가 online 상태여야 함
```

- [ ] **Step 4: Caddy 설정 추가**

```bash
sudo nano /etc/caddy/Caddyfile
```

파일 끝에 추가:
```
admin.supporter-b.store {
    reverse_proxy localhost:3001
}
```

```bash
caddy reload
```

- [ ] **Step 5: DNS A 레코드 추가**

도메인 관리 콘솔에서:
- Record type: A
- Name: `admin`
- Value: Lightsail 정적 IP (메인 앱과 동일 IP)
- TTL: 300

- [ ] **Step 6: 런타임 검증**

DNS 전파 후 (또는 `/etc/hosts`로 테스트):

```bash
# 로컬 테스트 (DNS 전파 전)
curl -I http://localhost:3001/login
# 200 OK 이어야 함
```

브라우저에서:
1. `admin.supporter-b.store/login` → 로그인 폼 표시
2. 자격증명 입력 → `/` (대시보드) 리다이렉트
3. 대시보드에 숫자 표시 (DB 연결 확인)
4. Review 페이지 → pending 워크스페이스 승인 → `psql`로 `SELECT status FROM workspaces WHERE id='...'` 확인 → `active`
5. 승인 이메일 링크가 `supporter-b.store/login` (admin URL 아님) 확인
6. 로그아웃 → `/login` 리다이렉트

---

## 검증 체크리스트 (완료 기준)

```bash
# admin-supporter-b 레포에서
pnpm typecheck                          # 0 에러
pnpm build                              # 성공
grep -rn "'/admin\|/admin\"" app/ lib/ components/  # 0건
grep -rn "client-pglite\|PgliteDB" lib/              # 0건
grep "appBaseUrl" lib/server/actions/admin/approveWorkspaceAction.ts  # 있어야 함

# 메인 앱에서
pnpm tsc --noEmit                       # 0 에러
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test  # 전체 그린
grep -rn "app/admin/" app/ lib/ components/           # 0건
```
