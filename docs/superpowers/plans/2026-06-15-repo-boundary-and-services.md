# Repository-Boundary Enforcement + Service Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every code change follows superpowers:test-driven-development (RED → GREEN → REFACTOR).

**Goal:** Route all ~44 direct-DB leak sites behind `lib/server/repositories/` so every DB touch has a repo home, and restore the "thin action" rule by extracting `BoardService`, `QuoteTemplateService`, and absorbing auth email/verify into `AuthService`.

**Scope note:** The ESLint `no-restricted-imports` boundary guard, the dead `'memory'`-union removal, and the doc sync are **deferred to a separate PR** (was Phase 5 — removed). This PR does the migration + extraction work; a follow-up locks the boundary with lint once the leaks are gone.

**Architecture:** Three server layers — Actions (thin: session + parse + delegate) → Services (own tx / notification fan-out / outbox, return `ServiceResult`, `globalThis` singletons) → Repositories (backend-agnostic interfaces in `types.ts`, Drizzle impls, built by a Factory bundle). This plan (1) fills repo gaps so every DB touch has a repo home, (2) migrates every direct `@/lib/db` query to a repo call, (3) extracts fat actions into services.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + Postgres (postgres-js prod / PGlite tests), Vitest, TypeScript strict, pnpm.

**Documented exceptions (NOT migrated — intentional; the follow-up lint PR will allowlist these):**
- `lib/server/storage/postgres.ts` + `lib/server/storage/memory.ts` — the **Storage byte-blob tier** (`attachment_blobs`). Already abstracted behind `getStorage()`; that IS its boundary. Keep.
- Pure **injection-only** sites (import `db` only to pass into a helper / install a global override): `lib/server/storage/index.ts`, `lib/server/actions/auth/_shared.ts`, `app/api/workspaces/search/route.ts`, `app/api/files/[id]/route.ts`, `app/(app)/settings/audit-log/page.tsx`, `app/(app)/rfp-create/page.tsx`, and the service singleton getters' `import('@/lib/db/client')`. These never call `.select/.insert/.update/.delete/.transaction` directly — not query leaks.
- `lib/server/actions/auth/_purgeUnverifiedSignup.ts` — deliberate cross-aggregate cascade delete spanning 7 tables; wrapped in a caller tx. Stays raw (a single repo can't own a cross-aggregate cascade).

---

## Conventions (apply to every task)

**Repo method style** (from `lib/server/repositories/types.ts`): one Korean doc comment per method; `tx?: Tx` is always the LAST param; return `undefined` (not null) for "not found"; naming `findById`/`findByX`/`save`/`create`/`markX`/`transition`. Drizzle class `implements XRepo` (strict TS catches divergence).

**Repo TDD procedure** (each new repo method / new repo):
1. Add the method signature to the interface in `lib/server/repositories/types.ts`.
2. Write a failing test in `lib/server/repositories/drizzle/__tests__/<repo>.test.ts` using the PGlite harness (`createPgliteDb()` + `__useDrizzleWithDbForTest`, see existing tests like `bid.test.ts` for the seed+assert shape).
3. Run `pnpm test lib/server/repositories/drizzle/__tests__/<repo>.test.ts` → confirm RED.
4. Implement the method in `lib/server/repositories/drizzle/<repo>.ts`.
5. Run the test → GREEN.
6. Commit.

**New-repo wiring** (do ONCE per new repo, in its creation task): add the interface to `types.ts`, the Drizzle class, register in `lib/server/repositories/factory.ts` (`RepoBundle` field + `createRepoBundle` construction + a `getXRepo()` accessor) and **bump `BUNDLE_VERSION`** (`factory.ts:67`, currently 7) so HMR rebuilds the stale cache.

**Service TDD procedure** (Phase 4 extractions): the existing action `__tests__` are the regression gate — they call the action by name and assert error codes; since action names/signatures/error codes are PRESERVED, they keep passing as black-box coverage. For each extraction: (a) create the service + its singleton, (b) point the thin action at the service, (c) run the existing action test file → must stay GREEN, (d) add a service-level unit test injecting fakes via `__setXServiceForTest`.

**Migration TDD procedure** (Phase 3): each migration swaps a raw `db/tx.select|insert|update|delete` for a repo call. The behavior is covered by existing tests. Procedure per site-group: (a) run the area's existing tests → GREEN baseline; (b) swap the raw query for the repo method (added in Phase 1–2); (c) re-run → still GREEN; (d) `pnpm tsc --noEmit` on touched files. Where a site has NO existing test, write a characterization test FIRST (RED via a deliberate break, then GREEN) before migrating.

**Per-phase gate:** end every phase with `pnpm tsc --noEmit` clean + `pnpm lint` clean + the touched test files green, then commit. Run full `pnpm test` at each phase boundary (single-file during the loop — see MEMORY: full-suite slowness = swap thrash, run one at a time).

---

# PHASE 1 — New repositories (foundation)

Five new repos for tables that have no repo today. Do each as a full new-repo task (interface + Drizzle + factory wiring + tests).

### Task 1.1: `PhoneOtpRepo`

**Files:**
- Modify: `lib/server/repositories/types.ts` (add interface)
- Create: `lib/server/repositories/drizzle/phone-otp.ts`
- Modify: `lib/server/repositories/factory.ts` (RepoBundle + createRepoBundle + getPhoneOtpRepo + BUNDLE_VERSION→8)
- Test: `lib/server/repositories/drizzle/__tests__/phone-otp.test.ts`

**Interface to add (`types.ts`):**
```ts
// ── Phone OTP (가입 전화 인증) ──────────────────────────────────────────
export interface PhoneOtpRepo {
  /** 지정 window 내 해당 번호로 발급된 OTP 수 — 발송 레이트리밋용. */
  countRecent(phone: string, since: Date, tx?: Tx): Promise<number>;
  /** OTP 발급 row 생성 — code 는 호출자가 해시. 생성된 id 반환. */
  create(params: { phone: string; codeHash: string; expiresAt: Date }, tx?: Tx): Promise<string>;
  /** 미인증·미만료 활성 OTP 1건 (created_at asc). 없으면 undefined. */
  findActive(phone: string, now: Date, tx?: Tx): Promise<{ id: string; codeHash: string; attempts: number } | undefined>;
  /** (id, phone) 의 인증완료(verified_at not null) 존재 여부 — 가입 검증 게이트. */
  isVerified(id: string, phone: string, tx?: Tx): Promise<boolean>;
  /** 코드 오입력 시 attempts +1. */
  bumpAttempts(id: string, tx?: Tx): Promise<void>;
  /** verified_at 스탬프. */
  markVerified(id: string, at: Date, tx?: Tx): Promise<void>;
  /** 단건 삭제 — SMS 발송 실패 롤백용. */
  remove(id: string, tx?: Tx): Promise<void>;
}
```

- [ ] **Step 1: Write failing tests** covering each method against the `phone_otps` schema (countRecent window, create→findActive round-trip, isVerified false/true, bumpAttempts increments, markVerified sets verified_at + makes findActive skip it, remove deletes). Model the harness on `lib/server/repositories/drizzle/__tests__/verification-token.test.ts`.
- [ ] **Step 2:** `pnpm test lib/server/repositories/drizzle/__tests__/phone-otp.test.ts` → RED.
- [ ] **Step 3:** Implement `DrizzlePhoneOtpRepository implements PhoneOtpRepo` against schema table `phoneOtps` (read columns from `lib/db/schema/*`).
- [ ] **Step 4:** Wire into `factory.ts` (field `phoneOtp`, construct, `getPhoneOtpRepo()`, BUNDLE_VERSION 7→8).
- [ ] **Step 5:** Test → GREEN. `pnpm test lib/server/repositories/__tests__/factory.test.ts` still GREEN.
- [ ] **Step 6:** Commit `feat(repo): add PhoneOtpRepo`.

### Task 1.2: `WorkspaceLogoRepo`

**Files:** types.ts + `drizzle/workspace-logo.ts` + factory (BUNDLE_VERSION→9) + `__tests__/workspace-logo.test.ts`

**Interface:**
```ts
// ── Workspace Logo (bytea blob) ────────────────────────────────────────
export interface WorkspaceLogoRepo {
  /** 로고 바이트+mime — GET /avatar. 없으면 undefined. */
  find(workspaceId: string, tx?: Tx): Promise<{ bytes: Buffer; mime: string } | undefined>;
  /** 존재 여부만 — Workspace.findById 의 hasLogo 계산용. */
  exists(workspaceId: string, tx?: Tx): Promise<boolean>;
  /** upsert(by workspace_id) — POST 업로드. */
  upsert(workspaceId: string, bytes: Buffer, mime: string, tx?: Tx): Promise<void>;
  /** 단건 삭제 — DELETE /avatar. */
  remove(workspaceId: string, tx?: Tx): Promise<void>;
}
```
- [ ] TDD per procedure against `workspaceLogoBlobs`. Tests: find miss/hit, exists false/true, upsert insert+update path, remove. Commit `feat(repo): add WorkspaceLogoRepo`.

### Task 1.3: `RfpAllowedPgRepo`

**Files:** types.ts + `drizzle/rfp-allowed-pg.ts` + factory (BUNDLE_VERSION→10) + `__tests__/rfp-allowed-pg.test.ts`

Table `rfpAllowedPg` is the sealed-bid allowlist, written raw in `services/rfp.ts:533,700,1106` and both onboarding seeders; read at `:433,659`.

**Interface:**
```ts
// ── RFP Allowed-PG (참여 allowlist — 봉인 입찰 경계) ─────────────────────
export interface RfpAllowedPgRepo {
  /** RFP 에 PG 워크스페이스들을 allowlist 등록 (onConflictDoNothing). */
  add(rfpId: string, pgWsIds: string[], tx?: Tx): Promise<void>;
  /** 한 RFP 의 허용 PG 워크스페이스 id 목록. */
  listPgWsIds(rfpId: string, tx?: Tx): Promise<string[]>;
  /** (rfpId, pgWsId) 가 allowlist 에 있는지. */
  has(rfpId: string, pgWsId: string, tx?: Tx): Promise<boolean>;
}
```
- [ ] TDD per procedure. Tests: add (incl. duplicate→no-op), listPgWsIds, has true/false. Commit `feat(repo): add RfpAllowedPgRepo`.

### Task 1.4: `VerificationApplicationRepo`

**Files:** types.ts + `drizzle/verification-application.ts` + factory (BUNDLE_VERSION→11) + `__tests__/verification-application.test.ts`

Written raw in `lib/server/actions/workspace/_createWorkspace.ts:83-87`.

**Interface:**
```ts
// ── Verification Application (워크스페이스 인증 신청) ─────────────────────
export interface VerificationApplicationRepo {
  /** 워크스페이스 생성 시 인증 신청 row 생성. */
  create(params: { workspaceId: string; /* + 실제 컬럼은 schema 확인 후 채움 */ }, tx?: Tx): Promise<void>;
}
```
- [ ] **Step 1:** Read `lib/db/schema/*` for the `verificationApplications` table to fill the exact `create` param shape (match the columns inserted at `_createWorkspace.ts:83-87`).
- [ ] TDD per procedure. Commit `feat(repo): add VerificationApplicationRepo`.

### Task 1.5: `LoginAttemptRepo`

**Files:** types.ts + `drizzle/login-attempt.ts` + factory (BUNDLE_VERSION→12) + `__tests__/login-attempt.test.ts`

Currently a standalone `db`-injected module `lib/server/auth/login-rate-limit.ts` (read `:39-43`, upsert `:93-99`, delete `:133`). Big-bang: give it a repo; `login-rate-limit.ts` becomes a thin policy wrapper over the repo.

**Interface:**
```ts
// ── Login Attempt (브루트포스 레이트리밋) ────────────────────────────────
export interface LoginAttemptRepo {
  /** key(email|ip) 의 현재 카운터 row. 없으면 undefined. */
  findByKey(key: string, tx?: Tx): Promise<{ key: string; count: number; firstAt: Date; blockedUntil: Date | null } | undefined>;
  /** upsert(by key) — 시도 누적. */
  upsert(key: string, rec: { count: number; firstAt: Date; blockedUntil: Date | null }, tx?: Tx): Promise<void>;
  /** 성공 로그인 시 keys 삭제. */
  clear(keys: string[], tx?: Tx): Promise<void>;
}
```
- [ ] **Step 1:** Read the `loginAttempts` schema + `login-rate-limit.ts` to lock the exact column names/types for the record shape.
- [ ] TDD per procedure. Tests: findByKey miss/hit, upsert insert+update, clear. Commit `feat(repo): add LoginAttemptRepo`.

**Phase 1 gate:** `pnpm tsc --noEmit` + `pnpm lint` clean; all 5 new repo tests + `factory.test.ts` green; full `pnpm test` green. BUNDLE_VERSION = 12.

---

# PHASE 2 — Gap methods on existing repos

Add the methods the migration needs. Each = repo TDD procedure (interface + test + impl + commit). Group commits by repo.

### Task 2.1: `UserRepo` gap methods
```ts
getSessionVersion(userId: string, tx?: Tx): Promise<number | undefined>;        // lib/auth/session-version-db.ts:22-27
getEmailVerified(userId: string, tx?: Tx): Promise<boolean | undefined>;        // lib/auth/session-version-db.ts:47-52
findEmailVerifiedByEmail(email: string, tx?: Tx): Promise<boolean | undefined>; // actions/auth/checkEmailAvailableAction.ts:32-36 (undefined=계정없음)
existsByEmail(email: string, tx?: Tx): Promise<boolean>;                         // actions/auth/signupEmailAction.ts:38-43
findIdByEmailCI(email: string, tx?: Tx): Promise<string | undefined>;           // actions/workspace/_workspaceInviteNotify.ts:27-31 (lower() CI) + invite/workspaceInviteLanding.ts:15-19
markEmailVerifiedById(userId: string, tx?: Tx): Promise<void>;                   // actions/workspace/_claimWorkspaceInvite.ts:67-70 (WHERE unverified guard)
setLastActiveWorkspace(userId: string, workspaceId: string, tx?: Tx): Promise<void>; // _createWorkspace.ts:74-77, switchWorkspaceAction.ts:63-66,87-90
/** raw 인증 row (passwordHash, deletedAt, lastActiveWorkspaceId) — credentials/master 로그인 핫패스. */
findAuthRowByEmail(email: string, tx?: Tx): Promise<{ id: string; email: string; passwordHash: string | null; emailVerified: boolean; deletedAt: Date | null; lastActiveWorkspaceId: string | null } | undefined>; // lib/auth/credentials.ts:47-51, lib/auth/master-login.ts:67
provisionMaster(params: { email: string; name: string }, tx?: Tx): Promise<string>; // lib/auth/master-login.ts:70-83 (returns userId)
```
- [ ] TDD each against `users`. Commit `feat(repo): add UserRepo gap methods for boundary migration`.

### Task 2.2: `WorkspaceRepo` gap methods
```ts
search(opts: { type: WorkspaceType; q?: string }, tx?: Tx): Promise<{ id: string; name: string }[]>; // lib/server/workspaces/search.ts:21-25 (isDemo 제외)
getName(workspaceId: string, tx?: Tx): Promise<string | undefined>;                 // 6 sites: bid.ts:219, chat.ts:191, rfp.ts:462/526/755, workspace.ts:83/165
memberRecipients(workspaceId: string, tx?: Tx): Promise<{ userId: string; email: string }[]>; // 5 sites: bid.ts:210, rfp.ts:576/950/1153, chat.ts:198
findActiveById(workspaceId: string, tx?: Tx): Promise<{ id: string; type: WorkspaceType } | undefined>; // master-login.ts:38-42, switchWorkspaceAction.ts:56-59
findEarliestActiveWorkspace(tx?: Tx): Promise<{ id: string } | undefined>;          // master-login.ts:45-51
getMembership(userId: string, workspaceId: string, tx?: Tx): Promise<{ role: string; type: WorkspaceType } | undefined>; // active-workspace.ts:30-41
findInitialMembership(userId: string, tx?: Tx): Promise<{ workspaceId: string; role: string; type: WorkspaceType } | undefined>; // active-workspace.ts:58-65 (earliest joined)
listMembershipsWithMembers(userId: string, tx?: Tx): Promise<...>;                   // actions/auth/getDeleteAccountStatus.ts:31-48 (shape = read call site)
setBizProfilePointer(workspaceId: string, bizProfileId: string, tx?: Tx): Promise<void>; // updateWorkspaceBizProfileAction.ts:103-106
getBizProfileId(workspaceId: string, tx?: Tx): Promise<string | undefined>;         // updateWorkspaceBizProfileAction.ts:65-69 (light projection)
rename(workspaceId: string, name: string, tx?: Tx): Promise<void>;                   // renameWorkspaceAction.ts:27-30
setHasLogo(workspaceId: string, hasLogo: boolean, tx?: Tx): Promise<void>;           // api/workspace/[id]/avatar/route.ts:96-99,123-126
createBare(params: {...}, tx?: Tx): Promise<void>;                                   // _createWorkspace.ts:63-68 (light create; save() is heavier/member-syncing)
addMember(params: { workspaceId: string; userId: string; role: string }, tx?: Tx): Promise<void>; // _createWorkspace.ts:69-73, _claimWorkspaceInvite.ts:55-62 (onConflictDoNothing)
listPendingInvitations(workspaceId: string, tx?: Tx): Promise<...>;                  // app/(app)/settings/members/page.tsx:32-45
findInvitationByTokenHash(hash: string, tx?: Tx): Promise<...>;                      // app/(public)/invite/workspace/[token]/page.tsx:36-47 (with ws name)
claimInvitation(invitationId: string, userId: string, tx?: Tx): Promise<...>;       // _claimWorkspaceInvite.ts:37-47 (atomic conditional UPDATE)
findAdminEmail(workspaceId: string, tx?: Tx): Promise<string | undefined>;          // app/(public)/invite/rfp/[token]/page.tsx:41-51
```
- [ ] **Step 1:** For each method, Read its call site to lock the exact return shape (especially `listMembershipsWithMembers`, `listPendingInvitations`, `findInvitationByTokenHash`, `claimInvitation`). Several already have partial coverage — verify `findById` can't be reused before adding a new method.
- [ ] TDD each against `workspaces`/`workspace_members`/`workspace_invitations`. Commit `feat(repo): add WorkspaceRepo gap methods`.

### Task 2.3: `RfpRepo` gap methods
```ts
setBoardVisible(rfpId: string, visible: boolean, tx?: Tx): Promise<void>;       // setRfpBoardVisibilityAction.ts:51
updateDeadline(id: string, deadline: Date, tx?: Tx): Promise<void>;            // services/rfp.ts:919 (transition is status-only — see :918 comment)
findIdAndOwnerByCode(code: string, tx?: Tx): Promise<{ id: string; buyerWsId: string } | undefined>; // setRfpBoardVisibilityAction.ts:40-44, rfp.ts:373
reserveNextCode(yearMonth: string, tx?: Tx): Promise<string>;                  // folds lib/server/rfp-id.ts raw rfp_counters sql
searchForBuyer(wsId: string, pattern: string, tx?: Tx): Promise<...>;          // searchEntitiesAction.ts:84-101 (whitelisted projection)
findOwnerById(id: string, tx?: Tx): Promise<{ buyerWsId: string } | undefined>; // storage/permissions.ts:83-87 chain + app/api/files/upload/route.ts rfp lookups
```
- [ ] TDD each. `reserveNextCode` must replicate the atomic `INSERT…ON CONFLICT…RETURNING` in `rfp-id.ts:14-18`. Commit `feat(repo): add RfpRepo gap methods`.

### Task 2.4: `BidRepo` gap methods
```ts
updateStatus(id: string, status: Bid['status'], tx?: Tx): Promise<void>;        // services/bid.ts:74 (withdraw)
searchForBuyer(wsId: string, pattern: string, tx?: Tx): Promise<...>;           // searchEntitiesAction.ts:107-132
searchForPg(wsId: string, pattern: string, tx?: Tx): Promise<...>;              // searchEntitiesAction.ts:146-165
findRfpOwner(bidId: string, tx?: Tx): Promise<{ rfpId: string; buyerWsId: string } | undefined>; // upload route bids⋈rfps + storage/permissions.ts:103-122
```
- [ ] TDD each. Commit `feat(repo): add BidRepo gap methods`.

### Task 2.5: `AttachmentRepo` gap methods
```ts
/** draft 첨부를 owner row 에 링크 (exclusive-arc; 모든 owner col IS NULL 가드). */
claim(params: { ids: string[]; owner: { rfpId?: string; bidId?: string; bidNoteId?: string; chatMessageId?: string; rfpTeamMessageId?: string }; uploadedBy?: string }, tx?: Tx): Promise<void>; // 5 sites: rfp.ts:1113, bid.ts:193 & :317, chat.ts:174 (no uploadedBy), team-chat.ts:225
findUnclaimedByIds(ids: string[], tx?: Tx): Promise<Pick<AttachmentRecord,'id'|'rfpId'|'bidId'|'bidNoteId'|'uploadedBy'>[]>; // bid.ts:293-302
remove(id: string, tx?: Tx): Promise<void>;                                     // app/api/files/upload/route.ts:246-249 (orphan cleanup)
```
- [ ] TDD each against `attachments`. The `chat.ts` claim site has NO `uploadedBy` filter → `uploadedBy?` optional. Owner cols = the 5 exclusive-arc FKs (`schema/attachments.ts:26-32`). Commit `feat(repo): add AttachmentRepo gap methods`.

### Task 2.6: `NotificationRepo` + `OutboxRepo` gap methods
```ts
// NotificationRepo
findOwnedById(notificationId: string, userId: string, tx?: Tx): Promise<{ id: string; type: string } | undefined>; // services/notification.ts:31-35, :51-55
// OutboxRepo
findLatestFailed(params: { to: string; event: OutboxEvent }, tx?: Tx): Promise<{ id: string } | undefined>; // services/notification.ts:69-80
requeue(id: string, tx?: Tx): Promise<void>;                                    // services/notification.ts:83-86 (failed→pending)
```
- [ ] TDD each. Commit `feat(repo): add Notification/Outbox gap methods`.

**Phase 2 gate:** tsc + lint clean; all new repo tests green; full `pnpm test` green.

---

# PHASE 3 — Migrate leak sites → repo calls

Mechanical migration. Each task = a file-group; follow the Migration TDD procedure. The Phase-1/2 method names are the targets. **Run the area's existing tests before (baseline green) and after (still green).**

### Task 3.1: Service-layer raw queries → repos
Swap raw `this._db.select`/`tx.select|insert|update` for the new repo methods. Services keep tx ownership; only the raw query bodies change.
- [ ] `services/notification.ts` — `:31-35,:51-55`→`notificationRepo.findOwnedById`; `:62-66`→`userRepo.findById`; `:69-80`→`outboxRepo.findLatestFailed`; `:83-86`→`outboxRepo.requeue`. **Inject `notificationRepo`/`outboxRepo`/`userRepo`** if not already (check constructor; update `getNotificationService` + `_setup`). Run `pnpm test lib/server/services/__tests__/notification*` + `actions/notifications/__tests__/*`.
- [ ] `services/bid.ts` — `:74`→`bidRepo.updateStatus`; `:193,:317`→`attachmentRepo.claim`; `:293-302`→`attachmentRepo.findUnclaimedByIds`; `:210`→`workspaceRepo.memberRecipients`; `:219`→`workspaceRepo.getName`. Inject `attachmentRepo` if missing.
- [ ] `services/chat.ts` — `:174`→`attachmentRepo.claim` (no uploadedBy); `:191`→`workspaceRepo.getName`; `:198`→`workspaceRepo.memberRecipients`.
- [ ] `services/team-chat.ts` — `:225`→`attachmentRepo.claim`.
- [ ] `services/rfp.ts` — `:373`→`rfpRepo.findIdAndOwnerByCode`; `:462,:526,:755`→`workspaceRepo.getName`; `:533,:700,:1106`→`rfpAllowedPgRepo.add`; `:433,:659`→`rfpAllowedPgRepo.listPgWsIds`/`has`; `:576,:950,:1153`→`workspaceRepo.memberRecipients`; `:919`→`rfpRepo.updateDeadline`; `:1007`→`rfpRepo.reserveNextCode`; `:1113`→`attachmentRepo.claim`. (Leave the `createRfp` inline `insert(rfps)` at `:1061` — composing a row in a larger tx; `RfpRepo.save` exists but this is a style choice, lower priority. If migrating: use `rfpRepo.save`.) Inject `rfpAllowedPgRepo`/`attachmentRepo`. **This is the biggest single file — split into sub-commits per method group.**
- [ ] `services/workspace.ts` — `:83,:165`→`workspaceRepo.getName`.
- [ ] `services/auth.ts` — migrate its ~20 raw `users`/`workspaces`/`workspace_members`/`workspace_invitations`/`verificationTokens` reads/writes to `userRepo`/`workspaceRepo`/`verificationTokenRepo` methods (most exist; add to Phase 2 if a gap surfaces during this task). Keep the postgres-js unique-violation re-throw boundary intact.
- [ ] Commit per service file: `refactor(service): route <svc> DB access through repos`.

### Task 3.2: Action-layer leaks → repos
- [ ] `actions/auth/checkEmailAvailableAction.ts:32-36`→`userRepo.findEmailVerifiedByEmail`.
- [ ] `actions/auth/signupEmailAction.ts:38-43`→`userRepo.existsByEmail`.
- [ ] `actions/auth/getDeleteAccountStatus.ts:31-48`→`workspaceRepo.listMembershipsWithMembers`.
- [ ] `actions/auth/sendPhoneOtpAction.ts:27-30,:39-46,:51` + `verifyPhoneOtpAction.ts:19-30,:39-49`→`phoneOtpRepo.*`.
- [ ] `actions/rfp/setRfpBoardVisibilityAction.ts:40-44`→`rfpRepo.findIdAndOwnerByCode`; `:51`→`rfpRepo.setBoardVisible` (keep audit insert via `auditLogRepo` in the same tx).
- [ ] `actions/rfp/updateWorkspaceBizProfileAction.ts` — `:65-69`→`workspaceRepo.getBizProfileId`; `:75-80`→`bizProfileRepo.findById`; `:91-100`→`bizProfileRepo.save`; `:103-106`→`workspaceRepo.setBizProfilePointer`. (This whole tx-orchestration belongs in a service — see Note A below; for Phase 3 just route through repos, keeping the action's tx.)
- [ ] `actions/search/searchEntitiesAction.ts:84-101`→`rfpRepo.searchForBuyer`; `:107-132`→`bidRepo.searchForBuyer`; `:146-165`→`bidRepo.searchForPg`.
- [ ] `actions/workspace/renameWorkspaceAction.ts:27-30`→`workspaceRepo.rename`.
- [ ] `actions/workspace/switchWorkspaceAction.ts:56-59`→`workspaceRepo.findActiveById`; `:63-66,:87-90`→`userRepo.setLastActiveWorkspace`.
- [ ] `actions/workspace/_createWorkspace.ts` — `:48-59`→`bizProfileRepo.save`; `:63-68`→`workspaceRepo.createBare`; `:69-73`→`workspaceRepo.addMember`; `:74-77`→`userRepo.setLastActiveWorkspace`; `:83-87`→`verificationApplicationRepo.create`; `:91`→`columnRepo.createMany` (already exists).
- [ ] `actions/workspace/_claimWorkspaceInvite.ts` — `:37-47`→`workspaceRepo.claimInvitation`; `:55-62`→`workspaceRepo.addMember`; `:67-70`→`userRepo.markEmailVerifiedById`.
- [ ] `actions/workspace/_workspaceInviteNotify.ts:27-31`→`userRepo.findIdByEmailCI`.
- [ ] Commit grouped by domain (auth / rfp / workspace / search).

### Task 3.3: lib-helper leaks → repos
- [ ] `lib/auth/session-version-db.ts:22-27,:47-52`→`userRepo.getSessionVersion`/`getEmailVerified`. **Caution (auth hot path):** these are React-`cache`d, Node-isolated reads on the JWT-revocation + shell-guard path. Keep them `cache`-wrapped; route the inner read through `getUserRepo()`.
- [ ] `lib/auth/master-login.ts` — `:38-42`→`workspaceRepo.findActiveById`; `:45-51`→`workspaceRepo.findEarliestActiveWorkspace`; `:67`→`userRepo.findAuthRowByEmail`; `:70-83`→`userRepo.provisionMaster`.
- [ ] `lib/auth/active-workspace.ts:30-41,:58-65`→`workspaceRepo.getMembership`/`findInitialMembership`.
- [ ] `lib/auth/credentials.ts:47-51`→`userRepo.findAuthRowByEmail`.
- [ ] `lib/server/auth/login-rate-limit.ts:39-43,:93-99,:133`→`loginAttemptRepo.*`; module becomes a thin policy wrapper.
- [ ] `lib/server/workspaces/search.ts:21-25`→`workspaceRepo.search` (then this free function can either delegate or be deleted; its callers `api/workspaces/search/route.ts:49` + `rfp-create/page.tsx:22` switch to `getWorkspaceRepo().search`).
- [ ] `lib/server/invite/workspaceInviteLanding.ts:15-19`→`userRepo.findIdByEmailCI`.
- [ ] `lib/server/rfp-id.ts:14-18`→`rfpRepo.reserveNextCode` (delete the raw sql; callers `services/rfp.ts`, onboarding seeders use the repo). 
- [ ] `lib/server/storage/permissions.ts:83-179` — route the ownership-chain reads through `rfpRepo.findOwnerById`, `bidRepo.findRfpOwner`, `bidNoteRepo`/`chatMessageRepo`/`chatConversationRepo`/`rfpTeamMessageRepo` `findById`. Add any missing owner-lookup gap method to Phase 2 if needed. **Characterization test FIRST** (`storage/__tests__/permissions.test.ts` if absent) since ACL correctness is security-critical.
- [ ] `lib/server/onboarding/sample-rfp.ts` + `sample-pg-rfp.ts` — route writes through `rfpRepo.save`/`bidRepo.save`/`invitationRepo.save`/`workspaceRepo.*`/`rfpAllowedPgRepo.add`/`rfpRepo.reserveNextCode`. These are seed scripts; migrate but keep them in their own tx. Run `__tests__/rfp-isSample.test.ts`, `rfp-pg-request-sample.test.ts` + the onboarding service tests.
- [ ] Commit grouped (auth / search / onboarding / storage-acl).

### Task 3.4: app-layer leaks → repos
- [ ] `app/(app)/settings/members/page.tsx:32-45`→`workspaceRepo.listPendingInvitations`.
- [ ] `app/(public)/invite/workspace/[token]/page.tsx:36-47`→`workspaceRepo.findInvitationByTokenHash`.
- [ ] `app/(public)/invite/rfp/[token]/page.tsx:33-37`→`invitationRepo.findByTokenHash` (exists); `:41-51`→`workspaceRepo.findAdminEmail`.
- [ ] `app/api/workspace/[id]/avatar/route.ts` — `:40-44`→`workspaceLogoRepo.find`; `:88-94`→`workspaceLogoRepo.upsert`; `:119-121`→`workspaceLogoRepo.remove`; `:96-99,:123-126`→`workspaceRepo.setHasLogo`.
- [ ] `app/api/files/upload/route.ts` — `:142-146,:166-171,:186-190`→`rfpRepo.findById`/`bidRepo.findRfpOwner`; `:246-249`→`attachmentRepo.remove`.
- [ ] Also migrate the `WorkspaceRepo.findById` internal leak into `workspaceLogoBlobs` (`drizzle/workspace.ts:98-102`)→`workspaceLogoRepo.exists` — but a repo calling another repo crosses repo internals; instead inline an `exists`-style query within `workspace.ts` is fine since it's INSIDE the repo layer. **Leave as-is** (it's already in `repositories/`, not a boundary leak).
- [ ] Commit grouped.

**Phase 3 gate:** tsc + lint clean; full `pnpm test` green; grep `@/lib/db/schema` outside `repositories/**` returns only the documented exceptions + storage tier.

---

# PHASE 4 — Service extraction (Item 2)

### Task 4.1: `BoardService`
**Files:** Create `lib/server/services/board.ts` (+ singleton); modify `lib/server/actions/board/{moveCard,releaseCard,addColumn,deleteColumn,recolorColumn,renameColumn,reorderColumn}Action.ts` + `_shared.ts`; Test `lib/server/services/__tests__/board.test.ts`.

Service shape (single-global singleton, BidService pattern):
```ts
export type CardActor = { workspaceId: string; workspaceType: WorkspaceType };
export class BoardService {
  constructor(private columnRepo: ColumnRepo, private rfpRepo: RfpRepo, private bidRepo: BidRepo, private invitationRepo: InvitationRepo) {}
  async moveCard(input: { cardType: CardType; cardId: string; toColumnId: string }, actor: CardActor): Promise<ServiceResult>;
  async releaseCard(input: { cardType: CardType; cardId: string }, actor: CardActor): Promise<ServiceResult>;
  async addColumn(input: { kind: ColumnKind; title: string; color?: ColumnColor | null; position: string }, actor: CardActor): Promise<ServiceResult<{ columnId: string }>>;
  async deleteColumn(columnId: string, workspaceId: string): Promise<ServiceResult>;
  async recolorColumn(columnId: string, color: ColumnColor | null, workspaceId: string): Promise<ServiceResult>;
  async renameColumn(columnId: string, title: string, workspaceId: string): Promise<ServiceResult>;
  async reorderColumn(columnId: string, position: string, workspaceId: string): Promise<ServiceResult>;
  // private: kindForCard, setCardBoardColumn, cardBelongsToWorkspace, requireOwnedColumn (moved from _shared.ts)
}
```
**Logic moves:** `kindForCard`, `setCardBoardColumn`, `cardBelongsToWorkspace`, `requireOwnedColumn` → into service (private). `_shared.ts` keeps only `BoardActionResult`, `workspaceIdForCard`, `requireActiveWorkspace` (session boundary stays in actions — services must NOT import `@/lib/auth/session`). Each action becomes: `safeParse` + session→`{workspaceId,workspaceType}` + `getBoardService().<m>(...)`. **Preserve every error code** (`FORBIDDEN`, `CROSS_KIND`, `NOT_A_DROP_TARGET`, `FORBIDDEN_KIND`, `COLUMN_CROSS_SIDE_LOCKED`, `COLUMN_SYSTEM_LOCKED`, `COLUMN_NOT_FOUND`).

- [ ] **Step 1:** Baseline — run `pnpm test lib/server/actions/board` → GREEN (this is the gate).
- [ ] **Step 2:** Create `BoardService` + `getBoardService`/`__reset`/`__set`.
- [ ] **Step 3:** Point each action at the service; trim `_shared.ts`.
- [ ] **Step 4:** Re-run `pnpm test lib/server/actions/board` → still GREEN (black-box contract preserved).
- [ ] **Step 5:** Add `board.test.ts` (service unit, inject fake repos via `__setBoardServiceForTest`).
- [ ] **Step 6:** Commit `refactor(board): extract BoardService from actions`.

### Task 4.2: `QuoteTemplateService`
**Files:** Create `lib/server/services/quote-template.ts`; modify `actions/quote-template/{save,duplicate,delete,list}QuoteTemplateAction.ts` + `_shared.ts`; Test `services/__tests__/quote-template.test.ts`.
```ts
export class QuoteTemplateService {
  constructor(private templateRepo: BidQuoteTemplateRepo) {}
  async save(input: SaveQuoteTemplateServiceInput, actor: Actor): Promise<ServiceResult<{ templateId: string }>>;
  async duplicate(templateId: string, actor: Actor): Promise<ServiceResult<{ templateId: string }>>;
  async remove(templateId: string, actor: Actor): Promise<ServiceResult>;
  async list(actor: Actor): Promise<ServiceResult<{ templates: BidQuoteTemplate[] }>>;
  // private requireOwned(templateId, workspaceId)
}
const MAX_TEMPLATES = 20; // consolidates the two duplicated consts (saveAction:57, duplicateAction:18)
```
**Logic moves:** `MAX_TEMPLATES` cap (create + duplicate), cross-ws ownership (`requireOwned`), `createdBy` stamping, `"<name> 복제"` duplication + `paymentFees` deep-copy, `randomUUID`. `_shared.ts` keeps `QuoteActionResult` + `requirePgWorkspace`. Actions keep the zod `Input` parse. Preserve `LIMIT_REACHED`, `TEMPLATE_NOT_FOUND`, `FORBIDDEN`, `INVALID_INPUT`.
- [ ] TDD per Service procedure. Baseline+after `pnpm test lib/server/actions/quote-template`. Commit `refactor(quote-template): extract QuoteTemplateService`.

### Task 4.3: AuthService email/verify absorption
**Files:** Modify `lib/server/services/auth.ts` (add 3 methods); `actions/auth/{signupEmailAction,sendMyEmailVerificationAction,verifyEmailCodeAction,verifyEmailAction}.ts`; delete or thin `actions/auth/_issueSignupEmail.ts`.

Add to existing `AuthService` (constructor UNCHANGED — already has `_db, userRepo, verificationTokenRepo, outboxRepo, auditRepo`):
```ts
async issueSignupEmail(params: { email: string; inviteToken?: string; workspaceType?: 'buyer'|'pg'; mode?: 'auto'|'resend' }): Promise<void>;
async verifyEmailCode(input: { email: string; code: string }): Promise<ServiceResult<{ email: string; inviteToken?: string; workspaceType?: 'buyer'|'pg' }>>; // errors: TOKEN_INVALID_OR_EXPIRED | MAX_ATTEMPTS
async verifyEmailToken(rawToken: string): Promise<ServiceResult<{ email: string; inviteToken?: string; workspaceType?: 'buyer'|'pg' }>>; // errors: TOKEN_INVALID_OR_EXPIRED | WRONG_PURPOSE
```
**Logic moves:** `_issueSignupEmail.ts` body verbatim (swap `getOutboxRepo()/getVerificationTokenRepo()`→`this.*`; `actionDb()`→`this._db`; `_shared.baseUrl/bucket15Min`→service's own). **Preserve the enqueue-before-rotate invariant** (outbox enqueue returns null on dedupe → keep old token; only expire+save on real enqueue — `_issueSignupEmail.ts:26-39`). `MAX_CODE_ATTEMPTS=5` moves into the service. **Constructor unchanged → `getAuthService()` dual-global wiring + `_setup.ts` injection need NO edits** (the key win). Actions keep zod `Input` (`INVALID_INPUT`) + `normalizeEmail` + `hashToken` boundary; `signupEmailAction`'s EMAIL_TAKEN pre-check stays in the action (only caller). Must keep `renderAuthVerify` + `verifyUrl` format unchanged (test regexes extract OTP/token from the rendered HTML).
- [ ] **Step 1:** Baseline — `pnpm test lib/server/actions/auth/__tests__/{verifyEmailCode,verifyFlipsEmailVerified,myEmailVerification,signup}.test.ts` → GREEN.
- [ ] **Step 2:** Add the 3 AuthService methods.
- [ ] **Step 3:** Delegate the 4 actions; delete `_issueSignupEmail.ts` (or 1-line re-export).
- [ ] **Step 4:** Re-run the baseline tests → still GREEN.
- [ ] **Step 5:** Commit `refactor(auth): absorb email-issue + verify flows into AuthService`.

**Phase 4 gate:** tsc + lint clean; full `pnpm test` green; grep confirms board/quote-template/auth actions are now thin (no `tx.`/multi-repo orchestration in the action bodies).

---

> **Deferred to a follow-up PR (was Phase 5):** the ESLint `no-restricted-imports` boundary guard + drift test, removing the dead `'memory'` backend union from `factory.ts`, and the CLAUDE.md doc sync. After Phase 3 completes here, the boundary will be *clean* (no leaks outside the documented exceptions) but not yet *lint-enforced* — that lock-in lands separately.

## Notes

- **Note A (deferred):** `updateWorkspaceBizProfileAction` owns a real tx + multi-step orchestration; ideally it becomes a `WorkspaceService.updateBizProfile` method. Phase 3 only routes its queries through repos (keeping the action tx). A follow-up can move the tx into a service — out of scope here to keep Phase 3 mechanical.
- **Note B:** `services/rfp.ts` is the largest migration (Task 3.1) AND a god-object (11-dep ctor, lifecycle + participation + invitation). Extracting a `ParticipationService` is a separate refactor — NOT in this plan; flagged for a future PR.
- **VERSION/CHANGELOG:** bump on `/ship`, not per-commit (repo uses merge-driver auto-resolve for version conflicts — see MEMORY).

## Self-review checklist (run before execution)
- Spec coverage: every leak file from the audit appears in Phase 3; every gap method in Phase 2; all 3 extractions in Phase 4. ✓
- Type consistency: method names used in Phase 3 match signatures defined in Phase 1–2. ✓
- New-repo wiring (factory + BUNDLE_VERSION bump) included in each Phase-1 task. ✓
- Exceptions explicitly enumerated up front; lint allowlist deferred to the follow-up PR. ✓
