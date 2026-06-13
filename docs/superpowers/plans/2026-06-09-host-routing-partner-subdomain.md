# Host-Routing: PG under partner.supporter-b.com (single app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve PG-facing users under `partner.supporter-b.com` and buyer-facing users under `supporter-b.com` from the **same single Next.js app / single PM2 process** — no repo split, no second process, **no extra memory**. The two hosts share one session; the `(app)` shell redirects a session to its correct host on mismatch; the workspace switcher hard-navigates across hosts; PG-facing emails link to the partner host.

**Architecture:** Caddy points both domains at the one `:3000` app. A pure `lib/site-routing.ts` maps host↔workspace-type. The existing `(app)/layout.tsx` RSC guard (which already has the active workspace type) gains a host-mismatch redirect. `switchWorkspaceAction` (which the switcher already hard-navigates to) returns an absolute other-host URL on cross-type switches. The session cookie is scoped to `.supporter-b.com` so it is valid on both hosts. **This is NOT an isolation boundary** — buyer route code still runs in the same process; the per-host separation is policy-enforced redirect, not physical. It delivers the subdomain UX, not independent deploy/build.

**Tech Stack:** Next.js 16 App Router (RSC `headers()`/`redirect`), Auth.js v5 (cookie config in edge-safe `auth.config.ts`), Caddy, PM2 — all already in the repo.

---

## What this gives / does NOT give (read first)

| | This plan | (the alternative monorepo split) |
|---|---|---|
| `partner.supporter-b.com` origin for PG | ✅ | ✅ |
| Shared session + cross-host workspace switch | ✅ | ✅ |
| Extra memory (OOM) | **0 — same process** | +150–250MB on one box |
| Work | ~5 changes, days | 6 phases, weeks |
| Independent build/deploy | ❌ one app, one deploy | ✅ |
| Fault isolation / security boundary | ❌ same process | ✅ / △ |

Choose this when the **subdomain UX itself** is the goal and the box is memory-constrained. It deliberately trades away independent-deploy.

## File map

- Create: `lib/site-routing.ts` — pure host↔type helpers (no DB/next imports).
- Create: `lib/auth/cookie-config.ts` — pure, edge-safe session-cookie option builder.
- Create: tests for both of the above + `lib/server/__tests__/env-baseurl.test.ts`.
- Modify: `auth.config.ts` — add `cookies.sessionToken`.
- Modify: `app/(app)/layout.tsx` — host-mismatch redirect after the render decision.
- Modify: `lib/server/actions/workspace/switchWorkspaceAction.ts` — host-aware `redirectTo`.
- Modify: `lib/server/env.ts` — add `baseUrlFor(type)`.
- Modify: `lib/server/services/rfp.ts:539,766,954` — PG invite links via `baseUrlFor('pg')`.
- Modify: `deploy/Caddyfile`, `.env.production.example`, `docs/DEPLOY_LIGHTSAIL.md`.
- **Unchanged:** `components/shell/WorkspaceSwitcher.tsx` (already hard-navs to `redirectTo`).

> All test runs in this plan must use the node20 PATH prefix:
> `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test <path>` (memory `node26-breaks-jsdom-localstorage`).
> `pnpm typecheck` is pre-existingly RED on wizard test-globals (memory `typecheck-red-wizard-test-globals`) — filter with `grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'"`.

---

## Phase 1 — Pure host↔type routing helpers (TDD)

**Files:**
- Create: `lib/site-routing.ts`
- Create: `lib/__tests__/site-routing.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/__tests__/site-routing.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  hostServes,
  resolveHostRedirect,
  workspaceSwitchTarget,
  type AppOrigins,
} from '../site-routing';

const PROD: AppOrigins = {
  buyer: 'https://supporter-b.com',
  pg: 'https://partner.supporter-b.com',
};
const LOCAL: AppOrigins = { buyer: 'http://localhost:3000', pg: 'http://localhost:3000' };

describe('hostServes', () => {
  it('maps the buyer host and partner host to their workspace types', () => {
    expect(hostServes('supporter-b.com', PROD)).toBe('buyer');
    expect(hostServes('partner.supporter-b.com', PROD)).toBe('pg');
  });
  it('ignores the port and is case-insensitive', () => {
    expect(hostServes('Partner.Supporter-B.com:443', PROD)).toBe('pg');
  });
  it('returns null for an unknown host (IP, preview domain)', () => {
    expect(hostServes('52.78.126.178', PROD)).toBeNull();
    expect(hostServes(null, PROD)).toBeNull();
  });
  it('disables routing when both origins share a host (local/dev)', () => {
    expect(hostServes('localhost', LOCAL)).toBeNull();
  });
});

describe('resolveHostRedirect', () => {
  it('returns null when the host already serves the active type', () => {
    expect(resolveHostRedirect('buyer', 'supporter-b.com', PROD)).toBeNull();
    expect(resolveHostRedirect('pg', 'partner.supporter-b.com', PROD)).toBeNull();
  });
  it('redirects a pg session on the buyer host to the partner origin', () => {
    expect(resolveHostRedirect('pg', 'supporter-b.com', PROD)).toBe(
      'https://partner.supporter-b.com/home',
    );
  });
  it('redirects a buyer session on the partner host to the buyer origin', () => {
    expect(resolveHostRedirect('buyer', 'partner.supporter-b.com', PROD)).toBe(
      'https://supporter-b.com/home',
    );
  });
  it('never redirects on an unknown host or in local/dev (no loop risk)', () => {
    expect(resolveHostRedirect('pg', '52.78.126.178', PROD)).toBeNull();
    expect(resolveHostRedirect('pg', 'localhost', LOCAL)).toBeNull();
  });
});

describe('workspaceSwitchTarget', () => {
  it('stays relative when switching to a type the current host serves', () => {
    expect(workspaceSwitchTarget('buyer', 'supporter-b.com', PROD)).toBe('/home');
  });
  it('returns the absolute other-origin url on a cross-host switch', () => {
    expect(workspaceSwitchTarget('pg', 'supporter-b.com', PROD)).toBe(
      'https://partner.supporter-b.com/home',
    );
  });
  it('stays relative in local/dev (single host)', () => {
    expect(workspaceSwitchTarget('pg', 'localhost', LOCAL)).toBe('/home');
  });
});
```

- [ ] **Step 2: Run — verify RED**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/__tests__/site-routing.test.ts`
Expected: FAIL — `Cannot find module '../site-routing'`.

- [ ] **Step 3: Implement**

`lib/site-routing.ts`:
```ts
import type { WorkspaceType } from '@/lib/types/workspace';

export type AppOrigins = Record<WorkspaceType, string>;

/** Origins per workspace type, from env. In local/dev both default to the same host (routing disabled). */
export function appOrigins(): AppOrigins {
  const fallback = process.env.AUTH_URL ?? 'http://localhost:3000';
  return {
    buyer: process.env.NEXT_PUBLIC_BUYER_ORIGIN ?? fallback,
    pg: process.env.NEXT_PUBLIC_PARTNER_ORIGIN ?? fallback,
  };
}

/** Which workspace type a request host serves, or null if unknown / routing disabled. */
export function hostServes(host: string | null, origins: AppOrigins): WorkspaceType | null {
  if (!host) return null;
  const buyerHost = new URL(origins.buyer).hostname.toLowerCase();
  const partnerHost = new URL(origins.pg).hostname.toLowerCase();
  if (buyerHost === partnerHost) return null; // single-host (local/dev) → routing off
  const h = host.split(':')[0].toLowerCase();
  if (h === partnerHost) return 'pg';
  if (h === buyerHost) return 'buyer';
  return null;
}

/** Null = stay; string = absolute URL to redirect this request to. */
export function resolveHostRedirect(
  activeType: WorkspaceType,
  host: string | null,
  origins: AppOrigins,
): string | null {
  const serving = hostServes(host, origins);
  if (serving === null || serving === activeType) return null;
  return `${origins[activeType]}/home`;
}

/** Where a workspace switch lands: relative if same host, absolute if cross-host. */
export function workspaceSwitchTarget(
  targetType: WorkspaceType,
  host: string | null,
  origins: AppOrigins,
): string {
  const serving = hostServes(host, origins);
  if (serving === null || serving === targetType) return '/home';
  return `${origins[targetType]}/home`;
}
```

- [ ] **Step 4: Run — verify GREEN**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/__tests__/site-routing.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**
```bash
git add lib/site-routing.ts lib/__tests__/site-routing.test.ts
git commit -m "feat(routing): pure host↔workspace-type resolver for partner subdomain"
```

---

## Phase 2 — Share the session cookie across both hosts (TDD)

The cookie must be scoped to `.supporter-b.com` so a login on either host is valid on both. Put the option builder in a pure, edge-safe module (auth.config.ts is shared with the Edge `proxy.ts` and must not pull Node deps).

**Files:**
- Create: `lib/auth/cookie-config.ts`
- Create: `lib/auth/__tests__/cookie-config.test.ts`
- Modify: `auth.config.ts`

- [ ] **Step 1: Write the failing test**

`lib/auth/__tests__/cookie-config.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { sessionCookie } from '../cookie-config';

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe('sessionCookie', () => {
  it('scopes the cookie to the parent domain when AUTH_COOKIE_DOMAIN is set', () => {
    process.env.AUTH_COOKIE_DOMAIN = '.supporter-b.com';
    process.env.NODE_ENV = 'production';
    const c = sessionCookie();
    expect(c.options.domain).toBe('.supporter-b.com');
    expect(c.options.secure).toBe(true);
    expect(c.options.sameSite).toBe('lax');
    expect(c.options.httpOnly).toBe(true);
    expect(c.name).toBe('__Secure-authjs.session-token');
  });

  it('omits the domain (host-only) and drops the __Secure- prefix outside production', () => {
    delete process.env.AUTH_COOKIE_DOMAIN;
    process.env.NODE_ENV = 'development';
    const c = sessionCookie();
    expect(c.options.domain).toBeUndefined();
    expect(c.options.secure).toBe(false);
    expect(c.name).toBe('authjs.session-token');
  });
});
```

- [ ] **Step 2: Run — verify RED**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/auth/__tests__/cookie-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (edge-safe — only reads `process.env`, no imports)**

`lib/auth/cookie-config.ts`:
```ts
/**
 * Session-cookie config shared by auth.ts (Node) and proxy.ts (Edge).
 * MUST stay import-free of Node-only modules — only reads process.env.
 *
 * AUTH_COOKIE_DOMAIN='.supporter-b.com' makes the cookie valid on both
 * supporter-b.com and partner.supporter-b.com (cross-host SSO). Leave unset
 * locally for a host-only cookie on localhost.
 */
export function sessionCookie() {
  const prod = process.env.NODE_ENV === 'production';
  const domain = process.env.AUTH_COOKIE_DOMAIN || undefined;
  return {
    name: prod ? '__Secure-authjs.session-token' : 'authjs.session-token',
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      secure: prod,
      ...(domain ? { domain } : {}),
    },
  };
}
```

- [ ] **Step 4: Run — verify GREEN**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/auth/__tests__/cookie-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `auth.config.ts`**

Add the import at the top and a `cookies` key into the exported config object (after `session: { strategy: 'jwt' }`):
```ts
import { sessionCookie } from '@/lib/auth/cookie-config';
// ...
  session: { strategy: 'jwt' },
  cookies: { sessionToken: sessionCookie() },
  pages: { signIn: '/login' },
// ...
```

- [ ] **Step 6: Full suite green (no auth test regressions) + commit**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test`
```bash
git add lib/auth/cookie-config.ts lib/auth/__tests__/cookie-config.test.ts auth.config.ts
git commit -m "feat(auth): scope session cookie to parent domain for cross-host SSO"
```

> ⚠️ **Deploy impact:** adding the cookie `domain` (and the `__Secure-` name in prod) changes the cookie identity — **every user is logged out once** on the rollout that ships this. Schedule it with the Caddy/DNS cutover (Phase 5), not mid-week.

---

## Phase 3 — Enforce host↔type in the shell guard + switch action

### Task 3.1: `(app)/layout.tsx` redirects a mismatched session to the right host

**Files:** Modify `app/(app)/layout.tsx`.

- [ ] **Step 1: Add the imports**

At the top of `app/(app)/layout.tsx`, add:
```ts
import { headers } from 'next/headers';
import { appOrigins, resolveHostRedirect } from '@/lib/site-routing';
```

- [ ] **Step 2: Redirect after the render decision is known**

Immediately after:
```ts
  const active = decision.active;
```
insert:
```ts
  // Host routing: a PG-active session on supporter-b.com (or a buyer-active
  // session on partner.supporter-b.com) is bounced to its correct host. No-op on
  // unknown hosts and in local/dev (single host) — see lib/site-routing.
  const host = (await headers()).get('host');
  const hostRedirect = resolveHostRedirect(active.type, host, appOrigins());
  if (hostRedirect) {
    redirect(hostRedirect);
  }
```
> `redirect()` accepts an absolute URL (issues a 307). `headers()` is already-dynamic-safe here (the layout calls `auth()`, so the route is dynamic).

- [ ] **Step 3: Verify build + existing shell suite green**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/auth`
Expected: PASS (shell-access tests unaffected — guard logic unchanged; host logic is the unit-tested `resolveHostRedirect`).
Run: `pnpm build` (or `pnpm --filter` equivalent)
Expected: builds; `app/(app)/layout.tsx` type-checks.

- [ ] **Step 4: Commit**
```bash
git add "app/(app)/layout.tsx"
git commit -m "feat(app): bounce mismatched-workspace sessions to their host"
```

### Task 3.2: `switchWorkspaceAction` returns a host-aware redirect (TDD via the pure helper)

The switcher already hard-navigates to `redirectTo` (WorkspaceSwitcher.tsx:39). Only the action's return value changes; the component is untouched.

**Files:** Modify `lib/server/actions/workspace/switchWorkspaceAction.ts`.

- [ ] **Step 1: Widen the result type**

Change:
```ts
export type SwitchWorkspaceResult =
  | { ok: true; redirectTo: '/home' }
  | { ok: false; error: 'UNAUTHENTICATED' | 'INVALID_INPUT' | 'NOT_MEMBER' };
```
to:
```ts
export type SwitchWorkspaceResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: 'UNAUTHENTICATED' | 'INVALID_INPUT' | 'NOT_MEMBER' };
```

- [ ] **Step 2: Compute the target from the current host**

Add imports:
```ts
import { headers } from 'next/headers';
import { appOrigins, workspaceSwitchTarget } from '@/lib/site-routing';
```
Replace the final two lines:
```ts
  revalidatePath('/home');
  return { ok: true, redirectTo: '/home' };
```
with:
```ts
  // Cross-type switch lands on the other host (absolute); same-type stays relative.
  // The switcher hard-navigates to redirectTo, so an absolute URL crosses origins
  // while keeping the (already domain-scoped) session cookie. See WorkspaceSwitcher.
  const host = (await headers()).get('host');
  const redirectTo = workspaceSwitchTarget(membership.workspaceType, host, appOrigins());
  revalidatePath('/home');
  return { ok: true, redirectTo };
```

- [ ] **Step 3: Verify**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/workspace`
Expected: PASS — if an existing test asserted the literal `'/home'`, update it to assert `'/home'` for a same-type switch (still true in single-host test env where `appOrigins()` collapses). Cross-host behavior is covered by `workspaceSwitchTarget` unit tests in Phase 1.
Run: `pnpm typecheck 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach)'" | grep switchWorkspace` → no new errors.

- [ ] **Step 4: Commit**
```bash
git add lib/server/actions/workspace/switchWorkspaceAction.ts
git commit -m "feat(workspace): cross-host redirect target on workspace switch"
```

---

## Phase 4 — PG-facing emails link to the partner host (TDD)

RFP invitations always go to PG workspaces, so their links must point at `partner.supporter-b.com`.

### Task 4.1: `baseUrlFor(type)` helper

**Files:** Modify `lib/server/env.ts`; Create `lib/server/__tests__/env-baseurl.test.ts`.

- [ ] **Step 1: Write the failing test**

`lib/server/__tests__/env-baseurl.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { baseUrl, baseUrlFor } from '../env';

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe('baseUrlFor', () => {
  it('uses the partner origin for pg-facing links', () => {
    process.env.NEXT_PUBLIC_PARTNER_ORIGIN = 'https://partner.supporter-b.com';
    expect(baseUrlFor('pg')).toBe('https://partner.supporter-b.com');
  });
  it('uses the buyer origin for buyer-facing links', () => {
    process.env.NEXT_PUBLIC_BUYER_ORIGIN = 'https://supporter-b.com';
    expect(baseUrlFor('buyer')).toBe('https://supporter-b.com');
  });
  it('falls back to baseUrl() when the per-type origin is unset', () => {
    delete process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
    delete process.env.NEXT_PUBLIC_BUYER_ORIGIN;
    expect(baseUrlFor('pg')).toBe(baseUrl());
  });
});
```

- [ ] **Step 2: Run — verify RED**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/__tests__/env-baseurl.test.ts`
Expected: FAIL — `baseUrlFor` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/server/env.ts`:
```ts
import type { WorkspaceType } from '@/lib/types/workspace';

/** Absolute origin for links shown to a given workspace type (partner subdomain for pg). */
export function baseUrlFor(type: WorkspaceType): string {
  const origin =
    type === 'pg'
      ? process.env.NEXT_PUBLIC_PARTNER_ORIGIN
      : process.env.NEXT_PUBLIC_BUYER_ORIGIN;
  return origin ?? baseUrl();
}
```

- [ ] **Step 4: Run — verify GREEN**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/__tests__/env-baseurl.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — `feat(env): baseUrlFor(type) for per-host email links`

### Task 4.2: Point RFP invite links at the partner host

**Files:** Modify `lib/server/services/rfp.ts` (lines 539, 766, 954 — the three `inviteUrl` builders).

- [ ] **Step 1: Confirm the import**

`rfp.ts` already imports `baseUrl` (via `./_shared`). Add `baseUrlFor`:
```ts
import { baseUrl, baseUrlFor } from '@/lib/server/env';
```
> If `rfp.ts` currently re-exports `baseUrl` from `./_shared`, switch that one import line to `@/lib/server/env` so both names come from the same module. Verify no duplicate-identifier error.

- [ ] **Step 2: Replace each of the three invite-URL builders**

At lines 539, 766, 954, change:
```ts
const inviteUrl = `${baseUrl()}/invite/rfp/${rawToken}`;
```
to:
```ts
const inviteUrl = `${baseUrlFor('pg')}/invite/rfp/${rawToken}`;
```
(RFP invitations are always PG-facing.)

- [ ] **Step 3: Verify the rfp service suite green**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/services`
Expected: PASS — in test env `NEXT_PUBLIC_PARTNER_ORIGIN` is unset, so `baseUrlFor('pg')` falls back to `baseUrl()`; existing assertions on the invite URL stay valid.

- [ ] **Step 4: Commit** — `feat(rfp): PG invitation emails link to the partner host`

> Audit note (log, don't silently skip): other outbox templates (`workspaceInvited`, password reset, signup verify, award) are addressed to mixed/either-side recipients. Award emails to the winning PG could also use `baseUrlFor('pg')`; workspace invites depend on the invited workspace's type. **Scope of THIS plan = RFP invitations only** (the clearest PG-only case). File a follow-up for award/workspace-invite host correctness rather than guessing here.

---

## Phase 5 — Deploy: Caddy two-host + env + DNS

### Task 5.1: Caddy serves both domains from the one app

**Files:** Modify `deploy/Caddyfile`.

- [ ] **Step 1: Make the main site block answer both hosts**

Change the site address line from `{$APP_DOMAIN} {` to a two-host block (the body — body limit, `/connection/*` Centrifugo passthrough, and the `:3000` proxy — is identical for both):
```
{$APP_DOMAIN}, partner.{$APP_DOMAIN} {
	encode zstd gzip
	request_body { max_size 25MB }
	handle /connection/* {
		reverse_proxy 127.0.0.1:8000
	}
	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
```
> Single app, single Centrifugo. Both hosts proxy to the same `:3000` and the same `:8000`. The `admin.{$APP_DOMAIN}` block stays untouched.

### Task 5.2: Env vars

**Files:** Modify `.env.production.example` (and the live `.env.production` on the box).

- [ ] **Step 1: Add the three new vars**

In `.env.production.example` add:
```
# Cross-host session: share the cookie across supporter-b.com and partner.supporter-b.com.
# Leave UNSET locally (host-only cookie on localhost). Changing this logs everyone out once.
AUTH_COOKIE_DOMAIN=.supporter-b.com

# Per-host origins for host routing + per-type email links. Unset locally = routing disabled.
NEXT_PUBLIC_BUYER_ORIGIN=https://supporter-b.com
NEXT_PUBLIC_PARTNER_ORIGIN=https://partner.supporter-b.com
```
> `NEXT_PUBLIC_*` are inlined at build time — **rebuild** after setting them, don't just `pm2 reload`. `AUTH_COOKIE_DOMAIN` is runtime (read by `sessionCookie()`), so a reload suffices for that one.

### Task 5.3: DNS

- [ ] **Step 1:** Add an `A` record `partner.supporter-b.com` → the Lightsail static IP (same box, `52.78.126.178`). Verify it resolves **before** reloading Caddy (ACME challenge needs it):
Run: `dig +short partner.supporter-b.com`
Expected: the Lightsail IP.

### Task 5.4: Update the runbook + ship

**Files:** Modify `docs/DEPLOY_LIGHTSAIL.md`.

- [ ] **Step 1:** Document: set the three env vars → `pnpm build` (NEXT_PUBLIC inline) → `pm2 reload ecosystem.config.cjs --update-env` → reload Caddy (`caddy reload` / systemd). Note the one-time forced logout.

### Task 5.5: Canary

- [ ] **Step 1:** After deploy verify on the live box:
  - buyer account on `supporter-b.com` → normal.
  - PG account on `supporter-b.com/home` → 307 to `partner.supporter-b.com/home`, renders PG home, **still logged in** (shared cookie).
  - dual-workspace account → sidebar switch buyer→PG → hard-nav to `partner.supporter-b.com`, stays logged in.
  - send a buyer→PG chat → realtime delivery works on both origins (one Centrifugo).
  - buyer awards an RFP → winning PG receives the in-app notification + email; the email's invite/links resolve to `partner.supporter-b.com`.
  - hit `partner.supporter-b.com/rfp` as a buyer → bounced back to `supporter-b.com`.

---

## Self-Review

**Goal coverage:**
- PG under partner host → host routing in `layout.tsx` + Caddy two-host (Phase 3, 5). ✅
- Same process / zero extra memory → no new app/process introduced anywhere. ✅
- Shared session across hosts → cookie domain (Phase 2). ✅
- Cross-host workspace switch → `switchWorkspaceAction` + already-hard-nav switcher (Phase 3.2). ✅
- PG emails → partner host → `baseUrlFor('pg')` in `rfp.ts` (Phase 4). ✅

**No-loop safety:** `resolveHostRedirect` only fires for *known, distinct* hosts; returns null on unknown host and when both origins collapse to one (local/dev). A bounce sends a session to the host that serves its type, where the next guard pass matches → renders. No ping-pong. Verified by the `resolveHostRedirect` "never redirects on unknown host / local" tests.

**Type consistency:** `WorkspaceType = 'buyer' | 'pg'` (`lib/types/workspace.ts`) used throughout; `appOrigins(): Record<WorkspaceType,string>`; `SwitchWorkspaceResult.redirectTo` widened `'/home'`→`string` (the only public-type change; switcher consumes it as a string already).

**Honest scope limits (logged, not hidden):**
- This is **not** an isolation boundary — buyer code still executes in the process serving the partner host; per-host separation is redirect policy. No independent deploy/build, no fault isolation. (That requires the monorepo split — see `2026-06-09-monorepo-buyer-pg-split.md`.)
- Only **RFP invitation** emails are host-corrected here; award + workspace-invite email host correctness is a filed follow-up, not done.
- One-time forced logout on the cookie-domain rollout (flagged in Phase 2 + Phase 5).

**Open decision before Phase 5:** keep the public auth pages answering on **both** hosts (chosen — a PG can log in directly at `partner.supporter-b.com/login`, cookie is shared) vs canonicalizing login to the buyer host. Default here = both, which needs no extra work since it's one app.
```
