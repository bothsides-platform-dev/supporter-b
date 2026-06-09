# Monorepo Buyer/PG Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single Next.js app into a pnpm monorepo with two independently-built/deployed apps — `apps/buyer` (`supporter-b.com`) and `apps/partner` (`partner.supporter-b.com`) — sharing one Postgres, one Auth.js session, and a set of extracted packages, with **zero change to runtime behavior or data model**.

**Architecture:** Both apps stay on the same VM, same Postgres, same Centrifugo. The shared session cookie is scoped to `.supporter-b.com` so a multi-workspace user stays logged in across both subdomains. Cross-boundary transactions (award, bid submit) are unchanged — they execute in whichever app the action is triggered against the shared DB; the other app only reads the resulting rows + receives the existing post-commit Centrifugo push. No event bus, no eventual-consistency downgrade.

**Tech Stack:** pnpm workspaces + Turborepo, Next.js 16, Auth.js v5, Drizzle/Postgres, Vitest/PGlite, PM2, Caddy.

---

## Why this is mostly mechanical (read first)

The import-graph probe (2026-06-09) confirmed the boundaries cleave cleanly:

- `lib/db`, `lib/auth`, `components/ui`, `components/primitives` have **no** back-edges into app/feature code.
- The **only** `lib/server`→UI leaks are three `import type` lines (erased at compile): `InboxRow` (×2), `ConversationListItem`. Phase 1 inverts these.
- `components/icons/index.tsx` is a clean leaf (lucide only) → goes into `packages/ui`.

Therefore most tasks are **move files + rewrite imports + verify build/test/typecheck green + commit**, not red-green TDD. The verification gate for those tasks is the existing suite staying green. Only the two genuinely *new behaviors* — cross-subdomain session sharing (Phase 2) and cross-subdomain workspace routing (Phase 4) — get real RED→GREEN tests with the new code under test.

**Each phase is independently shippable and reversible** (its own PR). Stop after any phase with a green tree.

---

## Target File Structure

```
pnpm-workspace.yaml          # NEW — declares apps/* + packages/*
turbo.json                   # NEW — build/test/lint/typecheck pipeline
package.json                 # root — devDeps + turbo scripts only (name: "supporter-b-monorepo")

apps/
├─ buyer/                    # supporter-b.com, PM2 port 3000 (the existing app, slimmed)
│  ├─ app/
│  │  ├─ (public)/           # login, signup/buyer/*, password, invite, auth — shared pkg-backed thin pages
│  │  ├─ (app)/
│  │  │  ├─ home/            # renders <BuyerHome> only
│  │  │  ├─ rfp/             # B1–B7
│  │  │  ├─ messages/  notifications/  settings/   # thin pages → packages/ui + packages/messaging
│  │  │  └─ layout.tsx       # guard: bounce non-buyer active ws to partner origin (Phase 4)
│  │  ├─ rfp/new/            # full-screen wizard (outside shell)
│  │  └─ logout/route.ts
│  ├─ next.config.ts  tsconfig.json  package.json  .env.production
│
├─ partner/                  # partner.supporter-b.com, PM2 port 3100 (NEW, thin)
│  ├─ app/
│  │  ├─ (public)/           # login, signup/pg/*, password, invite, auth
│  │  ├─ (app)/
│  │  │  ├─ home/            # renders <PgHome> only
│  │  │  ├─ inbox/  opportunities/                 # P2–P4
│  │  │  ├─ messages/  notifications/  settings/   # SAME thin pages as buyer (shared pkgs)
│  │  │  └─ layout.tsx       # guard: bounce non-pg active ws to buyer origin (Phase 4)
│  │  └─ logout/route.ts
│  ├─ next.config.ts  tsconfig.json  package.json  .env.production

packages/
├─ db/        # @repo/db      — lib/db/** (schema, drizzle client, schema-ddl). No app deps.
├─ server/    # @repo/server  — lib/server/** (actions, services, repositories, board, dashboard, notifications, outbox)
├─ auth/      # @repo/auth    — auth.ts, auth.config.ts, lib/auth/** (session, guards, shell-access, active-workspace, cookies)
├─ shared/    # @repo/shared  — cross-cutting types extracted from components (InboxRow, ConversationListItem, …) + lib/nav, lib/types, lib/utils
├─ ui/        # @repo/ui      — components/{ui,primitives,shell,icons,board,settings,messages,home(shared bits)} + styles/tokens.css + fonts
└─ messaging/ # @repo/msg     — Centrifugo hooks (lib/hooks/useChatChannel.ts) + messages client wiring

deploy/
├─ Caddyfile                 # + partner.{$APP_DOMAIN} → 127.0.0.1:3100
ecosystem.config.cjs         # + second PM2 app "partner" on 3100
```

> **Package naming:** use the `@repo/*` scope (Turborepo convention) to avoid colliding with the public `@bidit/*` namespace nothing publishes to. Internal-only, never published.

> **Workspace-specific `components/rfp` (buyer) and `components/inbox`+`opportunities` (partner)** do NOT go into a package — they live directly in their owning app (`apps/buyer/components/rfp`, `apps/partner/components/inbox`). Only genuinely-shared code is packaged.

---

## Phase 0 — Monorepo scaffold (the existing app becomes `apps/buyer`)

**Outcome:** Repo builds & tests green as a one-app monorepo. No package extraction yet. Fully reversible.

### Task 0.1: Add pnpm workspace + Turborepo

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Modify: `package.json` (root → orchestration only)

- [ ] **Step 1: Create the workspace manifest**

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 2: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**"] },
    "test": { "dependsOn": ["^build"], "outputs": [] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "lint": { "outputs": [] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

- [ ] **Step 3: Install Turborepo at the root**

Run: `pnpm add -Dw turbo`
Expected: `turbo` added to root `devDependencies`.

- [ ] **Step 4: Rewrite root `package.json` scripts to delegate to turbo**

Set `"name": "supporter-b-monorepo"`, `"private": true`, and:
```json
"scripts": {
  "build": "turbo run build",
  "test": "turbo run test",
  "typecheck": "turbo run typecheck",
  "lint": "turbo run lint",
  "dev": "turbo run dev"
}
```
Move all current `dependencies`/`devDependencies` OUT of root — they relocate to `apps/buyer/package.json` in Task 0.2. Root keeps only `turbo`.

- [ ] **Step 5: Commit**
```bash
git add pnpm-workspace.yaml turbo.json package.json
git commit -m "chore(monorepo): add pnpm workspace + turborepo scaffold"
```

### Task 0.2: Relocate the existing app into `apps/buyer`

**Files:** moves the entire current tree (except root monorepo files) under `apps/buyer/`.

- [ ] **Step 1: Move app sources with git (preserves history)**
```bash
mkdir -p apps/buyer
git mv app components lib styles public hooks \
       next.config.ts tsconfig.json vitest.config.ts eslint.config.mjs \
       drizzle.config.ts postcss.config.mjs next-env.d.ts \
       apps/buyer/ 2>/dev/null
# Move the original (pre-Task-0.1) dependency manifest fields into apps/buyer/package.json:
#   create apps/buyer/package.json with name "@repo/buyer", private true,
#   the FULL deps/devDeps that root had before, and scripts: dev/build/start/test/typecheck/lint
```
> Adjust the file list to whatever `git status`/`ls` shows at root. Anything app-specific moves; monorepo-level files (`pnpm-workspace.yaml`, `turbo.json`, root `package.json`, `pnpm-lock.yaml`, `.gitignore`, `docs/`, `*.md`) stay at root.

- [ ] **Step 2: Fix `apps/buyer/tsconfig.json` paths**

`@/*` must now resolve relative to the app, not repo root:
```jsonc
{
  "compilerOptions": {
    "paths": { "@/*": ["./*"] }
  }
}
```
(Unchanged value — but verify it's relative to `apps/buyer`. Add `"extends": "../../tsconfig.base.json"` only if you create a shared base; optional.)

- [ ] **Step 3: Reinstall from the workspace root**

Run: `pnpm install`
Expected: pnpm links `apps/buyer`; one `node_modules` at root + hoisted store.
> Native-binding gotcha (memory `worktree-node-modules-native-bindings`): if vitest dies on `rolldown-binding.darwin-arm64.node`, the workspace hoist normally fixes it; if not, reinstall.

- [ ] **Step 4: Verify the full suite green from root**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test`
Expected: same pass count as before the move (≈1842 unit green). **typecheck is pre-existingly RED** on wizard test-global errors (memory `typecheck-red-wizard-test-globals`) — filter: `pnpm typecheck 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'"` should be empty of NEW errors.

- [ ] **Step 5: Verify a production build**

Run: `pnpm --filter @repo/buyer build`
Expected: Next build succeeds.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "chore(monorepo): relocate app into apps/buyer"
```

**🚢 Shippable checkpoint:** deploy unchanged (PM2 still runs one Next server; only `cwd`/build path moves to `apps/buyer`). Update `ecosystem.config.cjs` `cwd` + `script` path in Phase 5; until then deploy from `apps/buyer`.

---

## Phase 1 — Extract shared packages

**Outcome:** Shared code lives in `packages/*`; `apps/buyer` imports it via `@repo/*`. Suite green. Each package is one task = one commit = one reversible step.

> **Extraction order matters** (dependency-leaf first): `db` → `shared` → `auth` → `server` → `ui` → `messaging`. A package may only depend on packages extracted before it.

### Task 1.1: Invert the 3 type-only back-edges (unblocks `@repo/server`)

**Files:**
- Create: `apps/buyer/lib/server/inbox-types.ts` (temporary home; moves to `@repo/shared` in Task 1.2)
- Modify: `apps/buyer/components/inbox/InboxList.tsx`, `apps/buyer/components/messages/types.ts`
- Modify: `apps/buyer/lib/server/status-filter.ts:20`, `apps/buyer/lib/server/board/filterRfps.ts:6`, `apps/buyer/lib/server/dashboard/homeMessages.ts:1`

- [ ] **Step 1: Confirm the leak still fails the boundary**

Run: `grep -rn "from '@/components" apps/buyer/lib/server --include=*.ts | grep -v __tests__`
Expected: 3 hits (the `InboxRow` ×2 and `ConversationListItem` type imports).

- [ ] **Step 2: Move `InboxRow` type down to server, re-export up**

In `apps/buyer/lib/server/inbox-types.ts`:
```ts
// Row shape the inbox list renders — owned by the server layer that produces it.
export interface InboxRow {
  // COPY the exact current InboxRow definition from components/inbox/InboxList.tsx
}
```
In `components/inbox/InboxList.tsx`: delete the local `InboxRow` definition and `import type { InboxRow } from '@/lib/server/inbox-types'` (re-export it if other components import it from here: `export type { InboxRow } from '@/lib/server/inbox-types'`).

- [ ] **Step 3: Same inversion for `ConversationListItem`**

Move `ConversationListItem` from `components/messages/types.ts` into `apps/buyer/lib/server/dashboard/conversation-types.ts`; have `components/messages/types.ts` re-export it.

- [ ] **Step 4: Point the 3 server files at the new locations**

`status-filter.ts:20` & `board/filterRfps.ts:6` → `import type { InboxRow } from '@/lib/server/inbox-types'`
`dashboard/homeMessages.ts:1` → `import type { ConversationListItem } from '@/lib/server/dashboard/conversation-types'`

- [ ] **Step 5: Verify boundary clean + suite green**

Run: `grep -rn "from '@/components" apps/buyer/lib/server --include=*.ts | grep -v __tests__`
Expected: **0 hits.**
Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm --filter @repo/buyer test`
Expected: green (these are type moves; no runtime change).

- [ ] **Step 6: Commit**
```bash
git add -A && git commit -m "refactor(server): invert inbox/conversation type imports to remove UI back-edge"
```

### Task 1.2: Extract `@repo/db`

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/index.ts`
- Move: `apps/buyer/lib/db/**` → `packages/db/src/**`

- [ ] **Step 1: Scaffold the package**

`packages/db/package.json`:
```json
{
  "name": "@repo/db",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts", "./schema": "./src/schema/index.ts" },
  "dependencies": { "drizzle-orm": "*", "postgres": "*" }
}
```
> Internal TS packages export `.ts` directly (Next transpiles workspace deps via `transpilePackages`). No build step.

- [ ] **Step 2: Move sources**
```bash
mkdir -p packages/db/src
git mv apps/buyer/lib/db/* packages/db/src/
```

- [ ] **Step 3: Add `@repo/db` to buyer + register transpile**

In `apps/buyer/package.json` deps: `"@repo/db": "workspace:*"`.
In `apps/buyer/next.config.ts`: `transpilePackages: ['@repo/db']` (append to the array, create if absent).
Run: `pnpm install`.

- [ ] **Step 4: Rewrite imports `@/lib/db` → `@repo/db`**
```bash
grep -rl "@/lib/db" apps/buyer | xargs sed -i '' "s#@/lib/db#@repo/db#g"
```
> Verify each rewritten import resolves to an `exports` entry; deep imports like `@/lib/db/schema/rfps` become `@repo/db/schema` (re-export rfps from the schema barrel) or add explicit `exports` subpaths.

- [ ] **Step 5: Verify**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test`
Expected: green (PGlite bootstrap still finds schema via `@repo/db`). Watch the e2e schema-DDL path (`generateSchemaDDL`) — it now lives in `@repo/db`.

- [ ] **Step 6: Commit** — `chore(monorepo): extract @repo/db`

### Task 1.3: Extract `@repo/shared`

**Move:** `lib/types`, `lib/utils`, `lib/nav`, and the type files from Task 1.1 (`inbox-types`, `conversation-types`) → `packages/shared/src/`.
**Depends on:** nothing (or `@repo/db` for shared types only).
- [ ] Scaffold `packages/shared/package.json` (`name: @repo/shared`), `git mv` the dirs, add `"@repo/shared": "workspace:*"` + transpile to buyer, rewrite `@/lib/nav`→`@repo/shared/nav` etc., `pnpm test` green, commit.
> `lib/nav/nav-config.ts` imports `@/components/icons` — that icon barrel moves to `@repo/ui` (Task 1.6). Until then, keep `nav-config` importing icons via a thin `@repo/shared` re-export, OR sequence nav extraction into Task 1.6 after `@repo/ui`. **Decision: move `lib/nav` in Task 1.6 (with ui), not here** — keep `@repo/shared` to framework-free types/utils only.

### Task 1.4: Extract `@repo/auth`

**Move:** `auth.ts`, `auth.config.ts`, `lib/auth/**` → `packages/auth/src/`.
**Depends on:** `@repo/db`, `@repo/shared`.
- [ ] Scaffold (`name: @repo/auth`, deps: `next-auth`, `@repo/db`, `@repo/shared`), `git mv`, add to buyer + transpile, rewrite `@/lib/auth`→`@repo/auth` and `@/auth`→`@repo/auth`, `pnpm test` green, commit.
> `app/(app)/layout.tsx` imports `auth()` and the guards from here — buyer's thin pages will import `@repo/auth`. This package is the seam Phase 2 & 4 modify.

### Task 1.5: Extract `@repo/server`

**Move:** `lib/server/**` → `packages/server/src/`.
**Depends on:** `@repo/db`, `@repo/auth`, `@repo/shared`. (Back-edges already removed in Task 1.1.)
- [ ] Scaffold (`name: @repo/server`), `git mv`, transpile, rewrite `@/lib/server`→`@repo/server`, `pnpm test` green (services/repositories tests come along), commit.
> The `globalThis` service-singleton pattern (`getRfpService()`/`getBidService()`) is unaffected — it keys off `globalThis`, shared per Node process. Each app process gets its own singletons; correct.

### Task 1.6: Extract `@repo/ui` (+ `lib/nav`)

**Move:** `components/{ui,primitives,shell,icons,board,settings}`, the shared `components/home/*` bits, `components/messages/*` (non-Centrifugo), `styles/tokens.css`, fonts, **and** `lib/nav` → `packages/ui/src/`.
**Depends on:** `@repo/shared`, `@repo/auth` (shell reads session type), `@repo/server` (settings/messages server actions).
- [ ] Scaffold (`name: @repo/ui`, deps: react, next, `@base-ui/react`, lucide-react, motion, `@repo/*`), `git mv`, transpile, rewrite imports, `pnpm test` green (cmdk jsdom polyfills + Component.Skeleton RSC boundary memos still apply), commit.
> Tailwind v4: `apps/buyer/app/globals.css` must `@source` the `@repo/ui` package so its class names aren't tree-shaken. Add `@source "../../../packages/ui/src";` (adjust depth) to each app's global stylesheet.

### Task 1.7: Extract `@repo/msg`

**Move:** `lib/hooks/useChatChannel.ts` + Centrifugo client wiring → `packages/messaging/src/`.
**Depends on:** `@repo/shared`. Keep `centrifuge` as the package dep.
- [ ] Scaffold, `git mv`, transpile, rewrite, `pnpm test` green, commit.

**🚢 Shippable checkpoint (end of Phase 1):** `apps/buyer` is a thin app over `@repo/*` packages. Still one deployed app. Full suite green, build green.

---

## Phase 2 — Cross-subdomain session sharing (NEW BEHAVIOR — TDD)

**Outcome:** The Auth.js session cookie is scoped to `.supporter-b.com` so a login on either subdomain is valid on both. This is the prerequisite for two apps to share one session.

**Files:**
- Modify: `packages/auth/src/auth.config.ts`
- Create: `packages/auth/src/__tests__/cookie-domain.test.ts`
- Modify: `.env.production.example` (+ `AUTH_COOKIE_DOMAIN`)

- [ ] **Step 1: Write the failing test**

`packages/auth/src/__tests__/cookie-domain.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('auth cookie domain', () => {
  const prev = process.env.AUTH_COOKIE_DOMAIN
  afterEach(() => { process.env.AUTH_COOKIE_DOMAIN = prev })

  it('scopes the session cookie to the parent domain when AUTH_COOKIE_DOMAIN is set', async () => {
    process.env.AUTH_COOKIE_DOMAIN = '.supporter-b.com'
    const { authConfig } = await import('../auth.config')
    expect(authConfig.cookies?.sessionToken?.options?.domain).toBe('.supporter-b.com')
    expect(authConfig.cookies?.sessionToken?.options?.sameSite).toBe('lax')
    expect(authConfig.cookies?.sessionToken?.options?.secure).toBe(true)
  })

  it('omits the domain (host-only cookie) in local/dev when unset', async () => {
    delete process.env.AUTH_COOKIE_DOMAIN
    const { buildSessionCookieOptions } = await import('../auth.config')
    expect(buildSessionCookieOptions().domain).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it — verify RED**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm --filter @repo/auth test cookie-domain`
Expected: FAIL — `cookies` undefined / `buildSessionCookieOptions` not exported.

- [ ] **Step 3: Implement minimal cookie config**

In `packages/auth/src/auth.config.ts`, add and wire:
```ts
export function buildSessionCookieOptions() {
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    ...(domain ? { domain } : {}),
  }
}
```
Then in the exported `authConfig`:
```ts
cookies: {
  sessionToken: {
    name: process.env.NODE_ENV === 'production'
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token',
    options: buildSessionCookieOptions(),
  },
},
```

- [ ] **Step 4: Run — verify GREEN**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm --filter @repo/auth test cookie-domain`
Expected: PASS (both cases).

- [ ] **Step 5: Document the env var**

In `.env.production.example` add:
```
# Share the session across supporter-b.com and partner.supporter-b.com.
# Leave UNSET in local/dev (host-only cookie on localhost).
AUTH_COOKIE_DOMAIN=.supporter-b.com
```

- [ ] **Step 6: Full suite green + commit**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test`
```bash
git add -A && git commit -m "feat(auth): scope session cookie to parent domain for cross-subdomain SSO"
```

> ⚠️ Deploy note: changing the cookie name/domain **invalidates existing sessions** — all users get logged out once on rollout. Schedule accordingly. AUTH_TRUST_HOST already set; ensure `AUTH_URL` per app (Phase 5).

---

## Phase 3 — Spawn `apps/partner`

**Outcome:** A second thin Next app serving only PG routes from the shared packages. Builds green. Not yet deployed.

### Task 3.1: Scaffold `apps/partner` shell

**Files:**
- Create: `apps/partner/package.json`, `next.config.ts`, `tsconfig.json`, `app/globals.css`, `app/layout.tsx`, `vitest.config.ts`, `.env.production`

- [ ] **Step 1: Mirror buyer's config, point at shared packages**

`apps/partner/package.json` (`name: @repo/partner`) deps = the same Next/React/runtime deps as buyer **plus** `@repo/db @repo/server @repo/auth @repo/ui @repo/msg @repo/shared` (all `workspace:*`). `next.config.ts` `transpilePackages: ['@repo/db','@repo/server','@repo/auth','@repo/ui','@repo/msg','@repo/shared']`. `tsconfig.json` `paths: { "@/*": ["./*"] }`. `globals.css` includes the same `@source "../../packages/ui/src"` + `@import` of tokens.

- [ ] **Step 2: Build the (public) + (app) shells importing shared chrome**

Copy buyer's `app/(public)/layout.tsx`, `app/(app)/layout.tsx`, root `layout.tsx`, `logout/route.ts` — they're thin wrappers over `@repo/ui` shell + `@repo/auth`. Identical except Phase 4's guard direction.

- [ ] **Step 3: `pnpm install` + verify the shell builds with no routes yet**

Run: `pnpm --filter @repo/partner build`
Expected: builds (empty app, just shell).

- [ ] **Step 4: Commit** — `feat(partner): scaffold partner app shell`

### Task 3.2: Move PG routes + PG-only components into `apps/partner`

**Files:** move from `apps/buyer` → `apps/partner`:
- `app/(app)/inbox/**`, `app/(app)/opportunities/**`, the PG `home` page wiring
- `app/(public)/signup/pg/**`
- `components/inbox/**`, `components/opportunities/**`, the PG-specific `components/home/PgHome*`
- the shared route pages (`messages`, `notifications`, `settings`) — **copy** the thin page files (they just import `@repo/ui`); both apps keep their own copy of these 1-import pages.

- [ ] **Step 1: git-mv PG-exclusive trees to partner**
```bash
git mv apps/buyer/app/\(app\)/inbox apps/partner/app/\(app\)/inbox
git mv apps/buyer/app/\(app\)/opportunities apps/partner/app/\(app\)/opportunities
git mv apps/buyer/components/inbox apps/partner/components/inbox
git mv apps/buyer/components/opportunities apps/partner/components/opportunities
# PG signup, PgHome, etc.
```

- [ ] **Step 2: Recreate shared thin pages in partner**

For `messages`, `notifications`, each `settings/*`: copy the page file from buyer. Each is ~3 lines importing a `@repo/ui` component. `settings/quote-templates` lives **only** in partner (PG-only); buyer's copy is deleted in Step 4.

- [ ] **Step 3: Partner `home` renders `<PgHome>` directly**

`apps/partner/app/(app)/home/page.tsx` imports `PgHome` from `@repo/ui` (no buyer/pg branch — each app knows its side).

- [ ] **Step 4: Slim buyer — remove PG-only code**

Delete from `apps/buyer`: any now-dead PG branches, `settings/quote-templates`, the `BuyerHome`/`PgHome` runtime switch (buyer home renders `<BuyerHome>` only). The `requirePgPage` guard usages move with their routes.

- [ ] **Step 5: Verify both apps build + test green**

Run: `pnpm --filter @repo/partner build && pnpm --filter @repo/buyer build`
Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test`
Expected: both build; suite green (tests for inbox/opportunities now run under partner's vitest project).

- [ ] **Step 6: Commit** — `feat(partner): move PG routes + components into partner app`

**🚢 Shippable checkpoint:** two apps build independently from shared packages; deploy still serves buyer only until Phase 5.

---

## Phase 4 — Cross-subdomain workspace routing (NEW BEHAVIOR — TDD)

**Outcome:** When a user's *active workspace type* doesn't match the app they hit, they're redirected to the correct subdomain. Switching workspace across types hard-navigates to the other origin. This makes the multi-workspace switcher work across two apps.

### Task 4.1: Pure redirect resolver

**Files:**
- Create: `packages/auth/src/cross-app.ts`
- Create: `packages/auth/src/__tests__/cross-app.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { resolveCrossAppRedirect, workspaceSwitchUrl } from '../cross-app'

const ORIGINS = { buyer: 'https://supporter-b.com', pg: 'https://partner.supporter-b.com' }

describe('resolveCrossAppRedirect', () => {
  it('returns null when active workspace type matches the serving app', () => {
    expect(resolveCrossAppRedirect('buyer', 'buyer', ORIGINS)).toBeNull()
    expect(resolveCrossAppRedirect('pg', 'pg', ORIGINS)).toBeNull()
  })
  it('redirects a pg-active user on the buyer app to the partner origin', () => {
    expect(resolveCrossAppRedirect('pg', 'buyer', ORIGINS)).toBe('https://partner.supporter-b.com/home')
  })
  it('redirects a buyer-active user on the partner app to the buyer origin', () => {
    expect(resolveCrossAppRedirect('buyer', 'pg', ORIGINS)).toBe('https://supporter-b.com/home')
  })
})

describe('workspaceSwitchUrl', () => {
  it('same-type switch stays on the current origin (relative)', () => {
    expect(workspaceSwitchUrl('buyer', 'buyer', ORIGINS)).toBe('/home')
  })
  it('cross-type switch returns the absolute other-origin url', () => {
    expect(workspaceSwitchUrl('pg', 'buyer', ORIGINS)).toBe('https://partner.supporter-b.com/home')
  })
})
```

- [ ] **Step 2: Run — verify RED**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm --filter @repo/auth test cross-app`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/auth/src/cross-app.ts`:
```ts
import type { WorkspaceType } from '@repo/shared'

export type AppOrigins = Record<WorkspaceType, string>

/** Null = stay; string = absolute URL to redirect the request to. */
export function resolveCrossAppRedirect(
  activeType: WorkspaceType,
  servingApp: WorkspaceType,
  origins: AppOrigins,
): string | null {
  if (activeType === servingApp) return null
  return `${origins[activeType]}/home`
}

/** Where the workspace switcher should send the user. Relative if same app, absolute if cross-app. */
export function workspaceSwitchUrl(
  targetType: WorkspaceType,
  servingApp: WorkspaceType,
  origins: AppOrigins,
): string {
  if (targetType === servingApp) return '/home'
  return `${origins[targetType]}/home`
}
```

- [ ] **Step 4: Run — verify GREEN**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm --filter @repo/auth test cross-app`
Expected: PASS.

- [ ] **Step 5: Commit** — `feat(auth): cross-subdomain workspace redirect resolver`

### Task 4.2: Wire the resolver into each app's `(app)/layout.tsx` guard

**Files:**
- Modify: `apps/buyer/app/(app)/layout.tsx`, `apps/partner/app/(app)/layout.tsx`
- Create: a shared helper in `@repo/auth` reading origins from env (`NEXT_PUBLIC_BUYER_ORIGIN`, `NEXT_PUBLIC_PARTNER_ORIGIN`)

- [ ] **Step 1: Add an env-backed origins reader to `@repo/auth`** (with a unit test asserting it throws if unset in prod, falls back to `localhost` in dev).
- [ ] **Step 2: In each layout**, after `resolveShellAccess` returns `render` with `active.type`, call `resolveCrossAppRedirect(active.type, '<this-app>', origins)`; if non-null, `redirect(url)` (Next `redirect` accepts absolute URLs).
- [ ] **Step 3:** Existing `resolveShellAccess` integration test extended to assert the cross-app redirect fires for a mismatched type. RED→GREEN.
- [ ] **Step 4: Commit** — `feat(app): bounce mismatched-workspace sessions to the correct subdomain`

### Task 4.3: WorkspaceSwitcher uses `workspaceSwitchUrl` (hard-nav across origins)

**Files:** Modify `packages/ui/src/shell/WorkspaceSwitcher.tsx` (+ its test).

- [ ] **Step 1:** Failing test — selecting a workspace whose type differs from the serving app produces an absolute other-origin href and triggers a **full-page** navigation (`window.location.assign`), not `router.push` (memory `workspace-switch-hard-nav`: nav chrome lives in shared layout, soft nav leaves stale chrome — across origins it's mandatory).
- [ ] **Step 2:** Implement: after `switchWorkspaceAction` succeeds, compute `workspaceSwitchUrl(targetType, servingApp, origins)`; if absolute → `window.location.assign(url)`, else `window.location.assign('/home')` (hard-nav either way for chrome correctness).
- [ ] **Step 3:** GREEN + commit — `feat(ui): workspace switcher hard-navigates across subdomains`

**🚢 Shippable checkpoint:** multi-workspace users can switch buyer↔partner across subdomains with a shared session. Behaviorally complete.

---

## Phase 5 — Deploy topology (`partner.supporter-b.com`)

**Outcome:** Both apps run as separate PM2 processes behind Caddy; partner served at `partner.supporter-b.com`. DNS + env wired.

### Task 5.1: PM2 — second app on port 3100

**Files:** Modify `ecosystem.config.cjs`.

- [ ] **Step 1: Repoint buyer + add partner**
```js
module.exports = {
  apps: [
    {
      name: 'buyer',
      cwd: __dirname + '/apps/buyer',
      script: '../../node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1, exec_mode: 'fork', autorestart: true,
      max_restarts: 10, max_memory_restart: '1G',
      env: { NODE_ENV: 'production', PORT: '3000' },
    },
    {
      name: 'partner',
      cwd: __dirname + '/apps/partner',
      script: '../../node_modules/next/dist/bin/next',
      args: 'start -p 3100',
      instances: 1, exec_mode: 'fork', autorestart: true,
      max_restarts: 10, max_memory_restart: '1G',
      env: { NODE_ENV: 'production', PORT: '3100' },
    },
  ],
}
```
> ⚠️ Memory budget: the Lightsail box is 2GB + 2GB swap currently holding one 1GB-capped Next + Postgres + (admin on another box? verify). Two Next apps at 1GB each may thrash. **Action:** confirm RAM headroom or lower `max_memory_restart` to `768M` each and/or resize the instance. Validate with `pm2 monit` post-deploy.

### Task 5.2: Caddy — partner subdomain + Centrifugo passthrough

**Files:** Modify `deploy/Caddyfile`.

- [ ] **Step 1: Add the partner block** (mirror the main site, including the Centrifugo `/connection/*` passthrough so PG clients get WS on their own origin):
```
partner.{$APP_DOMAIN} {
	encode zstd gzip
	request_body { max_size 25MB }
	handle /connection/* {
		reverse_proxy 127.0.0.1:8000
	}
	handle {
		reverse_proxy 127.0.0.1:3100
	}
}
```
> Centrifugo stays a single instance on :8000; both origins proxy to it. `NEXT_PUBLIC_CENTRIFUGO_WS_URL` for the partner app = `wss://partner.supporter-b.com/connection/websocket` (or keep both pointed at the main origin — cross-origin WS is allowed; per-origin is cleaner for cookies).

### Task 5.3: Per-app env + DNS

- [ ] **Step 1: DNS** — add an `A` record `partner.supporter-b.com` → the Lightsail static IP (same box). Verify it resolves **before** Caddy reloads (ACME needs it).
- [ ] **Step 2: Per-app `.env.production`** in each app dir. Both share `DATABASE_URL`, `AUTH_SECRET`, `AUTH_COOKIE_DOMAIN=.supporter-b.com`, `RESEND_*`, Centrifugo secrets. Differ on:
  - buyer: `AUTH_URL=https://supporter-b.com`, `NEXT_PUBLIC_BUYER_ORIGIN=https://supporter-b.com`, `NEXT_PUBLIC_PARTNER_ORIGIN=https://partner.supporter-b.com`
  - partner: `AUTH_URL=https://partner.supporter-b.com` (same two PUBLIC origins).
- [ ] **Step 3: Update `docs/DEPLOY_LIGHTSAIL.md`** runbook: build both via `pnpm build` (turbo), `pm2 reload ecosystem.config.cjs --update-env`, reload Caddy.

### Task 5.4: Canary

- [ ] **Step 1:** Deploy; log into a **buyer-only** account on `supporter-b.com` → confirm normal. Log into a **PG** account → confirm it bounces to `partner.supporter-b.com` (Phase 4 guard). Use a **dual-workspace** account → switch in the sidebar → confirm hard-nav across subdomains keeps you logged in (shared cookie). Send a chat buyer→PG → confirm realtime delivery on both origins. Award an RFP → confirm the PG gets the in-app notification + email (cross-boundary tx via shared DB, unchanged).

**🚢 Final checkpoint:** two independently-built, independently-deployed apps on one DB + one session. Done.

---

## Self-Review

**Spec coverage:**
- Independent build → Turborepo `--filter` per app (Phase 0, 5). ✅
- Independent deploy → separate PM2 apps + Caddy subdomain (Phase 5). ✅
- `partner.supporter-b.com` → Caddy block + DNS + AUTH_URL (Phase 5). ✅
- Shared session across subdomains → cookie domain (Phase 2) + multi-workspace switch (Phase 4). ✅
- No behavior/data-model change → cross-boundary tx unchanged (shared DB, write-side-local); only session cookie scope changes (logs everyone out once — flagged). ✅
- Clean package boundaries → verified by import-graph probe; 3 type-inversions (Task 1.1). ✅

**Known carried-over gotchas referenced (not regressions):** node20 PATH prefix, pre-existing typecheck RED on wizard test globals, cmdk jsdom polyfills, Component.Skeleton RSC boundary, drizzle push-only schema in `@repo/db`, workspace-switch hard-nav rationale.

**Open decisions for the implementer to confirm before Phase 5:**
1. **RAM** — two 1GB Next apps on a 2GB box. Resize or cap lower? (Task 5.1)
2. **Public auth pages** — host the full `(public)` tree in *both* apps (chosen here, session cookie shared) vs centralize login on buyer only. If centralizing, partner's `(public)` redirects to buyer's login. Confirm UX.
3. **Centrifugo WS origin** — per-subdomain `/connection/*` (chosen) vs both apps pointing at the main origin. Per-subdomain is cleaner for cookie scoping.
