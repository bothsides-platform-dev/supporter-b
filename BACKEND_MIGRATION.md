# Mock 제거 + 백엔드/DB 설계

**현 진행 상태 (2026-05-08)**: 14-step cutover 중 인프라 구축 — `auth.ts`, `lib/db/`, drizzle 마이그레이션, `lib/server/repositories/*`, outbox, NTS enrichment, 서버 액션, Resend 이메일, Sentry 모두 가동. `lib/mock/` 디렉토리 제거됨, repositories는 Drizzle 구현으로 swap-in 완료. 잔여: Step 13 mock 잔재 grep 게이트 최종 검증, Zustand 캐시 스토어(`rfp-list`/`bid-list`/`notifications`) 잔존 여부 확인.

## Context

bidit는 M0~M7 종료 시점의 v0 UI 구현체로, 모든 도메인 데이터가 `lib/mock/*` 하드코딩 + `lib/stores/{rfp-list,bid-list,notifications}.ts`의 Zustand 메모리 캐시에 갇혀 있다. 화면 흐름과 도메인 모델은 안정됐으니 mock을 떼고 Postgres + 서버 액션 + Auth.js 기반 실제 백엔드로 교체할 단계다.

목표:
- mock 데이터/스토어 일괄 제거, DB 기반으로 교체
- 사업자번호 enrichment는 NTS(국세청)만 실연동, NICE/공정위는 v0 제외
- 화면 명세(`SCREEN_DESIGN.md` §1 P1~P11)와 `PG_RFP_SPEC.md` 15개 정책을 그대로 보존
- `lib/server/repositories/*`·`lib/server/outbox/*`·`lib/server/{token,rfp-state}.ts`의 의미론(`assertTransition`, sha256 토큰, `claimToken` 단일성, `canAccess` 정책)을 인터페이스째로 보존하고 Drizzle 구현을 swap-in

## 코드베이스 검증 결과 (2026-05-06)

| 가정 | 실제 | 판정 |
|---|---|---|
| Mock import touch ~88 | grep 카운트: `@/lib/mock` 25 + `MOCK_*` 40 + store hooks 36 + `useMockSession` 2 = **~103** | 보강(Step 13 grep 게이트 항목에 4종 모두 포함) |
| Repo 인터페이스(`assertTransition`/`claimToken`/`canAccess`/`autoJoinPg`) 존재 | 존재 | OK |
| `proxy.ts` 루트 + PUBLIC_PREFIXES 분기 | 존재 (PUBLIC_PREFIXES=`['/login','/signup','/password','/invite','/auth','/logout']`, CLAIMABLE_PUBLIC_PREFIXES=`['/invite/rfp']`) | OK |
| `BizProfile` 14필드 → 7필드 슬림화 가능 | 14필드 확인(bizNo/name/ceoName/ksic/taxType/status/mailOrderNo/estimatedRevenue/revenueYear/niceLookedUpAt/grade/gradeSource/gradeConfirmedBy/gradeConfirmedAt) | OK |
| `STATUTORY_CARD_FEE`로 영세/중소 카드료 강제 | 존재. **general=NaN** (입력 받는 신호) → 계획의 "general 등급만 cardFees NOT NULL" 일관 | OK |
| Backend deps(drizzle/postgres/next-auth/bcrypt/resend/react-email/pglite/tsx) 일부 존재 | **전부 미설치** — Step 1에서 모두 신규 추가 | 보강 |
| `/auth/verify`만 진입점 | `signup/verify/page.tsx`와 `auth/verify/page.tsx` 둘 다 존재 — Step 5에서 진입점 일원화 결정 필요 | 보강 |
| Drizzle dialect | postgres-js(prod) + pglite(test) 두 어댑터 필요 — `lib/db/client.ts`에서 분기 | 보강 |

## 확정 결정 사항

| 항목 | 선택 |
|---|---|
| DB | 로컬 Docker Postgres 16 (prod 호스팅 v1) |
| ORM | Drizzle ORM + drizzle-kit. **prod=`drizzle-orm/postgres-js`, test=`drizzle-orm/pglite`** |
| 인증 | Auth.js v5, Credentials Provider 단일, JWT 세션. Next 16 컨벤션상 `proxy.ts` 유지(rename 안 함) |
| 외부 연동 | NTS(국세청 사업자등록 상태조회)만. NICE/공정위 제거 |
| **Buyer/PG 분기** | **P6에서 사용자가 라디오로 직접 선택**. 도메인 자동 추론 없음. `/invite/rfp/:token` 경유는 P6 전체 스킵 + 강제 PG 경로. 클레임 시 `session.user.workspaceId === inv.pgWsId` 멤버십 검사 (도메인 auto-join 없음) |
| **bizProfile 보관** | Workspace 생성 시 1회 캡처(buyer만), RFP 생성 시마다 스냅샷 row 신규 insert. `biz_profiles`는 immutable rows |
| `BizProfile` 슬림화 | `bizNo`/`taxType`/`status`/`grade`/`gradeSource`/`gradeConfirmedBy`/`gradeConfirmedAt`만. `name`/`ceoName`/`ksic`/`mailOrderNo`/`estimatedRevenue`/`revenueYear`/`niceLookedUpAt` 제거. **`bizNo`/`taxType`/`status` nullable**, `grade` 옵셔널. CHECK: `bizNo IS NOT NULL OR grade IS NOT NULL` (의미 없는 빈 row 금지) |
| 회사명 | `Workspace.name` 사용 |
| Grade 입력 | 사용자 5단계 직접 선택 **(선택 — 미입력 시 PG 가 일반 등급 가정)**. `gradeSource ∈ {'user_confirmed', 'user_overridden', 'unset'}` (`auto_nice` 제거, `'unset'` 추가) |
| **bizProfile 옵셔널** | Workspace 생성 시 buyer 도 스킵 가능 (`workspaces.biz_profile_id` NULL). RFP 생성 시 옵션 `bizProfileMode: 'inherit' \| 'override' \| 'none'` 으로 분기 |
| 파일 스토리지 | 로컬 디스크 + 인증 라우트 핸들러. v1에 S3/Supabase Storage swap |
| Outbox 플러시 | 액션 트랜잭션 내 enqueue + 커밋 후 fire-and-forget + 60s cron 안전망 |
| SSE | 단일 인스턴스 in-process EventEmitter (NOTIFICATION.md §4 그대로). prod 시 LISTEN/NOTIFY 업그레이드 |
| 마이그레이션 전략 | feature flag 없이 단계별 클린 컷오버. 마지막 PR에서 `lib/mock/*`·3 stores 삭제 |
| Email verify 진입점 | **`/auth/verify`로 일원화**. `signup/verify/page.tsx`는 `/auth/verify?token=...`로 redirect만 하는 셸로 축소(또는 삭제)하여 P3 한 경로만 유지 |

## 데이터/플로우 의존도

```
[Step 1 docker+drizzle] -> [Step 2 schema] ─┬─> [Step 4 repo iface+drizzle impl] ──┐
                                            │                                       │
                          [Step 3 Auth.js + proxy.ts] ─────────────────┐            │
                                                                       v            v
                                                            [Step 5 auth actions + P1-P11]
                                                                       │
                                       ┌───────────────────────────────┼─────────────────────────┐
                                       v                               v                         v
                  [Step 6 P6 buyer/PG radio + WS biz capture]   [Step 7 createRfp snapshots]   [Step 9 SSE + notif actions]
                                       │                               │                         │
                                       v                               v                         v
                                                  [Step 8 PG invite claim + bid submit]
                                                              │
                                                              v
                                            [Step 10 Resend + outbox-drizzle]
                                                              │
                                                              v
                                            [Step 11 file storage + /api/files/*]
                                                              │
                                                              v
                                       [Step 12 Topbar de-mock + seed scripts]
                                                              │
                                                              v
                                       [Step 13 mock+stores deletion (cutover)]
                                                              │
                                                              v
                                            [Step 14 e2e + CI gates]
```

각 step은 PR/커밋 단위로 끊어 항상 빌드/테스트 그린 상태를 유지.

---

## Step 1 — Docker Postgres + Drizzle 부트스트랩

- `docker-compose.yml`: `postgres:16-alpine` (5432, named volume) + 테스트용 (5433, profile=`test`)
- `drizzle.config.ts` (schema dir = `./lib/db/schema`, out = `./drizzle`)
- `lib/db/client.ts`: postgres-js + `globalThis` 싱글톤 (Next dev HMR 대응). **테스트 환경(`NODE_ENV==='test'` 또는 `REPO_BACKEND==='memory'/'pglite'`)은 별도 `lib/db/client-pglite.ts`에서 `drizzle-orm/pglite` 어댑터로 분기 — schema 파일은 동일 import.**
- `.env.example`: `DATABASE_URL`, `DATABASE_URL_TEST`, `AUTH_SECRET`, `RESEND_API_KEY`, `NTS_SERVICE_KEY`, `NEXT_PUBLIC_BASE_URL`, `CRON_SECRET`, `UPLOAD_DIR`
- `package.json` 스크립트: `db:generate`, `db:migrate`, `db:studio`, `db:push`, `db:seed`
- Deps (전부 신규): `drizzle-orm`, `postgres`, `bcryptjs`, `next-auth@beta` (v5), `resend`, `react-email`, `dotenv`. dev: `drizzle-kit`, `@electric-sql/pglite`, `tsx`, `@types/bcryptjs`
- 검증: `docker compose up -d` → `pnpm db:migrate` 성공, `psql $DATABASE_URL -c '\dt'` 빈 결과

## Step 2 — Drizzle 스키마 (전 테이블)

`lib/db/schema/` (배럴: `index.ts`)에 13개 테이블. enums 모음 `lib/db/schema/_enums.ts`.

테이블:
- `users` (id, email UNIQUE, password_hash, name, phone, avatar_color, status, created_at)
- `workspaces` (id, type `workspace_type`, name, biz_profile_id FK→`biz_profiles.id` nullable, created_at)
- `workspace_members` (workspace_id FK, user_id FK, role `member_role`, joined_at, last_seen_at; PK(ws,user))
- `biz_profiles` (id, biz_no **nullable**, tax_type `tax_type` **nullable**, status `biz_status` **nullable**, grade `merchant_grade` nullable, grade_source `grade_source` NOT NULL (`unset` 포함), grade_confirmed_by FK→users nullable, grade_confirmed_at, created_at) + CHECK `biz_no IS NOT NULL OR grade IS NOT NULL` — **immutable: 변경 시 새 row insert + workspace.biz_profile_id 갱신**
- `rfps` (id text PK = `P-YYMM-NNNN`, buyer_ws_id FK, biz_profile_id FK **nullable** → 스냅샷 (사업자번호·등급 모두 미입력 RFP는 NULL), title, memo, allowed_pg_workspace_ids uuid[], deadline timestamptz, status `rfp_status`, awarded_bid_id FK→bids nullable, created_by FK→users, created_at, sent_at)
- `rfp_invitations` (id, rfp_id FK, pg_ws_id FK→workspaces NOT NULL, accepted_by_user_id FK→users nullable, token_hash UNIQUE, sent_at, opened_at, expires_at, status `invitation_status`; UNIQUE(rfp_id, pg_ws_id))
- `workspace_invitations` (id, workspace_id FK, invited_email, invited_by_user_id FK→users, token_hash UNIQUE, status `workspace_invitation_status`, expires_at, accepted_by_user_id FK→users nullable, created_at; UNIQUE(workspace_id, lower(invited_email)))
- `bids` (id, rfp_id FK, pg_ws_id FK, invitation_id FK, settle_cycle `settle_cycle`, deposit numeric, setup_fee numeric, monthly_min numeric, bank_transfer_fee_pct numeric, easy_pay_fee_pct numeric, card_fees_by_issuer jsonb null, overseas_card_fee_pct numeric null, proposal_attachment_id FK→attachments, memo, status `bid_status`, submitted_by FK→users, submitted_at; UNIQUE(rfp_id, pg_ws_id))
- `contracts` (id, rfp_id FK UNIQUE, bid_id FK, awarded_at, awarded_by FK→users)
- `notifications` (id, user_id FK, workspace_id FK, type, title, body, channel `notification_channel`, status `notification_status`, link_url, created_at, sent_at, read_at)
- `outbox_entries` (id, event `outbox_event`, to_addr, subject, html, dedupe_key UNIQUE WHERE NOT NULL, status `outbox_status`, attempts, max_attempts, scheduled_at, sent_at, last_error)
- `verification_tokens` (id, purpose `verification_purpose`, email, token_hash UNIQUE, issued_at, expires_at, consumed_at, meta jsonb; INDEX(email, purpose))
- `attachments` (id, owner_kind `attachment_owner_kind`, owner_id, name, size, mime_type, storage_path, uploaded_by FK, uploaded_at)
- `rfp_counters` (year_month text PK, last_seq integer)

Enums: `rfp_status`, `invitation_status`, `bid_status`(draft/submitted/withdrawn), `settle_cycle`, `notification_status`, `notification_channel`, `outbox_status`, `outbox_event`, `workspace_type`, `merchant_grade`, `grade_source`(user_confirmed/user_overridden), `tax_type`(general/simple/exempt), `biz_status`(active/suspended/closed), `verification_purpose`, `member_role`(admin/member), `attachment_owner_kind`(rfp/bid_proposal).

CHECK 제약:
- `rfps`: `awarded_bid_id IS NULL OR status='awarded'`
- `bids.card_fees_by_issuer`는 `general` 등급 RFP에서만 NOT NULL — DB CHECK는 어렵고 액션 레이어 검증 + 테스트로 보강
- `workspaces`: `(type='pg' AND domain IS NOT NULL) OR (type='buyer')` — buyer는 domain 무관

RFP ID 생성 (`lib/server/rfp-id.ts`):
```ts
export async function nextRfpId(tx: Tx): Promise<string> {
  const yymm = format(new Date(), 'yyMM');
  const [row] = await tx.execute(sql`
    INSERT INTO rfp_counters(year_month, last_seq) VALUES (${yymm}, 1)
    ON CONFLICT (year_month) DO UPDATE SET last_seq = rfp_counters.last_seq + 1
    RETURNING last_seq
  `);
  return `Q-${yymm}-${String(row.last_seq).padStart(4, '0')}`;
}
```

동반 수정:
- `lib/types/biz-profile.ts`: 슬림 타입으로 재작성 (제거 필드 7개: `name`/`ceoName`/`ksic`/`mailOrderNo`/`estimatedRevenue`/`revenueYear`/`niceLookedUpAt`). `gradeSource` union 좁히기 (`'auto_nice'` 제거)
- `lib/types/workspace.ts`: `bizProfile?: BizProfile` 유지 (workspace 도메인 객체에서는 1:1 관계)
- `lib/types/rfp.ts`: 그대로 (`bizProfile: BizProfile` 임베드)
- `lib/server/__tests__/rfp-repo.test.ts`: 픽스처에서 제거된 필드 삭제, `gradeSource: 'user_confirmed'`로 갱신 (line 9-17)
- `lib/mock/biz-lookup.ts`/`workspaces.ts`/`rfps.ts`/`users.ts`/`bids.ts`/`invitations.ts`/`notifications.ts`: 임시 보정 (final 삭제는 Step 13)

검증: `pnpm db:migrate` 클린, `psql -c '\d biz_profiles'`로 슬림 컬럼 확인, `pnpm test` 그린.

## Step 3 — Auth.js v5 (Credentials only, JWT)

- `auth.ts` (repo root): `NextAuth({ providers: [Credentials], session: { strategy: 'jwt' }, callbacks: { jwt, session }, pages: { signIn: '/login' } })`. export `auth`, `handlers`, `signIn`, `signOut`
- `app/api/auth/[...nextauth]/route.ts`: `export const { GET, POST } = handlers`
- `lib/auth/password.ts`: `hashPassword`, `verifyPassword` (bcrypt cost=12)
- `lib/auth/session.ts`: `requireSession()`, `requireBuyerSession()`, `requirePgSession()` (서버 컴포넌트/액션에서 사용. 미인증 시 throw → 호출자가 redirect 또는 401)
- 콜백:
  - `authorize({ email, password })`: `users` lookup → bcrypt verify → 첫 `workspace_members` 조회 → `{ id, email, workspaceId, workspaceType, role }`
  - `jwt({ token, user })`: 첫 로그인 시 user의 ws 필드 복사. 토큰 갱신 시 워크스페이스 변경(예: 초대로 join) 반영 — `trigger==='update'` 시 DB 재조회
  - `session({ session, token })`: token → `session.user`
- **`proxy.ts` 유지** (Next 16 컨벤션). `auth()`로 감싸 redirect 규칙 보존:
  ```ts
  import { auth } from './auth';
  export default auth((req) => {
    const session = req.auth;
    // 기존 PUBLIC_PREFIXES / CLAIMABLE_PUBLIC_PREFIXES 분기 그대로
    // session 쿠키 read 대신 req.auth 사용
  });
  export const config = { matcher: [...] };
  ```
- `app/logout/route.ts`: `await signOut({ redirect: false })` 후 `/login` 302
- 세션 타입 augmentation: `types/next-auth.d.ts`에 `workspaceId`, `workspaceType`, `role` 추가
- 검증: `/login` POST → 세션 쿠키 발급, `/inbox` 비로그인 → `/login` 리다이렉트, 로그인 상태 `/login` → `/home`. `/invite/rfp/:token`은 비로그인이어도 통과 (CLAIMABLE_PUBLIC_PREFIXES 보존)

위험: Auth.js v5 + Next 16 호환성. 만약 호환 이슈 발생 시 `next-auth@5.0.0-beta.X` 핀 후 노트 — Step 3 PR에서 즉시 결정.

## Step 4 — Repository 인터페이스 + Drizzle 구현 + pglite 테스트

- `lib/server/repositories/types.ts`: 인터페이스 정의 — `RfpRepo`, `InvitationRepo`, `WorkspaceRepo`, `BidRepo`, `NotificationRepo`, `UserRepo`, `BizProfileRepo`, `ContractRepo`, `VerificationTokenRepo`, `AttachmentRepo`, `OutboxRepo`. 모든 메서드 첫 인자에 옵션 `tx?: Tx` 받아서 트랜잭션 합성 가능하게.
- `lib/server/repositories/in-memory/{rfp,invitation,workspace}.ts`: 기존 3개 파일 이동 (테스트 더블로 보존). 인터페이스 implement.
- `lib/server/repositories/drizzle/*.ts`: 11개 신규 구현. 핵심 불변식:
  - **token**: raw 비저장. `verification_tokens.token_hash`/`rfp_invitations.token_hash`만 저장 (sha256, `lib/server/token.ts:hashToken` 재사용)
  - **claimToken (invitations)**:
    ```ts
    UPDATE rfp_invitations
       SET accepted_by_user_id=$1, status='accepted'
     WHERE token_hash=$2 AND accepted_by_user_id IS NULL AND expires_at > now()
     RETURNING *
    ```
    rowCount 0이면 만료/사용/무효 분기 (DB 재조회로 reason 결정)
  - **canAccess**: `SELECT EXISTS(SELECT 1 FROM rfp_invitations WHERE rfp_id=$1 AND pg_ws_id=$2 AND status IN ('pending','opened','accepted'))` — 초대된 PG 워크스페이스 멤버 모두 통과 (2026-05-10 정책 변경)
  - **transition**: 액션 레이어에서 `assertTransition` (`lib/server/rfp-state.ts`) + DB layer에서 `WHERE status=$prev` 가드 → 동시성 안전
- `lib/server/repositories/factory.ts`: `getRfpRepo()` 등 — `process.env.NODE_ENV==='test' || process.env.REPO_BACKEND==='memory'` 시 in-memory, else drizzle
- `lib/server/__tests__/drizzle/*.test.ts`: pglite 기반 (`@electric-sql/pglite` + `drizzle-orm/pglite`). 기존 `rfp-repo.test.ts`/`invitation.test.ts`/`workspace.test.ts`의 어서션 그대로 복제. 각 테스트 격리는 매 테스트 `BEGIN`/`ROLLBACK`로
- 검증: `pnpm test` 그린 (in-memory + pglite 양쪽)

## Step 5 — 인증 플로우 액션 (P1~P11 실배선)

`lib/server/actions/auth/`:
- `signupEmailAction.ts`: zod 검증 → `verification_tokens(purpose='signup_email')` 발급 (token=`generateToken()`, hash 저장, exp=15분) → `auth.verify` outbox enqueue (메일에는 raw token URL: `${BASE_URL}/auth/verify?token=...`)
- `verifyEmailAction.ts`: `UPDATE verification_tokens SET consumed_at=now() WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING email, meta` — atomic 소비. 성공 시 sessionStorage signupDraft에 `emailVerified=true` + `email` 세팅 후 P5로 redirect. meta에 `inviteToken` 보존 가능.
- `signupCompleteAction.ts`: tx 내 user insert + password_hash + `emailVerified=true` 검증. **Workspace 결정 분기**:
  - `inviteToken` 있음 → invitation lookup → 도메인의 `type='pg'` ws 검색 → 있으면 `workspace_members` insert (autoJoinPg), 없으면 신규 `type='pg'` ws 생성 (name=도메인, domain=도메인) + member insert. `claimToken` 호출. 반환 `{ redirectTo: '/inbox/'+rfpId }`
  - 그 외 (P6 데이터 동봉 — `wsKind: 'buyer' | 'pg'`, name, optional bizProfile)
    - `wsKind==='buyer'`: `biz_profiles` insert → `workspaces(type='buyer', name, biz_profile_id)` insert → member insert (role=admin)
    - `wsKind==='pg'`: 도메인 충돌 검사 (`domain` UNIQUE) → 신규 PG ws 또는 join. domain 자동 유도(이메일 도메인)
- `loginAction.ts`: `signIn('credentials', { redirect: false })` 래핑. 5회 실패 캡차/10회 락은 v1 (스펙대로 `login_attempts` 미사용)
- `passwordForgotAction.ts`: 이메일 입력. 사용자 존재 여부와 무관하게 동일 응답(정보 노출 회피). 존재하면 `purpose='password_reset'` 토큰 발급 + `auth.reset` outbox
- `passwordResetAction.ts`: 토큰 atomic 소비 + bcrypt 해시 갱신 + `signIn` 자동 호출
- `emailChangeRequestAction.ts`/`emailChangeConfirmAction.ts`: 같은 패턴. meta에 `newEmail` 보관

화면 수정:
- `app/(public)/signup/page.tsx`: handle submit → `signupEmailAction`, `useSignupDraftStore`는 step state로만 유지 (email 캐시는 sessionStorage)
- **Email verify 진입점 일원화**: `app/(public)/auth/verify/page.tsx`만 토큰 검증 본체로 사용. `app/(public)/signup/verify/page.tsx`는 `?token=...` 쿼리 보존하며 `/auth/verify`로 redirect 하는 셸로 축소(또는 삭제 후 메일 템플릿의 링크를 직접 `/auth/verify`로). P3→P4→P5 자동 이동 보존.
- `app/(public)/signup/profile/page.tsx`: `/signup/workspace`로 푸시 (그대로) — password는 P6에 들고 가지 말고 액션 호출 시점까지 메모리 보관
- `app/(public)/signup/workspace/page.tsx`: **Step 6에서 본격 변경**
- `app/(public)/login/page.tsx` / `password/forgot/` / `password/reset/[token]/` / `auth/email-change/`: 액션 호출로 교체

검증: P2→P3→P4(메일에서 실 token 클릭)→P5→P6 클릭스루 정상. 비밀번호 재설정/이메일 변경 동작.

## Step 6 — P6 buyer/PG 라디오 + Workspace bizProfile 캡처

`app/(public)/signup/workspace/page.tsx` 재작성:

```
[ 새 워크스페이스 ]   [ 코드로 합류 ]
                                              ← 탭

  ◯ 구매사 (buyer)   ◯ 결제대행사 (PG)         ← 라디오 (default: buyer)

  [BUYER 분기]
    워크스페이스 이름 ____________________
    [ ] 사업자번호·등급 나중에 입력하기 (사전 제안 모드)
    BizLookupField (bizNo 입력 → NTS 조회 → status/taxType 표시) — 토글 OFF 시 노출
    GradeConfirmPanel (5단계 라디오, source='user_confirmed') — 토글 OFF 시 노출
    [만들기]
    ※ 토글 ON: 워크스페이스만 생성 (`biz_profile_id=NULL`). 설정에서 추후 추가 가능.

  [PG 분기]
    회사 이름 ____________________ (도메인은 이메일에서 자동: kim@toss.im → toss.im 안내)
    [만들기 — toss.im 워크스페이스 신규 생성 또는 합류]
```

컴포넌트 변경:
- `components/rfp/BizLookupField.tsx`: NTS 호출로 변경(액션 `lookupBizNoAction` 사용). 슬림 BizProfile 만 반환 (`{ bizNo, taxType, status }`). 회사명/대표자/KSIC/통신판매업 표시 제거. **이 파일은 P6와 RFP 작성 화면 모두에서 재사용**되지만 P6에서 grade와 함께 묶여 호출되는 게 다름
- `components/rfp/GradeConfirmPanel.tsx`: NICE 호출 제거(`lookupNiceGrade` 의존 삭제), 5단계 라디오만 + **"선택 안 함" 옵션** (등급 미입력 = `gradeSource='unset'`). 각 등급 옆에 법정 매출 구간 도움말(`STATUTORY_CARD_FEE`로 카드료 자동 표시 — `general`/미입력은 "협상" 표시). source는 사용자 선택 시 `'user_confirmed'`, RFP 작성 시점 변경은 `'user_overridden'`
- `components/auth/WorkspaceTypeRadio.tsx` 신규: buyer/PG 라디오 (Korean Editorial 스타일)

P6 submit → `signupCompleteAction({ wsKind, name, bizProfile? })`. **buyer 분기에서 토글 ON 또는 입력 모두 비어있으면 `bizProfile=undefined`** → workspace 생성 시 `biz_profile_id=NULL`. PG 분기 시도 bizProfile undefined. PG 도메인이 이미 PG ws로 존재하면 join + 안내 ("toss.im 워크스페이스에 합류했습니다").

`/invite/rfp/:token` 신규 가입 플로우:
- `app/(public)/invite/rfp/[token]/page.tsx` (비인증)에서 token을 sessionStorage `signupDraft.inviteToken`에 저장 → `/login?next=/invite/rfp/[token]` 또는 가입 시작 시 `signupEmailAction({ inviteToken })` 으로 동봉 → meta에 보존 → P6 자동 스킵 (액션이 PG 결정)

검증: 시나리오 D-buyer (직접 가입 → P6 buyer 선택 → bizNo 입력 → grade 선택 → 만들기 → /home), 시나리오 D-pg-direct (직접 PG), 시나리오 E (초대 → P6 스킵 → /inbox).

## Step 7 — 구매사 RFP 액션: createRfp, awardRfp, NTS 조회

`lib/integrations/nts.ts`:
- `NtsClient` 인터페이스 (`lookup(bizNo): Promise<{ valid; taxType; status }>`)
- `RealNtsClient`: data.go.kr 사업자등록상태조회 OpenAPI POST. 5초 timeout, leaky-bucket 10 req/s. `NTS_SERVICE_KEY` 미설정 시 throw `NTS_NO_KEY`
- 타입드 에러: `NTS_INVALID_KEY` / `NTS_RATE_LIMIT` / `NTS_NOT_FOUND` / `NTS_NETWORK`
- `lib/integrations/nts.mock.ts`: 테스트 전용 (이전 `lib/mock/biz-lookup.ts`의 BIZ_DB 3개 활용)

`lib/server/actions/rfp/`:
- `lookupBizNoAction.ts`: `requireSession()` (모든 회원). NTS 호출 → `{ valid, taxType, status }`. mock 폴백 없음
- `createRfpAction.ts`: `requireBuyerSession()`. 입력 = `{ title, memo, deadline, allowedPgEmails, rfpAttachmentIds, bizProfileMode: 'inherit' | 'override' | 'none', bizNoOverride?, gradeOverride? }`. tx:
  1. `nextRfpId(tx)`로 ID 발급
  2. **bizProfile 분기**:
     - `'inherit'` (기본): workspace.biz_profile 스냅샷 새 row insert. workspace에 biz_profile 없으면 자동으로 `'none'`으로 폴백.
     - `'override'`: 입력값(`bizNoOverride` 또는 `gradeOverride` 또는 둘 다)으로 새 biz_profiles row insert. CHECK 위반(둘 다 NULL) 시 `INVALID_BIZ_PROFILE` 에러. `gradeSource='user_overridden'`, `gradeConfirmedBy/At` 기록.
     - `'none'`: biz_profiles row 생성 안 함, `rfps.biz_profile_id=NULL`.
  3. `rfps` insert (status='draft' 또는 'sent'에 따라 분기 — 입력에 `send: true` 옵션)
  4. send 시 `rfp_invitations` N개 + `rfp.invited` outbox N개 (`dedupeKey=rfp:{id}:invite:{email}`) + `rfp.sent` outbox 1
- `awardRfpAction.ts`: 해당 RFP의 buyer ws만. tx에서 `rfpRepo.transition('awarded', { awardedBidId })` (드라이즐 `WHERE status='sent'` 가드) + `contracts` insert + winner에게 `rfp.awarded` 알림 + 패자 PG들에게 reject 알림(인앱 only)
- `cancelRfpAction.ts`/`closeRfpAction.ts`

화면 수정:
- `components/rfp/RfpCreateForm.tsx`: BizLookupField 단계 제거 (workspace bizProfile 표시만, read-only). GradeConfirmPanel은 "RFP별 등급 재확인/오버라이드" 용도로 유지. `useRfpDraftStore`는 UI 단계 state로만 유지(서버에 send 시 비움)
- `app/(app)/home/page.tsx`: RSC. `auth()` → `getRfpRepo().findByBuyerWs(session.workspaceId)` 직접 fetch. `MOCK_RFPS` 제거
- `app/(app)/rfp/page.tsx`/`[id]/page.tsx`/`[id]/award/page.tsx`: RSC + 액션. `useRfpListStore` 제거
- `app/(app)/settings/profile/page.tsx`: workspace bizProfile 표시 + grade 갱신 액션 (새 biz_profiles row insert + workspace.biz_profile_id 갱신)

검증: 시나리오 A 그린. `psql -c "SELECT id, status, biz_profile_id FROM rfps"`로 스냅샷 row 확인.

## Step 8 — PG: invite 클레임 + 입찰 제출

`lib/server/actions/`:
- `invitation/claimInviteTokenAction.ts`: 세션 필요. 미가입자는 Step 5 흐름으로 가입(inviteToken 동봉). 가입자는 직접 클레임 → `invitationRepo.claimToken(rawToken, userId)` → 도메인의 PG ws auto-join (`workspaceRepo.autoJoinPg`) → 반환 `{ rfpId }`
- `bid/submitBidAction.ts`: `requirePgSession()` + `invitationRepo.canAccess(rfpId, pgWsId)` 가드(워크스페이스 단위). **STATUTORY_CARD_FEE 서버 강제** (등급 미입력 RFP는 일반 폴백):
  ```ts
  const rfp = await rfpRepo.findById(rfpId);
  const bizProfile = rfp.bizProfileId
    ? await bizProfileRepo.findById(rfp.bizProfileId)
    : null;
  const grade = bizProfile?.grade ?? null; // null = 등급 미입력 RFP
  const cardFees = (grade === null || grade === 'general')
    ? input.cardFeesByIssuer
    : null;
  // 영세/중소1~3에서만 클라이언트 입력 무시. NULL/일반은 9개 카드사 입력 허용.
  ```
  tx로 `bids` insert (UNIQUE(rfp_id, pg_ws_id) 위반 시 `BID_ALREADY_SUBMITTED` 에러) + 초대 `status='accepted'` + buyer에게 `bid.submitted` 알림 (`dedupeKey=bid:{rfpId}:{pgWsId}`)
- `bid/withdrawBidAction.ts`: `bids.status='withdrawn'`

화면 수정:
- `app/(public)/invite/rfp/[token]/page.tsx`: 액션 사용, 가입/로그인 분기 보존
- `app/(app)/inbox/page.tsx`: RSC. `invitationRepo.findByPgWorkspace(session.workspaceId)` → 본인 워크스페이스로 발송된 모든 활성 invitation+RFP 페어. 미클레임 'pending' 도 표시(알림 딥링크와 일관)
- `app/(app)/inbox/[rfpId]/page.tsx`: RSC + `canAccess` 가드. 미통과 시 404
- `components/inbox/BidForm.tsx`: `useBidListStore`/`useNotificationsStore`/`MOCK_SESSION_PG`/`MOCK_WORKSPACES`/`MOCK_SESSION_BUYER` 제거 → `submitBidAction` 호출. proposalPdf는 attachment id로 전달

검증: 시나리오 B/C 그린. **초대된 PG 워크스페이스의 모든 멤버**가 같은 RFP에 접근 가능 — 알림 딥링크(미클레임 멤버 클릭) 정상 동작 회귀 가드. 다른 워크스페이스 사용자는 `canAccess` 차단(404).

## Step 9 — 알림: SSE + actions

- `lib/server/notifications/bus.ts`: in-process EventEmitter 싱글톤 (`globalThis` 캐시). `bus.emit(userId, notification)` / `bus.on(userId, fn)`. **헤더 주석에 NOTIFICATION.md §4 "단일 인스턴스 한계" 명시** — prod 다중 인스턴스 시 LISTEN/NOTIFY 또는 Redis pub/sub로 swap.
- `lib/server/notifications/dispatch.ts`: 트랜잭션 커밋 후 호출되는 헬퍼. `notifications` insert + (if channel includes 'inapp') `bus.emit`
- `app/api/notifications/stream/route.ts`: SSE. `runtime='nodejs'`, `dynamic='force-dynamic'`. `auth()`로 식별. 접속 시 `notificationRepo.findRecentForUser(userId, 50)` push, 신규는 `bus.on` 구독. `req.signal` abort 시 cleanup
- `lib/server/actions/notifications/`: `markNotificationReadAction`, `markAllReadAction`, `retryEmailNotificationAction` (outbox 재enqueue)

화면 수정:
- `components/shell/NotificationDrawer.tsx`: `useNotificationsStore` → 자체 훅 `useNotifications()`(EventSource 구독 + 액션). drawer 컴포넌트 visual 무변경
- `app/(app)/settings/notifications/page.tsx`: RSC list + retry 액션

검증: 입찰 제출 → buyer 드로어 ~1초 내 갱신.

## Step 10 — Resend + 이메일 템플릿 + Outbox Drizzle 어댑터

- `lib/integrations/resend.ts`: `ResendSender: Sender` (기존 `lib/server/outbox/types.ts:Sender` 그대로 구현). `RESEND_API_KEY` 부재 시 dev 모드는 console 폴백
- `lib/server/outbox/templates/{authVerify,authReset,authEmailChange,rfpInvited,rfpSent,bidSubmitted,rfpAwarded}.tsx`: react-email. 모든 numeric은 mono+tabular-nums (DESIGN.md), 본문 헤어라인
- `lib/server/outbox/drizzle-adapter.ts`: 기존 `NotificationOutboxAdapter` API 모방 (enqueue/flush/getPending/getAll). enqueue는 `INSERT ... ON CONFLICT (dedupe_key) DO NOTHING`. flush는 `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 50` 후 attempt+1 + sender 호출 + status 갱신
- `app/api/cron/flush-outbox/route.ts`: `Authorization: Bearer ${CRON_SECRET}` 검증 후 flush. 외부 cron(Vercel cron 또는 GH Actions schedule) 60s 주기
- `lib/server/outbox/post-commit.ts`: `enqueueAndFlushAfterCommit(actionTx, entries)` — 액션이 tx 종료 후 `Promise.resolve().then(()=>adapter.flush())`. Vercel 환경 detect 시 Next 15+ `after()` API로 swap
- `lib/server/__tests__/outbox.test.ts`: 기존 어서션 그대로, 백엔드만 pglite로 변경. dedupe/maxAttempts/실패 누적 케이스 보존

검증: 실 `RESEND_API_KEY`로 P2 가입 → verify 메일 도착. dev 서버를 flush 도중 종료해도 cron이 다음 tick에 pending 처리.

## Step 11 — 파일 스토리지 (로컬 디스크 + 인증 라우트)

- `lib/server/storage/local.ts`: `saveFile`/`readFile`/`deleteFile`. `STORAGE_ROOT = process.env.UPLOAD_DIR ?? './uploads'`. 스토리지 인터페이스 `Storage`로 추상화 (v1에 S3 클래스 swap)
- `app/api/files/upload/route.ts`: POST multipart. `auth()` 필수. mime 화이트리스트 (`application/pdf`, `image/png`, `image/jpeg`), 20MB 제한. `${STORAGE_ROOT}/{yyyy}/{mm}/{uuid}.{ext}` 저장 후 `attachments` insert. 응답 `{ id, name, size, mimeType }`
- `app/api/files/[id]/route.ts`: GET. 권한 검사 — owner_kind에 따라:
  - `rfp`: rfp의 buyer ws 멤버 OR `canAccess(rfpId, pgWsId)` PG (초대된 ws 멤버 모두)
  - `bid_proposal`: rfp의 buyer ws 멤버 OR 업로드한 PG ws 멤버
  - 그 외 401/403. stream으로 응답, `Cache-Control: private, no-store`
- `.gitignore`에 `uploads/` 추가
- 화면: `components/rfp/RfpAttachmentDropzone.tsx`/`components/inbox/BidForm.tsx` proposal PDF — 업로드 후 attachment id 사용. preview iframe `src=/api/files/{id}`

검증: PDF 업로드 → 디스크에 파일 존재, preview 동작, 무관 사용자는 403.

## Step 12 — Topbar 세션 디목 + 시드 스크립트

- `components/shell/Topbar.tsx`: `'use client'` 유지하되 props로 `{ user, workspaceType, workspaceName }` 받기. `useMockSession` 제거
- `app/(app)/layout.tsx`: `auth()` 한 번 호출 → `<Topbar user={session.user} ... />`. 미인증 시 `redirect('/login')`
- `scripts/seed.ts` (`tsx scripts/seed.ts`):
  - idempotent (TRUNCATE all RESTART IDENTITY → INSERT)
  - buyer ws `(주)샘플테크` (도메인 없음, biz_profile = 123-45-67890 / sme2 / user_confirmed) + 사용자 `yeonseong.dev@gmail.com` (admin)
  - PG ws toss.im / inicis.com / kakaopay.com (domain 셋팅) + 각각 사용자 1명
  - sent RFP `P-2604-0001` (초대 3, 입찰 2 — toss/inicis 제출, kakao 미제출) + draft `P-2605-0001`
- `package.json`에 `db:seed` 스크립트

검증: 시드 후 `yeonseong.dev@gmail.com` 로그인 시 기존 mock 홈 대시보드와 동등한 화면.

## Step 13 — Mock & 스토어 일괄 삭제 (컷오버 커밋)

삭제:
- `lib/mock/` 전체 (8 파일: bids/biz-lookup/invitations/notifications/rfps/session/users/workspaces)
- `lib/stores/{rfp-list,bid-list,notifications}.ts` (3 파일)

유지:
- `lib/stores/{rfp-draft,signup-draft,ui}.ts` — 순수 UI 상태

컷오버 전 grep 게이트 (모두 0이어야 함):
```bash
grep -r "from '@/lib/mock" app components lib
grep -r "useRfpListStore\|useBidListStore\|useNotificationsStore" app components lib
grep -r "MOCK_\|useMockSession" app components lib
grep -r "lookupNiceGrade\|niceLookedUpAt\|estimatedRevenue\|revenueYear\|mailOrderNo" app components lib
```

검증: `pnpm tsc --noEmit && pnpm lint && pnpm test && pnpm e2e` 4종 그린.

## Step 14 — 테스트 게이트

- `vitest.config.ts`: drizzle 테스트는 pglite 환경, 컴포넌트는 jsdom (workspace projects 분리)
- `playwright.config.ts`: `webServer: pnpm dev` + `DATABASE_URL=$DATABASE_URL_TEST` (5433 docker pg). `globalSetup`이 `scripts/test-db-reset.ts`(TRUNCATE+seed) 호출
- `e2e/{scenario-a-buyer-rfp,scenario-b-pg-bid,scenario-c-buyer-award}.spec.ts`: `PG_RFP_SPEC.md` §6 시나리오 A/B/C와 1:1 매핑
- `scripts/test-db-reset.ts`: TRUNCATE + 재시드

---

## Critical Files

- `<repo>/auth.ts` — Auth.js v5 설정 (신규)
- `<repo>/proxy.ts` — auth() wrapping (수정, rename 안 함)
- `<repo>/drizzle.config.ts` (신규)
- `<repo>/docker-compose.yml` (신규)
- `<repo>/lib/db/client.ts` + `lib/db/client-pglite.ts` + `lib/db/schema/{index,_enums,users,workspaces,workspace_members,biz_profiles,rfps,rfp_invitations,bids,contracts,notifications,outbox_entries,verification_tokens,attachments,rfp_counters}.ts` (신규)
- `<repo>/lib/types/biz-profile.ts` — 슬림화 (수정)
- `<repo>/lib/server/repositories/types.ts` (신규) + `in-memory/{rfp,invitation,workspace}.ts` (이동) + `drizzle/*.ts` (신규 11) + `factory.ts` (신규)
- `<repo>/lib/server/actions/{auth,rfp,bid,invitation,notifications}/*.ts` (신규)
- `<repo>/lib/integrations/{nts.ts,nts.mock.ts,resend.ts}` (신규)
- `<repo>/lib/server/outbox/{drizzle-adapter,post-commit}.ts` + `templates/*.tsx` (신규)
- `<repo>/lib/server/storage/local.ts` (신규)
- `<repo>/lib/server/notifications/{bus,dispatch}.ts` (신규)
- `<repo>/app/api/{auth/[...nextauth],files/upload,files/[id],notifications/stream,cron/flush-outbox}/route.ts` (신규)
- `<repo>/app/(public)/signup/workspace/page.tsx` — buyer/PG 라디오 + bizProfile 캡처 (대수정)
- `<repo>/app/(public)/auth/verify/page.tsx` — 토큰 검증 본체로 일원화 (수정)
- `<repo>/app/(public)/signup/verify/page.tsx` — `/auth/verify`로 redirect 셸로 축소 또는 삭제 (수정/삭제)
- `<repo>/components/auth/WorkspaceTypeRadio.tsx` (신규)
- `<repo>/components/rfp/{BizLookupField,GradeConfirmPanel}.tsx` — NTS만 / 5단계 라디오 (수정)
- `<repo>/components/rfp/RfpCreateForm.tsx` — bizProfile 캡처 단계 제거 (수정)
- `<repo>/components/inbox/BidForm.tsx` — 액션 호출 (수정)
- `<repo>/components/shell/{Topbar,NotificationDrawer}.tsx` — 디목 (수정)
- `<repo>/scripts/{seed,test-db-reset}.ts` (신규)

## 재사용 가능한 기존 자산

- `lib/server/repositories/{rfp,invitation,workspace}.ts` — 의미론(`assertTransition`, `claimToken`, `canAccess`, `autoJoinPg`) 그대로 인터페이스로 승격
- `lib/server/outbox/{adapter,types}.ts` — `Sender` 인터페이스, dedupe/retry/maxAttempts 모델 그대로
- `lib/server/token.ts` — `generateToken`/`hashToken`/`isExpired`/`addMinutes` 그대로
- `lib/server/rfp-state.ts` — `assertTransition` 상태 전이 검증 로직 그대로 (draft→sent, sent→{closed/cancelled/awarded})
- `lib/server/__tests__/{rfp-repo,invitation,workspace,outbox,token,rfp-state}.test.ts` — 어서션 보존, repo 백엔드만 pglite로 swap
- `lib/types/bid.ts:STATUTORY_CARD_FEE` — 영세/중소 카드료 강제 적용 시 import (`general`은 `NaN`이므로 `Number.isNaN`으로 분기)
- `lib/mock/biz-lookup.ts:BIZ_DB` — 테스트 픽스처(`lib/integrations/nts.mock.ts`)로 이전한 뒤 Step 13에서 본 파일은 삭제

## 검증 (전구간 그린 기준)

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed

pnpm tsc --noEmit
pnpm lint
pnpm test                            # vitest (in-memory + pglite)

docker compose --profile test up -d pg-test
DATABASE_URL=$DATABASE_URL_TEST pnpm e2e   # Playwright A/B/C
```

수동 클릭 검증:
- **D-buyer (직접가입 → buyer)**: `/signup` → 메일 verify → P5 → P6 buyer 라디오 → 워크스페이스 이름 + bizNo NTS 조회 + grade 5단계 선택 → 만들기 → `/home`
- **D-pg-direct (드물지만 직접가입 → PG)**: P6 PG 라디오 → 만들기 → `/home` (도메인 자동 PG ws 신규 또는 join)
- **E (초대로 PG)**: 메일 `/invite/rfp/Q-xxxx` 클릭 → 가입 분기 (P5만 거치고 P6 스킵) → `/inbox/Q-xxxx`
- **F (비밀번호 분실)**: `/login` → forgot → 메일 → reset → 자동 로그인
- **시나리오 A (buyer)**: `/rfp/new` → workspace bizProfile 표시 + grade 재확인 → 메모/마감일/허용 PG 이메일 → 발송 → 초대 메일 N건
- **시나리오 B (PG)**: 초대 클릭 → 클레임 → `/inbox/:rfpId` → 입찰(영세/중소면 카드 입력란 비활성, 일반이면 9개 카드 입력) → 제출
- **시나리오 C (낙찰)**: buyer 비교표 → 낙찰 → winner/패자 알림 (인앱 + 이메일)
- **알림 SSE**: 입찰 제출 → buyer 드로어 ~1초 내 갱신
- **권한**: PG 동료(같은 도메인 다른 사용자)가 같은 RFP 직접 URL 접근 → 404

## 남은 보류 사항 (v1)

- prod 호스팅 (Vercel/Fly/Railway) + SSE 다중 인스턴스 (LISTEN/NOTIFY 또는 Redis pub/sub)
- 파일 스토리지 prod 백엔드 (S3/Supabase Storage) — `lib/server/storage/`의 1 클래스 swap
- NICE/공정위 재추가 — `BizProfile` 슬림화 상태에서 컬럼 추가 마이그레이션 1회
- 5회 실패 캡차/10회 락 (`login_attempts` 테이블)
- Auth.js v5 ↔ Next 16 호환성 이슈 발생 시 `next-auth@5.0.0-beta` pin
- **B4 칸반 보드 store 컷오버** — 현재 `lib/stores/bid-board.ts` (Zustand + localStorage persist)가 buyerStage/BidNote 단일 출처. 다음 작업이 묶여서 한 PR로 처리:
  - `bids.buyer_stage` 컬럼 추가 (enum: `pending|negotiating|decided`, default `'pending'`)
  - `bid_notes` 테이블 신설 (`id`, `bid_id` fk, `author_id` fk users, `body` text, `created_at`)
  - `attachments.owner_kind` enum에 `'bid_note'` 추가 + 업로드 라우트 권한 분기
  - 서버 액션: `updateBuyerStageAction(bidId, to)` (auth: rfp.buyerWsId === session.workspaceId), `addBidNoteAction(bidId, body, attachmentIds[])`, `removeBidNoteAction(noteId)` — 모두 author 검증
  - Repo: `BidRepo.updateBuyerStage`, `BidNoteRepo.{save,findByBid,delete}`
  - 클라이언트: `lib/stores/bid-board.ts` 폐기 후 server-component fetch + optimistic mutation으로 교체. 기존 localStorage 데이터는 의도적 폐기 (v0 데모용)

---

## 작업 흐름: Subagent develop → Step-별 Commit

각 Step은 **general-purpose subagent에게 위임 → 메인이 검토/검증 → commit** 의 3-페이즈로 진행한다. M5/M6/M7 커밋(`M5: 수주 처리 …`, `M6: 워크스페이스 운영 …`)이 이미 정착시킨 패턴을 그대로 확장한다.

### 페이즈 0 — Step 진입 준비 (메인이 직접)

1. **Step 명세 확정**: 본 문서의 해당 Step 섹션 + 의존 섹션(예: Step 5 → Step 2/3/4) 한 번 더 읽기.
2. **TaskCreate**: 메인 세션에서 todo로 등록 (`Step N — <한줄 요약>`).
3. **선행 그린 확인**: `pnpm tsc --noEmit && pnpm lint && pnpm test` 모두 통과 상태에서만 시작. 빨간 상태에서 위임 금지.
4. **브랜치 컨벤션**: `feat/m8-step-N-<slug>` 또는 클러스터 PR로 묶을 시 `feat/m8-cluster-<범위>-<slug>`. 메인 브랜치에 직접 커밋하지 말 것 — 14 step 누적 시 revert 단위 확보.

### 페이즈 1 — Subagent 위임 (구현)

`Agent` 툴 — `subagent_type: "general-purpose"` — 에게 다음 형식의 프롬프트를 **자기-완결적으로** 전달:

```
[Context]
bidit 프로젝트의 M8 백엔드 마이그레이션 Step N을 구현해줘.
전체 계획: /Users/yeonseong/project/bidit/BACKEND_MIGRATION.md
도메인 컨텍스트: /Users/yeonseong/project/bidit/CLAUDE.md (Document Hierarchy 1~6 참조)

[Step 명세]
<해당 Step 섹션을 그대로 인용 — 파일 경로/시그니처/검증까지 포함>

[의존 자산 — 그대로 보존할 것]
<재사용 자산 섹션 중 해당 Step 관련 항목만 발췌>

[작업 범위 — Hard 제약]
- 본 Step의 파일만 추가/수정. 다른 Step의 파일은 건드리지 말 것 (예외: 의존 인터페이스가 노출하는 파일은 import 추가 OK).
- mock/store 삭제는 Step 13에서만. 그전까지는 임시 보정만.
- DESIGN.md "Korean Editorial" 하드 룰 준수 (UI 변경 시): 라운드/컬러/font-mono+tabular-nums.
- 새 라이브러리 추가 시 본 문서 deps 리스트와 일치 — 임의 추가 금지.

[검증]
완료 직전 다음 모두 통과:
- pnpm tsc --noEmit
- pnpm lint
- pnpm test
- (해당되는 Step만) pnpm e2e 시나리오 A/B/C
완료 보고에는 "변경된 파일 목록 + 검증 명령 출력 요약"만 200단어 이내로.

[금지]
- git commit / git push (메인이 함)
- mock/store 일괄 삭제 (Step 13 전용)
- README/문서 신규 생성 (이미 본 문서/CLAUDE.md/IMPLEMENTATION.md가 진실)
- BACKEND_MIGRATION.md 수정 (계획은 메인이 관리)
```

> Subagent에게 "구현"임을 명시하라. 단지 "리서치"로 위임하면 코드를 쓰지 않는다.

### 페이즈 2 — 메인 검토 + 검증

Subagent 보고 도착 시 메인은:

1. **Trust-but-verify**: 변경 파일 `git diff` 직접 읽기. Subagent 요약은 의도이지 사실이 아님.
2. **검증 재실행**: `pnpm tsc --noEmit && pnpm lint && pnpm test`. e2e 해당 Step은 `pnpm e2e`.
3. **수동 클릭스루** (UI 영향 Step 5/6/7/8/9/11): dev 서버 띄워 본 문서 §검증의 D-buyer/E/F/A/B/C 중 해당 시나리오 확인.
4. **Cross-doc 동기화 확인**: 도메인 타입 변경 시 `lib/types/*` ↔ `lib/db/schema/*` ↔ Drizzle 마이그레이션이 정합한지.
5. **막힘 시**: `advisor()` 호출. Subagent 재위임은 같은 프롬프트 반복 금지 — 실패 원인을 프롬프트에 추가해 차이를 만들 것.

### 페이즈 3 — Commit

검증 그린 확인 후 메인이 직접 커밋. **Subagent에게 commit 권한 위임 금지** (M5/M6/M7 패턴 일관 유지 + Co-Authored-By 라인 정확성 확보).

커밋 메시지 컨벤션 (M5/M6 style 그대로):

```
M8/Step N: <한줄 요약 ≤ 50자>

<선택> Why-중심 1~2문장. 기존 인터페이스 보존 의도, 동시성 가드 등 비자명한 결정만.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

예시:
- `M8/Step 1: Docker Postgres + Drizzle 부트스트랩`
- `M8/Step 4: Repo 인터페이스 + Drizzle 구현 + pglite 테스트 swap`
- `M8/Step 13: mock & 3 stores 컷오버 삭제`

`git add .` 대신 **파일 명시 add** (`git add lib/db/ drizzle/ docker-compose.yml ...`) — `.env`/uploads/credentials 유출 방지.

### 페이즈 4 — TaskUpdate + 다음 Step

1. todo `completed` 마킹.
2. 의존 그래프(본 문서 상단)에 따라 다음 Step 진입 여부 결정 — 병렬 가능한 Step끼리는 별도 브랜치로 동시 위임 가능. 단 Step 2 schema 확정 전엔 Step 4/7/8/10 모두 블록.
3. 7~8 step마다 `pnpm e2e` 풀런 (점증 회귀 차단).

### PR 묶음 권고

14 step을 step별 PR로 끊으면 PR 14개가 된다. 리뷰 부담 줄이기 위해 다음 클러스터로 묶기를 권고:

| PR | 묶음 |
|---|---|
| PR-1 | Step 1 + Step 2 (스키마 토대) |
| PR-2 | Step 3 (Auth.js) |
| PR-3 | Step 4 (Repo iface + Drizzle 구현) |
| PR-4 | Step 5 + Step 6 (P1~P11 + P6 라디오) |
| PR-5 | Step 7 (buyer 액션) |
| PR-6 | Step 8 (PG 액션) |
| PR-7 | Step 9 (SSE) |
| PR-8 | Step 10 (Resend + outbox 어댑터) |
| PR-9 | Step 11 (파일 스토리지) |
| PR-10 | Step 12 (Topbar 디목 + seed) |
| PR-11 | Step 13 (mock 삭제 컷오버) |
| PR-12 | Step 14 (e2e + CI 게이트) |

각 PR 안에 step별 commit이 살아있어 bisect/revert 단위 보존. PR 본문에는 본 문서 §검증의 해당 항목 체크박스 복사.

### Subagent 위임 시 자주 나오는 함정

| 함정 | 대응 |
|---|---|
| Subagent가 mock 파일을 미리 삭제 | 프롬프트의 "Step 13 전용" Hard 제약을 다시 명시 + 실패 보고 후 재위임 |
| Subagent가 임의 라이브러리 추가 (예: prisma 대신 typeorm) | 프롬프트의 deps 리스트 인용 강조. PR 리뷰에서 `package.json` diff 직접 확인 |
| Subagent가 Drizzle CHECK 제약을 과적용해 마이그레이션 실패 | "DB CHECK는 어렵고 액션 레이어 검증 + 테스트로 보강" 줄 강조 |
| Subagent가 BACKEND_MIGRATION.md를 수정 | 본 문서는 메인 단독 편집. 의문은 advisor로 |
| Subagent가 `git commit` 시도 | 페이즈 3 금지 항목 강조. 권한 거부 시 메인이 수동 커밋 |
