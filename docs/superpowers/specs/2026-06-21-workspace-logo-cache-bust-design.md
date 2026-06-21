# 워크스페이스 로고 캐시 버스트 — 설계

작성일: 2026-06-21
상태: 설계 승인(접근법 A + 베이스 dev@#272-merged 확정), 구현 계획 대기
베이스: `origin/dev` (PR#272 user-avatar 머지 후, `b6f388b0`)

## 1. 목표

워크스페이스 로고(워크스페이스 프로필 사진)를 바꾸거나 지우면 **모든 화면에 즉시 반영**한다. 현재 서빙은 `Cache-Control: public, max-age=3600` 고정 URL이라 변경 후 최대 1시간 동안 옛 로고가 캐시될 수 있다. 방금 user-avatar에 적용한 캐시 버스트(`?v` + immutable)를 워크스페이스 로고에도 적용하되, **로고는 public 유지**한다 — 오픈 게시판(`/opportunities` + PG 홈 탐색)·PG 발견에서 노출되므로 user-avatar의 로그인 게이트는 가져오지 않는다.

## 2. 스코프

### 포함
- 서빙 GET 캐시를 `public, max-age=31536000, immutable`로 + URL 버전화(`?v={logoUpdatedAt}`).
- `workspaces.has_logo` boolean → `workspaces.logo_updated_at` timestamptz nullable (존재+버전 겸용).
- `WorkspaceAvatar` 및 모든 렌더 호출부·read DTO를 `hasLogo: boolean` → `logoUpdatedAt: string | null`로 전환.
- 기존 로고 백필.

### 제외 (YAGNI)
- GET 로그인 게이트화 (로고는 public 유지).
- 업로드 제약(5MB·PNG/JPEG·`sniffMime`)·SVG 정책 변경 — 그대로.
- `workspaces.has_logo` 컬럼의 즉시 DROP — **이 PR은 expand 단계**(컬럼 추가 + 코드 전환 + 백필). DROP은 안전한 follow-up PR에서(§7).

## 3. 결정 (승인됨)
- **접근법 A**: `has_logo` boolean을 `logo_updated_at` timestamptz nullable로 교체(user-avatar의 `avatar_updated_at` 미러). 단일 컬럼 = 존재 + `?v` 버전. 스위처·PG가입 리스트 쿼리는 join 없이 유지.
- (대안 C — blob LEFT JOIN 파생 — 는 백필 불필요하지만 user-avatar와 비대칭 + 리스트 쿼리 3개에 join 추가라 미채택.)

## 4. 컴포넌트별 설계

### 4.1 DB 스키마
- `lib/db/schema/workspaces.ts`: `logo_updated_at` timestamptz `{ withTimezone: true }` **nullable** 추가. `has_logo`(line 17)는 **이 PR에서 유지**(코드가 더 이상 읽지 않는 dead 컬럼; follow-up에서 DROP — §7).
- 버전 권위 소스 = 기존 `workspace_logo_blobs.updatedAt`(`lib/db/schema/workspace-logo-blobs.ts:24-26`, upsert마다 `now()` 세팅, 현재 미사용).

### 4.2 리포지토리 (`lib/server/repositories/drizzle/workspace.ts`)
- `setHasLogo(workspaceId, hasLogo: boolean)` → **`setLogoUpdatedAt(workspaceId, value: Date | null)`** (인터페이스 `types.ts:311-312` + 구현 `610-613`). 라우트 POST→`now()`, DELETE→`null`.
- `hydrate()`(109-121): 기존 blob 조회를 `select({ updatedAt: workspaceLogoBlobs.updatedAt })`로 바꿔 `logoUpdatedAt: logoRow?.updatedAt ? new Date(...).toISOString() : null` 반환. → **이 경로(설정/프로필·counterparty)는 blob.updatedAt에서 직접 와서 백필 불필요.**
- 비정규화 컬럼을 읽는 리스트 쿼리는 `workspaces.hasLogo` → `workspaces.logoUpdatedAt` select로 교체하고 ISO로 매핑:
  - `listForUser`(172-195, line 189)
  - `listAllWorkspacesForMaster`(197-214, line 208)
  - `listCanonicalPgWorkspaces`(311-324, line 313)
  → **이 경로(스위처·PG가입)는 비정규화 컬럼을 읽으므로 기존 로고 백필 필요(§7).**

### 4.3 타입
- `lib/types/workspace.ts`: `Workspace.hasLogo` → `logoUpdatedAt: string | null`; `WorkspaceMembershipSummary.hasLogo`(line 28) → `logoUpdatedAt`.
- `components/messages/types.ts:30`: `Counterparty.hasLogo` → `logoUpdatedAt?: string | null`.

### 4.4 컴포넌트 `WorkspaceAvatar` (`components/primitives/WorkspaceAvatar.tsx`)
- prop `hasLogo?: boolean` → `logoUpdatedAt?: string | null`.
- `logoUpdatedAt && workspaceId && !imgError` → `<img src={`/api/workspace/${workspaceId}/avatar?v=${Date.parse(logoUpdatedAt)}`} onError=… >` (line 32 src 교체), 아니면 이니셜.
- user-avatar `Avatar`에 적용한 **버전 변경 시 imgError 리셋**(stored-prev-prop derived-state 패턴) 동일 적용 — 마운트 유지 상태(채팅 등)에서 로고 교체 시 즉시 반영.

### 4.5 렌더 호출부 배선 (`hasLogo` → `logoUpdatedAt`)
| 호출부 | 파일 | 비고 |
|---|---|---|
| 스위처(current+목록) | `components/shell/WorkspaceSwitcher.tsx:68,116` | pending state(31,38)·current prop도 전환 |
| 설정/프로필 | `app/(app)/settings/profile/page.tsx:129` → `components/settings/WorkspaceLogoForm.tsx:13,82,111` | 삭제버튼 게이트(111) `logoUpdatedAt != null` |
| 상대방 카드 | `components/messages/CounterpartyProfileCard.tsx:51,72` | |
| 대화 목록 | `components/messages/ConversationList.tsx:45` | |
| 수신자 카드 | `components/messages/RecipientCard.tsx:21` | |
| 채팅 헤더 | `components/messages/ThreadView.tsx`(헤더) | 현재 hasLogo 미전달 → logoUpdatedAt도 동일(이니셜 폴백) |
| 홈 최근 메시지 | `components/home/RecentMessagesPanel.tsx:85` | |
| PG 가입 회사선택 | `app/(public)/signup/pg/workspace/PgWorkspaceStep.tsx:109` | CanonicalCompany 타입 |
| 채팅 fallback | `components/messages/ChatPanel.tsx:117` | `hasLogo:false` → `logoUpdatedAt:null` |
| 타입 전달 | `components/messages/ThreadPane.tsx:17`, `components/shell/Sidebar.tsx:33` | prop 타입만 |

**Read DTO 배선(서버):**
- `Workspace.hasLogo`(hydrate) → §4.2.
- `Counterparty.hasLogo` — `lib/server/actions/chat/conversationLoaders.ts:102-109`(108: `counterpartyWs?.hasLogo`)가 `logoUpdatedAt: counterpartyWs?.logoUpdatedAt ?? null`로. `RecentMessagesPanel`의 `InboxListItem.counterparty`(inbox 로더)·`ConversationListItem.counterparty`도 동일 — 구현 시 `hasLogo` grep으로 모든 DTO 생산 지점 확인.
- 스위처 `current`/`workspaces[]`(`app/(app)/layout.tsx:105`) → WorkspaceMembershipSummary 경유(§4.2).

### 4.6 라우트 (`app/api/workspace/[id]/avatar/route.ts`)
- `GET`: 캐시 헤더(line 40) `public, max-age=3600, s-maxage=3600` → **`public, max-age=31536000, immutable`**. `?v` 무시(현재 바이트 반환). **public 유지(인증 게이트 추가 안 함).**
- `POST`(78): `setHasLogo(id, true)` → `setLogoUpdatedAt(id, new Date())`. `DELETE`(100): `setHasLogo(id, false)` → `setLogoUpdatedAt(id, null)`. 검증(5MB·MIME·sniff) 불변.

## 5. 에러 처리
- 서빙: 로고 없으면 404 → `WorkspaceAvatar`가 이니셜(애초에 `logoUpdatedAt=null`이면 `<img>` 안 그림). `<img>` 로드 실패 시 onError 이니셜 폴백.
- `logoUpdatedAt`는 모든 경로에서 ISO `string | null`(raw `Date` 누출 없음): hydrate·리스트 쿼리·DTO 로더가 `new Date(...).toISOString()` 또는 `null`로 정규화.

## 6. 테스트 (TDD)
참조: user-avatar 라우트/컴포넌트 테스트 패턴.
- 라우트: GET 캐시 헤더 `immutable`+`public`, POST→`logo_updated_at` non-null, DELETE→null, GET 여전히 비인증 200(public 유지 회귀).
- repo: `setLogoUpdatedAt` 토글, `hydrate`가 blob.updatedAt를 ISO `logoUpdatedAt`로, 리스트 쿼리 3개가 `logoUpdatedAt` 노출(있는 워크스페이스 ISO / 없으면 null).
- `WorkspaceAvatar`: `logoUpdatedAt` 있으면 `?v` img, 없으면 이니셜, onError 폴백, 버전 변경 시 리셋.
- DTO: counterparty/membership-summary가 `logoUpdatedAt` 채움.

## 7. 마이그레이션 / 배포 (⚠️ user-avatar와 달리 기존 로고 존재 — expand-contract)
- **이 PR (expand)**: `db:push`로 `workspaces.logo_updated_at` 추가(additive, nullable). `has_logo`는 스키마에 남기되 코드는 더 이상 읽지/쓰지 않음.
- **백필(1회, 필수)**: `UPDATE workspaces w SET logo_updated_at = b.updated_at FROM workspace_logo_blobs b WHERE w.id = b.workspace_id;` — 안 하면 스위처·PG가입에서 기존 로고가 이니셜로 보임(hydrate 경로는 blob 조인이라 영향 없음). 스크립트 `pnpm backfill:logo-updated-at` 또는 PR body의 SQL.
- **배포 순서**: `db:push`(add col) → 백필 → 코드 배포(pm2 restart). additive라 구버전 코드와 충돌 없음.
- **follow-up PR (contract)**: 배포 안정 확인 후 `workspaces.has_logo` 컬럼 DROP(이제 미사용). TODOS에 기록.
- env·스토리지 변경 없음.

## 8. 미러링 원본 (참조)
- user-avatar(PR#272, dev): `Avatar.tsx`(?v + imgError 리셋), `/api/user/[id]/avatar` GET(immutable, 단 private), `users.avatar_updated_at`/`User.avatarUpdatedAt`/`setAvatarUpdatedAt`/`rowToUser` 패턴. 본 작업은 그 패턴을 워크스페이스로 옮기되 public 유지 + 기존데이터 백필.
- 워크스페이스 로고 현행: `WorkspaceAvatar.tsx`, `app/api/workspace/[id]/avatar/route.ts`, `workspace.ts`(hydrate·setHasLogo·리스트), `workspace-logo-blobs.ts`(updatedAt).
