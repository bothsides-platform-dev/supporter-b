# Online Presence — M1 (core binary online) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a global "online" dot (any open app tab = online, page-independent) on the inbox list, home recent-messages widget, and chat thread header, built on a new public Centrifugo `presence` namespace.

**Architecture:** Every authenticated user's `<PresenceClient/>` eagerly opens the WS and self-broadcasts to `presence:ws:<theirWorkspaceId>`. Each surface observes the `presence:ws:<V>` channels of the workspaces currently rendered in its viewport (interest-based, cap 50). A workspace is "online" iff its `presence:ws:<V>` map has ≥1 entry whose `connInfo.workspaceId === V`. Presence is fully public (no ACL — `allow_subscribe_for_client`); the connection JWT is the only gate.

**Tech Stack:** Next.js 16 (App Router), React 19, Centrifugo v6 (self-hosted, Memory engine), `centrifuge-js`, Vitest + `@testing-library/react` (unit), Vitest + Docker (integration), `jose` (JWT).

**Design source:** `docs/superpowers/specs/2026-06-21-online-presence-design.md` (rev3). This plan implements **M1 only** (binary online). Activity/idle (M2) and last-seen (deleted, M3) are out of scope.

## Global Constraints

- **TDD, RED first** (CLAUDE.md Iron Law): no production code without a failing test you watched fail. Run single files with `pnpm test <path>`.
- **Repo boundary** (ESLint `repo-boundary/db-access`): only `lib/server/repositories/**` may import `@/lib/db/{schema,client}` as values. Presence code touches no DB except via the existing token-route gates.
- **Graceful no-op**: when `NEXT_PUBLIC_CENTRIFUGO_WS_URL` is unset (dev + every unit test) `getCentrifuge()` returns `null` → zero subscriptions, no dots, no throw. Every client unit defends this.
- **Centrifugo v6 facts** (verified, https://centrifugal.dev/docs/server/channel_permissions): client subscribe AND publish are DENIED by default (`103`). The `presence` namespace MUST set `allow_subscribe_for_client: true`; activity (M2) needs `allow_publish_for_subscriber: true`. Mocked unit tests CANNOT verify this — Task 11 (integration smoke) is the only guard.
- **No new env vars. DDL 0.**
- **Linear design**: dot is a 2.5×2.5 status dot, `shape-full` allowed for dots; online uses `--md-sys-color-tertiary` (existing); never `№`; numerics N/A here.
- Deploy after merge = `docker compose up -d centrifugo` (recreate). App restart for the route/token changes.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/server/realtime/centrifugo.ts` | add `presenceWsChannel(wsId)` channel-name single-source + `disconnectCentrifugoUser(userId)` HTTP-API helper | 4, 10 |
| `lib/server/realtime/token.ts` | embed `info:{workspaceId}`, TTL 30m | 1 |
| `app/api/centrifugo/connection-token/route.ts` | pass `workspaceId`, route-local revocation cache | 2 |
| `lib/realtime/presence.ts` | pure: `onlineWorkspaceIds`, `deriveActivity`, `PresenceEntry` type | 4 |
| `lib/realtime/managedSubscribe.ts` | framework-agnostic subscribe+disposer primitive | 5 |
| `lib/hooks/useCentrifugoSubscription.ts` | refactor onto `managedSubscribe` (behavior-preserving) | 5 |
| `components/presence/WorkspacePresenceProvider.tsx` | interest-set Map manager (cap 50, debounce, conditional focus) + `useWorkspacePresence` | 6 |
| `components/presence/PresenceClient.tsx` | self-broadcast (eager WS), `!isDemo` gate, switch disconnect | 7 |
| `components/presence/PresenceDot.tsx` | shared 3-state dot (M1 uses online/offline) + aria-label | 9 |
| `deploy/centrifugo/config.yaml` | `presence` namespace + `chat` typing publish key | 3 |
| `deploy/__tests__/centrifugo-presence-namespace.test.ts` | drift guard (presence keys + `presence_ttl` absent + chat publish) | 3 |
| `lib/realtime/__tests__/presence.integration.test.ts` | ephemeral-Centrifugo smoke (CI) | 11 |
| `lib/auth/shell-access.ts` + repo | expose `isDemo` on the active workspace summary | 7 |

**Lanes (parallel worktrees):** Lane A = Task 3, 11 (infra/CI). Lane B = Task 1, 2, 10 (token/auth). Lane C = Task 4 → 5 → 6 → 7 → 9 (client, sequential). Task 12 last (touches centrifugo test). Start A, B, C in parallel; C is internally sequential.

---

### Task 1: Connection token carries workspaceId + TTL 30m

**Files:**
- Modify: `lib/server/realtime/token.ts`
- Test: `lib/server/realtime/__tests__/token.test.ts`

**Interfaces:**
- Produces: `issueCentrifugoConnectionToken(userId: string, workspaceId?: string): Promise<string>` — JWT with `sub=userId`, `info:{ workspaceId }` (omitted when arg absent), `exp` ~30m.

- [ ] **Step 1: Update the existing TTL assertion to RED + add the info assertion**

In `lib/server/realtime/__tests__/token.test.ts`, change the first test's upper bound and add `info`:

```typescript
  it('signs an HS256 JWT with sub, info.workspaceId, and a ~30m exp', async () => {
    vi.stubEnv('CENTRIFUGO_TOKEN_HMAC_SECRET', SECRET);

    const token = await issueCentrifugoConnectionToken('user-42', 'ws-9');

    const { payload, protectedHeader } = await jwtVerify(token, encode(SECRET));
    expect(protectedHeader.alg).toBe('HS256');
    expect(payload.sub).toBe('user-42');
    expect((payload.info as { workspaceId?: string }).workspaceId).toBe('ws-9');
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThan(now + 25 * 60);
    expect(payload.exp).toBeLessThanOrEqual(now + 31 * 60);
  });

  it('omits info when no workspaceId is given (back-compat)', async () => {
    vi.stubEnv('CENTRIFUGO_TOKEN_HMAC_SECRET', SECRET);
    const token = await issueCentrifugoConnectionToken('user-1');
    const { payload } = await jwtVerify(token, encode(SECRET));
    expect(payload.info).toBeUndefined();
  });
```

- [ ] **Step 2: Run test → verify RED**

Run: `pnpm test lib/server/realtime/__tests__/token.test.ts`
Expected: FAIL — exp exceeds `now + 11*60` (old impl) / `info` undefined.

- [ ] **Step 3: Implement**

In `lib/server/realtime/token.ts`: change `const TOKEN_TTL = '10m'` → `'30m'`. Replace the function body:

```typescript
export async function issueCentrifugoConnectionToken(
  userId: string,
  workspaceId?: string,
): Promise<string> {
  const secret = process.env.CENTRIFUGO_TOKEN_HMAC_SECRET;
  if (!secret) {
    throw new Error(
      'CENTRIFUGO_TOKEN_HMAC_SECRET is not set — cannot issue a Centrifugo connection token.',
    );
  }
  const claims = workspaceId ? { info: { workspaceId } } : {};
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setExpirationTime(TOKEN_TTL)
    .sign(new TextEncoder().encode(secret));
}
```

Update the module-doc comment `~10 minutes` → `~30 minutes` and note `info.workspaceId`.

- [ ] **Step 4: Run test → verify GREEN**

Run: `pnpm test lib/server/realtime/__tests__/token.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/server/realtime/token.ts lib/server/realtime/__tests__/token.test.ts
git commit -m "feat(presence): connection token carries info.workspaceId, TTL 30m"
```

---

### Task 2: connection-token route — pass workspaceId + route-local revocation cache

**Files:**
- Modify: `app/api/centrifugo/connection-token/route.ts`
- Test: `app/api/centrifugo/__tests__/connection-token.route.test.ts` (create if absent)

**Interfaces:**
- Consumes: `issueCentrifugoConnectionToken(userId, workspaceId)` (Task 1), `isSessionRevoked`/`isEmailUnverified` from `@/lib/auth/session`.
- Produces: route still returns `{ token }`; gates unchanged in behavior; a **module-local** 5–10s cache wraps the two gate reads keyed by userId — `lib/auth/session.ts` is NOT modified (C1: server-action revocation SLA unchanged).

- [ ] **Step 1: Write the failing tests**

Create `app/api/centrifugo/__tests__/connection-token.route.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({
  isSessionRevoked: vi.fn().mockResolvedValue(false),
  isEmailUnverified: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/server/realtime/token', () => ({
  issueCentrifugoConnectionToken: vi.fn().mockResolvedValue('tok'),
}));

const load = async () => {
  const route = await import('@/app/api/centrifugo/connection-token/route');
  return route.POST;
};

beforeEach(() => vi.resetModules());
afterEach(() => vi.clearAllMocks());

it('passes the session workspaceId into the token', async () => {
  const { auth } = await import('@/auth');
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1', workspaceId: 'ws-1' } });
  const { issueCentrifugoConnectionToken } = await import('@/lib/server/realtime/token');
  const POST = await load();

  await POST();

  expect(issueCentrifugoConnectionToken).toHaveBeenCalledWith('u1', 'ws-1');
});

it('caches the revocation check across rapid reconnects (1 DB read for N calls)', async () => {
  const { auth } = await import('@/auth');
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1', workspaceId: 'ws-1' } });
  const { isSessionRevoked } = await import('@/lib/auth/session');
  const POST = await load();

  await POST();
  await POST();
  await POST();

  expect(isSessionRevoked).toHaveBeenCalledTimes(1);
});

it('still 401s a revoked session after the cache TTL expires', async () => {
  vi.useFakeTimers();
  const { auth } = await import('@/auth');
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1', workspaceId: 'ws-1' } });
  const { isSessionRevoked } = await import('@/lib/auth/session');
  (isSessionRevoked as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  const POST = await load();

  const res = await POST();
  expect(res.status).toBe(401);
  vi.advanceTimersByTime(11_000);
  const res2 = await POST();
  expect(res2.status).toBe(401);
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run test → verify RED**

Run: `pnpm test app/api/centrifugo/__tests__/connection-token.route.test.ts`
Expected: FAIL — `issueCentrifugoConnectionToken` called with 1 arg; `isSessionRevoked` called 3 times (no cache).

- [ ] **Step 3: Implement**

Rewrite `app/api/centrifugo/connection-token/route.ts`. Add a module-scope cache and use it for BOTH gates. Pass `session.user.workspaceId`.

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { issueCentrifugoConnectionToken } from '@/lib/server/realtime/token';
import type { Session } from 'next-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Route-LOCAL gate cache (C1). The eager always-on WS makes every Centrifugo
// restart a reconnect storm; this collapses the per-reconnect gate reads to ~1
// DB read / user / window. Deliberately NOT in lib/auth/session.ts — caching the
// shared helpers would widen the revocation window for EVERY server action.
const GATE_TTL_MS = 10_000;
type Gate = { revoked: boolean; unverified: boolean; at: number };
const gateCache = new Map<string, Gate>();

async function checkGates(session: Session, now: number): Promise<Gate> {
  const userId = session.user!.id!;
  const hit = gateCache.get(userId);
  if (hit && now - hit.at < GATE_TTL_MS) return hit;
  const [revoked, unverified] = await Promise.all([
    isSessionRevoked(session),
    isEmailUnverified(session),
  ]);
  const gate = { revoked, unverified, at: now };
  gateCache.set(userId, gate);
  return gate;
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });

  const gate = await checkGates(session, Date.now());
  if (gate.revoked) return new NextResponse('Unauthorized', { status: 401 });
  if (gate.unverified) return new NextResponse('Forbidden', { status: 403 });

  const token = await issueCentrifugoConnectionToken(
    session.user.id,
    session.user.workspaceId,
  );
  return NextResponse.json({ token });
}
```

> Note: `Date.now()` is fine in production code (the workflow-script ban does not apply to the app). The test stubs time with `vi.useFakeTimers()`.

- [ ] **Step 4: Run test → verify GREEN**

Run: `pnpm test app/api/centrifugo/__tests__/connection-token.route.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm shared session.ts untouched (C1 regression guard)**

Run: `git diff --name-only` — confirm `lib/auth/session.ts` is NOT in the list. (The cache lives only in the route.)

- [ ] **Step 6: Commit**

```bash
git add app/api/centrifugo/connection-token/route.ts app/api/centrifugo/__tests__/connection-token.route.test.ts
git commit -m "feat(presence): connection-token passes workspaceId + route-local gate cache"
```

---

### Task 3: presence Centrifugo namespace + drift guard + chat typing fix

**Files:**
- Modify: `deploy/centrifugo/config.yaml`
- Create: `deploy/__tests__/centrifugo-presence-namespace.test.ts`

**Interfaces:** none (config + static assertions). Runtime behavior verified by Task 11.

- [ ] **Step 1: Write the failing drift guard**

Create `deploy/__tests__/centrifugo-presence-namespace.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Drift guard for the presence namespace. Centrifugo v6 DENIES client subscribe
// AND publish by default (103). Without allow_subscribe_for_client every dot is
// silently dead; without allow_publish_for_subscriber the M2 activity layer (and
// chat typing) can't publish. presence_ttl is NOT a v6 key — if present it is a
// silently-ignored "unknown key" (the 2026-06-20 footgun class). Static assert
// only; real behavior is covered by the integration smoke test.
const config = readFileSync(
  fileURLToPath(new URL('../centrifugo/config.yaml', import.meta.url)),
  'utf8',
);

describe('Centrifugo presence namespace (v6)', () => {
  it('declares a presence namespace', () => {
    expect(config).toMatch(/^\s*-\s*name:\s*presence\s*$/m);
  });
  it('enables presence + join_leave + force_push_join_leave', () => {
    expect(config).toMatch(/^\s*presence:\s*true\s*$/m);
    expect(config).toMatch(/^\s*join_leave:\s*true\s*$/m);
    expect(config).toMatch(/^\s*force_push_join_leave:\s*true\s*$/m);
  });
  it('opens client subscribe + publish for the public presence model', () => {
    expect(config).toMatch(/^\s*allow_subscribe_for_client:\s*true\s*$/m);
    expect(config).toMatch(/^\s*allow_publish_for_subscriber:\s*true\s*$/m);
  });
  it('keeps a last-state for late-observer activity recovery', () => {
    expect(config).toMatch(/^\s*history_size:\s*1\s*$/m);
    expect(config).toMatch(/^\s*history_ttl:/m);
  });
  it('does NOT use the phantom presence_ttl key (v6 unknown-key footgun)', () => {
    expect(config).not.toMatch(/^\s*presence_ttl\s*:/m);
  });
  it('does NOT route presence subscribes through the ACL proxy (public)', () => {
    // presence block must not enable subscribe_proxy (no relationship ACL, D1).
    const presenceBlock = config.slice(config.indexOf('name: presence'));
    const nextNs = presenceBlock.indexOf('- name:', 5);
    const block = nextNs > -1 ? presenceBlock.slice(0, nextNs) : presenceBlock;
    expect(block).not.toMatch(/subscribe_proxy_enabled:\s*true/);
  });
  it('fixes chat typing: chat namespace allows client publish', () => {
    const chatBlock = config.slice(config.indexOf('name: chat'));
    const nextNs = chatBlock.indexOf('- name:', 5);
    const block = nextNs > -1 ? chatBlock.slice(0, nextNs) : chatBlock;
    expect(block).toMatch(/allow_publish_for_subscriber:\s*true/);
  });
});
```

- [ ] **Step 2: Run → verify RED**

Run: `pnpm test deploy/__tests__/centrifugo-presence-namespace.test.ts`
Expected: FAIL — no presence namespace, no chat publish key.

- [ ] **Step 3: Implement config**

In `deploy/centrifugo/config.yaml`, under `channel.namespaces:`, add `allow_publish_for_subscriber: true` to the existing `chat` block, then append the `presence` namespace (mirror the v6 shape; comment the v6 facts):

```yaml
    # chat namespace — channel convention: chat:conversation:<uuid>
    - name: chat
      presence: true
      join_leave: true
      subscribe_proxy_enabled: true
      # v6 denies client publish by default (103) — typing (useChatChannel client
      # publish) was silently dead in prod without this. See presence-namespace test.
      allow_publish_for_subscriber: true

    # team namespace — channel convention: team:rfp:<rfpId>:<workspaceId>
    - name: team
      subscribe_proxy_enabled: true

    # presence namespace — channel convention: presence:ws:<workspaceId>.
    # Fully PUBLIC (no ACL, design D1): any authenticated connection may observe
    # any workspace's online status. v6 denies client subscribe/publish by
    # default, so both are opened explicitly. NO presence_ttl (not a v6 key →
    # unknown-key footgun); freshness is governed by client.ping_interval/pong.
    - name: presence
      presence: true
      join_leave: true
      force_push_join_leave: true
      allow_subscribe_for_client: true
      allow_publish_for_subscriber: true
      history_size: 1
      history_ttl: 60s
```

- [ ] **Step 4: Run → verify GREEN**

Run: `pnpm test deploy/__tests__/centrifugo-presence-namespace.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add deploy/centrifugo/config.yaml deploy/__tests__/centrifugo-presence-namespace.test.ts
git commit -m "feat(presence): add public presence Centrifugo namespace + fix chat typing publish"
```

---

### Task 4: channel helper + online pure functions

**Files:**
- Modify: `lib/server/realtime/centrifugo.ts` (add `presenceWsChannel`)
- Create: `lib/realtime/presence.ts`
- Test: `lib/realtime/__tests__/presence.test.ts`

**Interfaces:**
- Produces:
  - `presenceWsChannel(workspaceId: string): string` → `presence:ws:<workspaceId>`
  - `type PresenceEntry = { connInfo?: { workspaceId?: string }; data?: { state?: string } }`
  - `onlineWorkspaceIds(entries: PresenceEntry[]): Set<string>` — workspaceIds with ≥1 owner entry
  - `deriveActivity(entries: PresenceEntry[], workspaceId: string, lastState?: string): 'active' | 'idle' | 'offline'` — M1 only ever yields `'active'`(=online) or `'offline'`; idle wiring is M2. Owner entry present + no validated active state → `'idle'` placeholder is acceptable but M1 surfaces collapse idle→online (binary).

- [ ] **Step 1: Add the channel helper (single source)**

In `lib/server/realtime/centrifugo.ts`, after `teamChatChannel`:

```typescript
/** Channel name for a workspace's presence broadcast. Single source so the
 *  self-broadcast client and observers stay in lockstep. PUBLIC namespace. */
export function presenceWsChannel(workspaceId: string): string {
  return `presence:ws:${workspaceId}`;
}
```

- [ ] **Step 2: Write the failing pure-function tests**

Create `lib/realtime/__tests__/presence.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { onlineWorkspaceIds, deriveActivity, type PresenceEntry } from '@/lib/realtime/presence';

const owner = (ws: string): PresenceEntry => ({ connInfo: { workspaceId: ws } });

describe('onlineWorkspaceIds', () => {
  it('returns workspaceIds that have at least one owner entry', () => {
    const got = onlineWorkspaceIds([owner('a'), owner('a'), owner('b')]);
    expect([...got].sort()).toEqual(['a', 'b']);
  });
  it('is empty for an empty map', () => {
    expect(onlineWorkspaceIds([]).size).toBe(0);
  });
  it('ignores entries with missing/garbage connInfo (fail-closed)', () => {
    const got = onlineWorkspaceIds([{}, { connInfo: {} }, { connInfo: { workspaceId: '' } }]);
    expect(got.size).toBe(0);
  });
});

describe('deriveActivity', () => {
  it('offline when no entry matches the workspace', () => {
    expect(deriveActivity([owner('other')], 'V')).toBe('offline');
  });
  it('online (active) when an owner entry has a validated active state', () => {
    expect(deriveActivity([{ connInfo: { workspaceId: 'V' }, data: { state: 'active' } }], 'V')).toBe('active');
  });
  it('owner present but no/unknown activity → idle (never active)', () => {
    expect(deriveActivity([owner('V')], 'V')).toBe('idle');
    expect(deriveActivity([{ connInfo: { workspaceId: 'V' }, data: { state: 'bogus' } }], 'V')).toBe('idle');
  });
  it('ignores publications attributed to a different workspace (spoof bound)', () => {
    // a publication carrying state but connInfo for another ws must not flip V active
    const entries = [owner('V'), { connInfo: { workspaceId: 'X' }, data: { state: 'active' } }];
    expect(deriveActivity(entries, 'V')).toBe('idle');
  });
});
```

- [ ] **Step 3: Run → verify RED**

Run: `pnpm test lib/realtime/__tests__/presence.test.ts`
Expected: FAIL — module `@/lib/realtime/presence` not found.

- [ ] **Step 4: Implement**

Create `lib/realtime/presence.ts`:

```typescript
// Pure presence derivation. No time, no DOM, no Centrifuge — trivially testable.
// "Online" = a presence:ws:<V> map has >=1 entry whose connInfo.workspaceId === V.
// Observers also appear in the map (their own workspaceId); the V-filter excludes
// them. connInfo is server-signed (the connection token), so workspaceId can't be
// spoofed for a workspace you aren't a member of.

export type PresenceEntry = {
  connInfo?: { workspaceId?: string };
  data?: { state?: string };
};

const ACTIVITY = new Set(['active', 'idle']);

/** workspaceIds that currently have at least one live owner connection. */
export function onlineWorkspaceIds(entries: PresenceEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    const ws = e.connInfo?.workspaceId;
    if (ws) out.add(ws);
  }
  return out;
}

/**
 * Activity for one workspace V from its channel's presence entries.
 * - no owner entry → 'offline'
 * - owner entry with a validated 'active' publication → 'active'
 * - owner entry otherwise (unknown/idle/garbage state) → 'idle'
 * Only owner entries (connInfo.workspaceId === V) count — spoofing bound.
 * M1 surfaces treat idle as online (binary); M2 renders the 3rd state.
 */
export function deriveActivity(
  entries: PresenceEntry[],
  workspaceId: string,
): 'active' | 'idle' | 'offline' {
  const owners = entries.filter((e) => e.connInfo?.workspaceId === workspaceId);
  if (owners.length === 0) return 'offline';
  const anyActive = owners.some((e) => {
    const s = e.data?.state;
    return s !== undefined && ACTIVITY.has(s) && s === 'active';
  });
  return anyActive ? 'active' : 'idle';
}
```

- [ ] **Step 5: Run → verify GREEN**

Run: `pnpm test lib/realtime/__tests__/presence.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/server/realtime/centrifugo.ts lib/realtime/presence.ts lib/realtime/__tests__/presence.test.ts
git commit -m "feat(presence): channel helper + pure online/activity derivation"
```

---

### Task 5: managedSubscribe primitive + refactor useCentrifugoSubscription

**Files:**
- Create: `lib/realtime/managedSubscribe.ts`
- Test: `lib/realtime/__tests__/managedSubscribe.test.ts`
- Modify: `lib/hooks/useCentrifugoSubscription.ts` (refactor onto the primitive — behavior-preserving)

**Interfaces:**
- Produces: `managedSubscribe(client, channel, handlers): () => void` where
  `handlers = { onPublication?, onSubscribed?, onJoin?, onLeave? }` and the
  returned disposer calls `sub.unsubscribe()` + `client.removeSubscription(sub)`.
  Uses `client.getSubscription(channel) ?? client.newSubscription(channel)`.

- [ ] **Step 1: Write the failing primitive test**

Create `lib/realtime/__tests__/managedSubscribe.test.ts` (reuse the `makeSub`/`mockClient` shape from `lib/hooks/__tests__/useCentrifugoSubscription.test.ts`):

```typescript
import { describe, expect, it, vi } from 'vitest';
import { managedSubscribe } from '@/lib/realtime/managedSubscribe';

function makeSub() {
  const handlers: Record<string, ((c: unknown) => void)[]> = {};
  return {
    handlers,
    on: vi.fn((e: string, cb: (c: unknown) => void) => { (handlers[e] ??= []).push(cb); }),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
}

it('subscribes via getSubscription-or-new and registers only provided handlers', () => {
  const sub = makeSub();
  const client = {
    getSubscription: vi.fn().mockReturnValue(null),
    newSubscription: vi.fn().mockReturnValue(sub),
    removeSubscription: vi.fn(),
  };
  const onJoin = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  managedSubscribe(client as any, 'presence:ws:v', { onJoin });

  expect(client.newSubscription).toHaveBeenCalledWith('presence:ws:v');
  expect(sub.subscribe).toHaveBeenCalled();
  const events = sub.on.mock.calls.map((c) => c[0]);
  expect(events).toContain('join');
  expect(events).not.toContain('leave');
});

it('disposer unsubscribes AND removes the subscription (no double-handler on remount)', () => {
  const sub = makeSub();
  const client = {
    getSubscription: vi.fn().mockReturnValue(null),
    newSubscription: vi.fn().mockReturnValue(sub),
    removeSubscription: vi.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispose = managedSubscribe(client as any, 'presence:ws:v', {});
  dispose();
  expect(sub.unsubscribe).toHaveBeenCalled();
  expect(client.removeSubscription).toHaveBeenCalledWith(sub);
});
```

- [ ] **Step 2: Run → verify RED**

Run: `pnpm test lib/realtime/__tests__/managedSubscribe.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the primitive**

Create `lib/realtime/managedSubscribe.ts`:

```typescript
import type { Centrifuge, PublicationContext, Subscription } from 'centrifuge';

export type ManagedHandlers = {
  onPublication?: (ctx: PublicationContext) => void;
  onSubscribed?: () => void;
  onJoin?: () => void;
  onLeave?: () => void;
};

/**
 * Subscribe to one channel and return a disposer. Single source for the subtle
 * lifecycle: getSubscription-or-new, register only the handlers given, and on
 * dispose unsubscribe() + removeSubscription() so a remount of the same channel
 * gets a fresh handler set (otherwise onPublication fires twice). Shared by
 * useCentrifugoSubscription (1 channel) and WorkspacePresenceProvider (N).
 */
export function managedSubscribe(
  client: Centrifuge,
  channel: string,
  handlers: ManagedHandlers,
): () => void {
  const sub: Subscription =
    client.getSubscription(channel) ?? client.newSubscription(channel);
  if (handlers.onPublication) sub.on('publication', (ctx) => handlers.onPublication!(ctx));
  if (handlers.onSubscribed) sub.on('subscribed', () => handlers.onSubscribed!());
  if (handlers.onJoin) sub.on('join', () => handlers.onJoin!());
  if (handlers.onLeave) sub.on('leave', () => handlers.onLeave!());
  sub.subscribe();
  return () => {
    sub.unsubscribe();
    client.removeSubscription(sub);
  };
}
```

- [ ] **Step 4: Run → verify GREEN**

Run: `pnpm test lib/realtime/__tests__/managedSubscribe.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor useCentrifugoSubscription onto the primitive (keep its tests green)**

In `lib/hooks/useCentrifugoSubscription.ts`, inside the effect, replace the inline `getSubscription/newSubscription` + `sub.on(...)` + cleanup with a `managedSubscribe(client, channel, {...})` call, keeping `subRef` assignment and the client-level `connected`/`disconnected` listeners (those stay in the hook — they are connection-level, not subscription-level). The disposer from `managedSubscribe` replaces the `sub.unsubscribe()/removeSubscription()` lines; keep `client.off(...)` + `subRef.current = null`.

- [ ] **Step 6: Run the hook's existing tests → verify still GREEN (behavior-preserving)**

Run: `pnpm test lib/hooks/__tests__/useCentrifugoSubscription.test.ts`
Expected: PASS — all 8 existing cases unchanged (double-handler, remount, unmount cleanup).

- [ ] **Step 7: Commit**

```bash
git add lib/realtime/managedSubscribe.ts lib/realtime/__tests__/managedSubscribe.test.ts lib/hooks/useCentrifugoSubscription.ts
git commit -m "refactor(presence): extract managedSubscribe primitive, refactor useCentrifugoSubscription onto it"
```

---

### Task 6: WorkspacePresenceProvider + useWorkspacePresence

**Files:**
- Create: `components/presence/WorkspacePresenceProvider.tsx`
- Test: `components/presence/__tests__/WorkspacePresenceProvider.test.tsx`

**Interfaces:**
- Consumes: `getCentrifuge()` (`@/lib/realtime/centrifuge-client`), `managedSubscribe` (Task 5), `presenceWsChannel`/`onlineWorkspaceIds`/`deriveActivity` (Task 4).
- Produces:
  - `<WorkspacePresenceProvider>{children}</WorkspacePresenceProvider>`
  - `useWorkspacePresence(workspaceId: string | undefined): { online: boolean; activity: 'active'|'idle'|'offline' }` — registers interest on mount, deregisters on unmount; returns `{ online:false, activity:'offline' }` when realtime is unconfigured or wsId is falsy.
- Constants: `OFFLINE_DEBOUNCE_MS = 4000`, `INTEREST_CAP = 50`.

- [ ] **Step 1: Write the failing tests**

Create `components/presence/__tests__/WorkspacePresenceProvider.test.tsx` (mock centrifuge like the existing hook test; assert: no-op unconfigured; online on snapshot; offline debounced 4s; observer dedup single subscription; cap eviction). Minimal core:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// reuse the mock shape from lib/hooks/__tests__/useCentrifugoSubscription.test.ts
// (makeSub/mockClient with presence() + __fire), see that file.
// ... mock setup omitted here for brevity in the plan; copy the shape verbatim ...

it('no-op when realtime is unconfigured', async () => {
  vi.stubEnv('NEXT_PUBLIC_CENTRIFUGO_WS_URL', '');
  const { renderHook } = await import('@testing-library/react');
  const { WorkspacePresenceProvider, useWorkspacePresence } = await import(
    '@/components/presence/WorkspacePresenceProvider'
  );
  const { result } = renderHook(() => useWorkspacePresence('ws-1'), {
    wrapper: WorkspacePresenceProvider,
  });
  expect(result.current).toEqual({ online: false, activity: 'offline' });
});
```

Add cases (using the live-configured mock + `vi.useFakeTimers()`):
- `presence()` snapshot with an owner entry for `ws-1` → `online:true` after subscribed.
- a `leave` that empties the owner set → still `online:true` for 4s, then `offline` after `advanceTimersByTime(4000)`; a `join` within the window cancels it.
- two components calling `useWorkspacePresence('ws-1')` → `newSubscription` called once for that channel.

- [ ] **Step 2: Run → verify RED**

Run: `pnpm test components/presence/__tests__/WorkspacePresenceProvider.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `components/presence/WorkspacePresenceProvider.tsx`. Core design:
- React context holding `Map<wsId, { online; activity }>` in state + a ref-backed registry of interest counts (`Map<wsId, count>`) and live subscriptions (`Map<wsId, dispose>`).
- `useWorkspacePresence(wsId)`: `useEffect` increments interest on mount / decrements on unmount; reads the state Map.
- The provider effect reacts to the interest set: for each wsId with count>0 and no live sub (respecting `INTEREST_CAP`, evicting oldest count-0… here count>0 only so cap applies to distinct observed wsIds — when over cap, do NOT subscribe the overflow; they read offline), call `managedSubscribe(client, presenceWsChannel(wsId), { onSubscribed, onJoin, onLeave })`. Each handler runs `recompute(wsId)` = `sub.presence()` → `onlineWorkspaceIds`/`deriveActivity` → update state Map with the asymmetric debounce (online immediate; offline scheduled `OFFLINE_DEBOUNCE_MS`, cancelled by a subsequent online).
- Conditional focus reconcile: a `visibilitychange`/`focus` listener that re-runs `presence()` for all live subs ONLY if a disconnect happened since last sweep OR the tab was hidden >30s (`lastHiddenAt`/`missedEvents` refs). (Wire the listener; the missed-event flag is set by the client `disconnected` event.)
- Graceful no-op: if `getCentrifuge()` is null, the provider never subscribes and the Map stays empty.

Keep `INTEREST_CAP = 50` and `OFFLINE_DEBOUNCE_MS = 4000` as named module constants.

- [ ] **Step 4: Run → verify GREEN**

Run: `pnpm test components/presence/__tests__/WorkspacePresenceProvider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/presence/WorkspacePresenceProvider.tsx components/presence/__tests__/WorkspacePresenceProvider.test.tsx
git commit -m "feat(presence): WorkspacePresenceProvider + useWorkspacePresence (interest set, debounce)"
```

---

### Task 7: PresenceClient self-broadcast + mount (!isDemo) + switch disconnect + expose isDemo

**Files:**
- Create: `components/presence/PresenceClient.tsx`
- Test: `components/presence/__tests__/PresenceClient.test.tsx`
- Modify: `app/(app)/layout.tsx` (mount Provider + Client), `lib/auth/shell-access.ts` + workspace repo (expose `isDemo` on the active summary), `centrifuge-client.ts` (export a `disconnectCentrifuge()` for switch)

**Interfaces:**
- Consumes: `getCentrifuge()`, `managedSubscribe`, `presenceWsChannel`.
- Produces: `<PresenceClient workspaceId={string} isDemo={boolean} />` — subscribes the user's own `presence:ws:<workspaceId>` (eager `client.connect()`), **renders nothing**, no-op when realtime unconfigured OR `isDemo`.

- [ ] **Step 1: Write the failing test**

Create `components/presence/__tests__/PresenceClient.test.tsx`:
- realtime configured + `isDemo={false}` → subscribes `presence:ws:ws-1` and calls `client.connect()`.
- `isDemo={true}` → never subscribes (demo isolation, OV8).
- realtime unconfigured → never subscribes (no throw).

- [ ] **Step 2: Run → verify RED**

Run: `pnpm test components/presence/__tests__/PresenceClient.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PresenceClient**

```tsx
'use client';
import { useEffect } from 'react';
import { getCentrifuge } from '@/lib/realtime/centrifuge-client';
import { managedSubscribe } from '@/lib/realtime/managedSubscribe';
import { presenceWsChannel } from '@/lib/server/realtime/centrifugo';

/** Eagerly opens the WS and self-broadcasts this user's workspace presence.
 *  Renders nothing. No-op when realtime is unconfigured or the workspace is a
 *  demo/sample workspace (OV8 — demo members must not broadcast as online). */
export function PresenceClient({ workspaceId, isDemo }: { workspaceId: string; isDemo: boolean }) {
  useEffect(() => {
    if (isDemo) return;
    const client = getCentrifuge();
    if (!client) return;
    const dispose = managedSubscribe(client, presenceWsChannel(workspaceId), {});
    client.connect();
    return dispose;
  }, [workspaceId, isDemo]);
  return null;
}
```

- [ ] **Step 4: Run → verify GREEN**

Run: `pnpm test components/presence/__tests__/PresenceClient.test.tsx`
Expected: PASS.

- [ ] **Step 5: Expose isDemo on the active workspace summary**

In the workspace repo methods feeding the shell (`listForUser`, `listAllWorkspacesForMaster`) add `isDemo` to the selected columns and to `WorkspaceMembershipSummary` (`lib/server/repositories/types.ts`). Update any PGlite repo test snapshots that assert the row shape. (RED: add an assertion to the repo test that the summary includes `isDemo`; GREEN: select it.)

- [ ] **Step 6: Mount in the shell**

In `app/(app)/layout.tsx`, wrap the shell with `<WorkspacePresenceProvider>` and mount `<PresenceClient>` (client components; import them). Add after `<CommandPalette ... />`:

```tsx
<PresenceClient workspaceId={active.id} isDemo={active.isDemo ?? false} />
```

and wrap the returned tree in `<WorkspacePresenceProvider>...</WorkspacePresenceProvider>` (inside `ToasterProvider`). `active.isDemo` comes from Step 5.

- [ ] **Step 7: Disconnect on workspace switch (OV4)**

In `lib/realtime/centrifuge-client.ts` add:

```typescript
/** Tear down the singleton (workspace switch — the token's info.workspaceId is
 *  bound at construction, so a new workspace needs a fresh connection). */
export function disconnectCentrifuge(): void {
  client?.disconnect();
  client = null;
  resolved = false;
}
```

Call `disconnectCentrifuge()` in the workspace-switch path before `window.location.assign(...)` (find via `grep -rn "switchWorkspace" components lib app`). Add a one-line comment at the singleton noting presence correctness depends on switch tearing down the connection. (RED: a test asserting `disconnectCentrifuge` nulls the singleton; GREEN: implement.)

- [ ] **Step 8: Run the touched tests + typecheck**

Run: `pnpm test components/presence lib/realtime && pnpm tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add components/presence/PresenceClient.tsx components/presence/__tests__/PresenceClient.test.tsx app/\(app\)/layout.tsx lib/auth/shell-access.ts lib/server/repositories lib/realtime/centrifuge-client.ts
git commit -m "feat(presence): eager self-broadcast PresenceClient (!isDemo) + switch disconnect"
```

---

### Task 8: PresenceDot shared component

**Files:**
- Create: `components/presence/PresenceDot.tsx`
- Test: `components/presence/__tests__/PresenceDot.test.tsx`

**Interfaces:**
- Produces: `<PresenceDot activity="active"|"idle"|"offline" />` — renders a positioned status dot with `aria-label`; `offline` renders nothing. M1 callers pass `online ? 'active' : 'offline'`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PresenceDot } from '@/components/presence/PresenceDot';

it('renders an online dot with an aria-label', () => {
  const { getByLabelText } = render(<PresenceDot activity="active" />);
  expect(getByLabelText('온라인')).toBeTruthy();
});
it('renders nothing when offline', () => {
  const { container } = render(<PresenceDot activity="offline" />);
  expect(container.firstChild).toBeNull();
});
it('labels idle as 자리 비움', () => {
  const { getByLabelText } = render(<PresenceDot activity="idle" />);
  expect(getByLabelText('자리 비움')).toBeTruthy();
});
```

- [ ] **Step 2: Run → verify RED** — `pnpm test components/presence/__tests__/PresenceDot.test.tsx` → FAIL.

- [ ] **Step 3: Implement** (Linear: `shape-full` dot; active = `--md-sys-color-tertiary`; idle = the new idle token — for M1 reuse a muted token, M2 swaps in the dedicated idle token + contrast check):

```tsx
const LABEL = { active: '온라인', idle: '자리 비움', offline: '' } as const;
export function PresenceDot({ activity }: { activity: 'active' | 'idle' | 'offline' }) {
  if (activity === 'offline') return null;
  const bg = activity === 'active'
    ? 'bg-[var(--md-sys-color-tertiary)]'
    : 'bg-[var(--md-sys-color-outline)]';
  return (
    <span
      aria-label={LABEL[activity]}
      className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[var(--md-sys-color-surface)] ${bg}`}
    />
  );
}
```

- [ ] **Step 4: Run → verify GREEN** — PASS.

- [ ] **Step 5: Commit**

```bash
git add components/presence/PresenceDot.tsx components/presence/__tests__/PresenceDot.test.tsx
git commit -m "feat(presence): shared 3-state PresenceDot with aria-labels"
```

---

### Task 9: Wire dots into inbox list, home widget, thread header

**Files:**
- Modify: `components/messages/ConversationList.tsx`, `components/home/RecentMessagesPanel.tsx`, `components/messages/ThreadView.tsx`
- Test: `components/messages/__tests__/ThreadView.test.tsx` (update existing `:232`), and a small render test per surface.

**Interfaces:** consumes `useWorkspacePresence` (Task 6), `PresenceDot` (Task 8).

- [ ] **Step 1: ThreadView — RED first.** Update `components/messages/__tests__/ThreadView.test.tsx:232` ("useChatChannel.online 이 true 면 프레즌스 점") to instead drive presence via a mock of `useWorkspacePresence` returning `{online:true}` and assert the dot renders; add an offline case asserting no dot. The `useChatChannel` mock keeps providing `typingUserIds`/`sendTyping` only.

- [ ] **Step 2: Run → verify RED** — `pnpm test components/messages/__tests__/ThreadView.test.tsx` → FAIL (ThreadView still reads `useChatChannel.online`).

- [ ] **Step 3: Implement ThreadView** — replace the `online` source: remove `online` from the `useChatChannel(...)` destructure (keep `typingUserIds, sendTyping, connected`), add `const { online } = useWorkspacePresence(counterparty.workspaceId);` and wrap the avatar dot with `<PresenceDot activity={online ? 'active' : 'offline'} />` (typing indicator still takes visual priority where both apply).

- [ ] **Step 4: Run → verify GREEN** — PASS.

- [ ] **Step 5: ConversationList + RecentMessagesPanel** — RED: add a render test per file asserting a dot appears for an online counterparty (mock `useWorkspacePresence`). GREEN: wrap the `<WorkspaceAvatar .../>` (ConversationList.tsx:41, RecentMessagesPanel.tsx:81) in a `relative` container and render `<PresenceDot activity={useWorkspacePresence(item.counterparty.workspaceId).online ? 'active':'offline'} />` beside it. (Extract a tiny `AvatarWithPresence` if both files duplicate — DRY.)

- [ ] **Step 6: Run → verify GREEN** — `pnpm test components/messages components/home` → PASS.

- [ ] **Step 7: Commit**

```bash
git add components/messages/ConversationList.tsx components/home/RecentMessagesPanel.tsx components/messages/ThreadView.tsx components/messages/__tests__/ThreadView.test.tsx
git commit -m "feat(presence): online dots on inbox list, home widget, thread header"
```

---

### Task 10: Disconnect-on-revocation (OV7)

**Files:**
- Modify: `lib/server/realtime/centrifugo.ts` (add `disconnectCentrifugoUser`)
- Modify: the service methods that bump `session_version` (call the helper)
- Test: `lib/server/realtime/__tests__/centrifugo.test.ts` (add a case)

**Interfaces:**
- Produces: `disconnectCentrifugoUser(userId: string): Promise<void>` — best-effort HTTP-API `disconnect` (mirror `publishToChannel`: no-op when unconfigured, swallow errors, 3s timeout).

- [ ] **Step 1: Write the failing test**

In `lib/server/realtime/__tests__/centrifugo.test.ts` add: with `CENTRIFUGO_HTTP_API_URL`/`CENTRIFUGO_API_KEY` set and `fetch` mocked, `disconnectCentrifugoUser('u1')` POSTs `{ method:'disconnect', params:{ user:'u1' } }`; unconfigured → no fetch.

- [ ] **Step 2: Run → verify RED** — `pnpm test lib/server/realtime/__tests__/centrifugo.test.ts` → FAIL.

- [ ] **Step 3: Implement** in `centrifugo.ts`:

```typescript
export async function disconnectCentrifugoUser(userId: string): Promise<void> {
  const apiUrl = process.env.CENTRIFUGO_HTTP_API_URL;
  const apiKey = process.env.CENTRIFUGO_API_KEY;
  if (!apiUrl || !apiKey) return;
  try {
    await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ method: 'disconnect', params: { user: userId } }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.warn('[centrifugo] disconnect failed', err);
  }
}
```

- [ ] **Step 4: Run → verify GREEN** — PASS.

- [ ] **Step 5: Call after each session_version bump**

The bumps live in `lib/server/repositories/drizzle/user.ts:140` (password reset), `:149` (email change), and account deletion. Find the SERVICE callers: `grep -rn "resetPassword\|changeEmail\|confirmEmailChange\|deleteAccount\|softDelete\|suspend" lib/server/services lib/server/actions`. After each successful bump (fire-and-forget, post-commit, never in-tx — mirror the admin-email pattern), call `void disconnectCentrifugoUser(userId)`. Add the same on workspace suspend if a suspend path exists. (No new test per call site — the helper is unit-tested; these are one-line best-effort calls.)

- [ ] **Step 6: Run the realtime suite + typecheck** — `pnpm test lib/server/realtime && pnpm tsc --noEmit` → PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/server/realtime/centrifugo.ts lib/server/realtime/__tests__/centrifugo.test.ts lib/server/services lib/server/actions
git commit -m "feat(presence): force-disconnect Centrifugo sockets on session revocation"
```

---

### Task 11: Integration smoke test (ephemeral Centrifugo, CI)

**Files:**
- Create: `lib/realtime/__tests__/presence.integration.test.ts`
- Modify: CI workflow (`.github/workflows/*.yml`) to run a Centrifugo service container for this suite; add a `test:integration` script if none exists.

**Interfaces:** none (black-box against a real Centrifugo using the repo `config.yaml`).

> This is the ONLY guard for the v6 permission/delivery class (mocks give false green — that's how chat typing broke silently). It is gated so it never runs in the fast unit loop.

- [ ] **Step 1: Write the smoke test (skipped unless `CENTRIFUGO_INTEGRATION=1`)**

Boot Centrifugo (docker) with the repo config + a known HMAC secret. Using `centrifuge` (node client) + two connections with `info.workspaceId`, assert:
1. a client CAN subscribe to `presence:ws:<V>` (no `103`) — guards `allow_subscribe_for_client`.
2. `presence()` of `presence:ws:<V>` shows an entry whose `connInfo.workspaceId === V` — guards conn_info shape.
3. a client CAN `publish({state:'idle'})` to its channel (no `103`) — guards `allow_publish_for_subscriber` (and, by extension, the chat typing fix).
4. an observer receives a `join` when a second owner connects — guards `force_push_join_leave`.
5. a late subscriber's `history({limit:1})` returns the last `{state}` — guards `history_size:1`.

```typescript
import { describe, it } from 'vitest';
const RUN = process.env.CENTRIFUGO_INTEGRATION === '1';
describe.skipIf(!RUN)('presence namespace — live Centrifugo v6', () => {
  it('client can subscribe to presence:ws (allow_subscribe_for_client)', async () => { /* ... */ });
  it('connInfo.workspaceId surfaces in presence()', async () => { /* ... */ });
  it('client can publish {state} (allow_publish_for_subscriber)', async () => { /* ... */ });
  it('join is delivered to observers (force_push_join_leave)', async () => { /* ... */ });
  it('history seeds a late subscriber (history_size:1)', async () => { /* ... */ });
});
```

- [ ] **Step 2: Run locally against docker → verify it actually exercises the config**

```bash
docker run -d --name cent-smoke -p 8000:8000 \
  -v "$PWD/deploy/centrifugo/config.yaml:/centrifugo/config.yaml" \
  -e CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY=test-secret \
  centrifugo/centrifugo:v6 centrifugo -c /centrifugo/config.yaml
CENTRIFUGO_INTEGRATION=1 NEXT_PUBLIC_CENTRIFUGO_WS_URL=ws://localhost:8000/connection/websocket \
  pnpm test lib/realtime/__tests__/presence.integration.test.ts
docker rm -f cent-smoke
```
Expected: all 5 PASS. (If subscribe `103`s, the config is wrong — that is the bug this test exists to catch.)

- [ ] **Step 3: Wire into CI**

Add a CI job that starts the Centrifugo service container, sets `CENTRIFUGO_INTEGRATION=1`, and runs only this file. Keep it OUT of the default `pnpm test` so the unit loop stays fast.

- [ ] **Step 4: Commit**

```bash
git add lib/realtime/__tests__/presence.integration.test.ts .github/workflows
git commit -m "test(presence): ephemeral-Centrifugo integration smoke for v6 permission/delivery"
```

---

### Task 12: Email-suppression invariant guard (§9)

**Files:**
- Modify: `lib/server/realtime/__tests__/centrifugo.test.ts`

**Interfaces:** none — locks an existing invariant.

> The real guard already exists (`centrifugo.test.ts:168` asserts `isUserPresentInConversation` reads `chat:conversation:<id>`). This task makes the invariant explicit so a future refactor that repoints suppression at `presence:ws` goes RED.

- [ ] **Step 1: Add an explicit invariant test**

In `lib/server/realtime/__tests__/centrifugo.test.ts`, add a test named e.g. `'isUserPresentInConversation NEVER reads a presence:ws channel (digest suppression must stay conversation-scoped)'` that calls `isUserPresentInConversation('conv-1','u1')` with `fetch` mocked and asserts the POSTed `params.channel` starts with `chat:conversation:` and does NOT contain `presence:ws`.

- [ ] **Step 2: Run → verify GREEN immediately (this guards existing correct behavior)**

Run: `pnpm test lib/server/realtime/__tests__/centrifugo.test.ts`
Expected: PASS. (This is a guard, not a RED-first feature — it documents §9. To prove it bites, temporarily repoint the impl at `presenceWsChannel` and watch it fail, then revert.)

- [ ] **Step 3: Commit**

```bash
git add lib/server/realtime/__tests__/centrifugo.test.ts
git commit -m "test(presence): lock email-suppression to conversation channel (§9 invariant)"
```

---

## Final verification (after all tasks)

- [ ] `pnpm test` — full unit suite green.
- [ ] `pnpm tsc --noEmit` — no type errors.
- [ ] `pnpm lint` — clean.
- [ ] Integration smoke (Task 11) green against docker Centrifugo.
- [ ] Manual: two browsers, two workspaces in a conversation → dot appears within ~1s of the counterparty opening any page; disappears on close (clean ~immediate, crash ≤~60s).
- [ ] Deploy note in PR body: `docker compose up -d centrifugo` (recreate) + app restart; DDL 0; no new env.

## Self-Review notes (spec coverage)

- M1 spec §10 items mapped: token `info`+TTL+cache (T1,T2), presence namespace+chat fix (T3), online pure fns (T4), managedSubscribe (T5), Provider (T6), self-broadcast+demo+switch (T7), dot (T8,T9), disconnect-on-revocation (T10), integration smoke (T11), §9 guard (T12). Drift guard (T3), conditional focus + cap + debounce (T6).
- NOT in M1 (per spec): activity/idle UI logic, `useActivityState`, idle design token + AA contrast, team-namespace presence, FocusComparison/deal-room surfaces — all **M2** (separate plan). Last-seen — deleted (D2).
- Open dependency: T7 Step 5 (isDemo on summary) and T10 Step 5 (locate service bump callers) require reading the current repo/service code at execution time; both are specified with the grep to locate exact sites.
