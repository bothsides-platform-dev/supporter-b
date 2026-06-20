# 사용자(계정) 프로필 사진 업로드 — 설계

작성일: 2026-06-20
개정: 2026-06-21 — 검증(5-에이전트) 후 2건 보강 확정: (①) 캐시 버스트(`avatar_updated_at` + `?v` + immutable), (②) 서빙 GET **로그인 필수 + private 캐시**. 본문은 이 결정을 반영함.
상태: 설계 승인 완료(보강 확정), 구현 계획 대기

## 1. 목표

개인 **사용자 계정**도 프로필 사진을 업로드·교체·삭제할 수 있게 한다. 현재 사용자 아바타는 이름 이니셜 + `avatar_color`만 렌더한다(`components/primitives/Avatar.tsx`). 워크스페이스 로고(PR#246, `workspace_logo_blobs`)가 이미 이미지 blob 업로드를 지원하므로 그 패턴을 사용자용으로 미러링하되, 아래 두 가지를 워크스페이스 로고보다 개선한다.

- 업로드한 사진은 **앱 전체**(헤더·사이드바·1:1 채팅 메시지·팀 채팅 메시지·멤버 목록·멘션·설정)에 노출한다.
- 서빙 라우트(GET)는 **로그인 필수**(인증된 세션) + `Cache-Control: private` 다. 개인 사진은 회사 로고보다 민감하므로 워크스페이스 로고의 공개 서빙과 달리 인증 게이트를 둔다. 사용자 아바타는 항상 인증 화면 안에서만 노출되므로 `<img>` 태그도 동일 origin 쿠키로 정상 동작한다.
- 사진 변경 즉시 모든 화면에 반영되도록 **버전 기반 캐시 버스트**(`?v={avatar_updated_at}`)를 쓴다. 워크스페이스 로고는 `max-age=3600` 고정 URL이라 변경 후 최대 1시간 stale 가능한데, 이 기능은 "내 사진 바꾸기" 즉시 반영 기대가 커서 이 wart를 제거한다.

## 2. 스코프

### 포함
- 사용자 아바타 이미지 저장(DB bytea) + 서빙 + 업로드/삭제 API
- `Avatar` 컴포넌트에 이미지 렌더 + 이니셜 폴백 추가
- 모든 사용자-아바타 렌더 지점에 `userId`/`avatarUpdatedAt` 배선
- 설정 페이지(`settings/profile`)에 업로드 폼

### 제외 (YAGNI)
- 이름·`avatar_color` 편집 (요청은 사진만; 필요 시 별도 작업)
- 이미지 크롭/리사이즈 UI (원본 저장, 화면에서 `object-cover` + `rounded-full`)
- WebP/GIF/SVG 등 추가 포맷 (PNG/JPEG만 — SVG는 워크스페이스 로고와 동일한 XSS 사유로 의도적 제외)

## 3. 제약

- 최대 **5MB** (워크스페이스 로고와 동일: `MAX_BYTES = 5 * 1024 * 1024`)
- MIME: `image/png`, `image/jpeg`만 (`ALLOWED_MIMES`)
- `sniffMime`(매직바이트, `@/lib/server/storage/sniff`) 검증으로 선언 MIME ↔ 실제 바이트 일치 확인 (불일치 시 415)
- **서빙(GET)**: 인증 세션 필수(미인증 401). 캐시 `Cache-Control: private, max-age=31536000, immutable` — URL에 `?v={avatar_updated_at}` 버전이 붙으므로 버전이 바뀌면 새 URL = 새 fetch. 버전 동일하면 영구 캐시.

## 4. 컴포넌트별 설계

### 4.1 DB 스키마
**새 테이블 `user_avatar_blobs`** (`lib/db/schema/user-avatar-blobs.ts`) — `workspace-logo-blobs.ts` 복제:
- `user_id` uuid PK, FK → `users.id` `ON DELETE CASCADE`
- `bytes` bytea NOT NULL (`customType` 동일 정의 — `fromDriver`가 `Buffer.from`으로 정규화)
- `mime` text NOT NULL
- `updated_at` timestamptz NOT NULL default `now()`

**`users` 테이블에 `avatar_updated_at` 추가** (`lib/db/schema/users.ts`):
- `avatar_updated_at` timestamptz **NULL** — 비정규화 컬럼. **사진 유무 + 캐시 버전을 동시에** 표현한다.
  - `NULL` ⟺ 아바타 없음 → 이니셜 렌더.
  - `non-NULL` ⟺ 아바타 있음 → 그 타임스탬프를 `?v` 캐시 버전으로 사용.
- (워크스페이스의 `has_logo` boolean 대신 timestamp 단일 컬럼을 쓰는 이유: blob 테이블을 join하지 않고도 페이로드·캐시버스트를 처리하면서 boolean 1개와 컬럼 수가 동일.)
- 스키마 export barrel(`lib/db/schema/index.ts`)에 새 테이블 등록(`workspace-logo-blobs` export 바로 다음).

> **users→user_avatar_blobs 타입 사이클 주의**: `user-avatar-blobs.ts`가 `users`를 import하지만 `users.ts`는 새 테이블을 import하지 않으므로(단방향) 사이클 없음. `avatar_updated_at`은 `users.ts`에 평범한 컬럼으로 추가.

### 4.2 리포지토리
**`DrizzleUserAvatarRepository`** (`lib/server/repositories/drizzle/user-avatar.ts`) — `workspace-logo.ts` 복제(`workspaceId` → `userId`):
- `find(userId, tx?)` → `{ bytes: Buffer; mime: string } | undefined`
- `exists(userId, tx?)` → boolean
- `upsert(userId, bytes, mime, tx?)` (INSERT … ON CONFLICT DO UPDATE, `set.updatedAt = new Date()`)
- `remove(userId, tx?)`
- 생성자 `constructor(private readonly _db: DB | any)` + `private h(tx?)` 패턴 그대로(`eslint-disable` 포함).

**`UserAvatarRepo` 인터페이스**를 `lib/server/repositories/types.ts`에 추가(`WorkspaceLogoRepo` 형태 그대로, 도메인 블록 주석 `// ── UserAvatar ──` 포함).

**factory 등록** (`lib/server/repositories/factory.ts`) — `workspaceLogo` 4지점 미러링:
- lazy import `const { DrizzleUserAvatarRepository } = await import('./drizzle/user-avatar');`
- `RepoBundle` 타입에 `userAvatar: UserAvatarRepo`
- 인스턴스화 `userAvatar: new DrizzleUserAvatarRepository(db)`
- `export async function getUserAvatarRepo()` 접근자
- **`BUNDLE_VERSION` 13 → 14 증가** (HMR/worktree 캐시 무효화에 필수 — 빠뜨리면 개발 중 stale 번들)

**`UserRepo`에 `setAvatarUpdatedAt(userId, value: Date | null, tx?)` 추가** (`types.ts` + `drizzle/user.ts`) — 워크스페이스 `setHasLogo` 패턴의 timestamp 버전. `users.avatar_updated_at` 갱신(업로드 시 `now`, 삭제 시 `null`).

**`User` 타입이 `avatarUpdatedAt` 노출**:
- `lib/types/user.ts`의 `User`에 `avatarUpdatedAt: string | null` 추가(ISO 문자열; 클라 직렬화 가능).
- **`rowToUser`가 2곳에 존재** — 둘 다 `avatar_updated_at`을 매핑해야 한다:
  1. `lib/server/repositories/drizzle/user.ts` (`findById` 등 단일 사용자 경로)
  2. `lib/server/repositories/drizzle/workspace.ts` (`hydrate` — `workspace.members[]` 조립 경로)
- `User`에 필수 필드로 추가하면 tsc가 누락된 생성 지점(시드/테스트 팩토리 포함)을 전부 잡아준다.

### 4.3 API 라우트

쓰기와 읽기를 **다른 파일**에 둔다 — 쓰기는 본인(session)만, 읽기는 임의 `id`(단 로그인 필요). 한 파일에 섞으면 `[id]`의 의미가 충돌.

**`app/api/user/avatar/route.ts`** — 본인 아바타 변경(세션 userId 사용, `[id]` 불필요):
- 공통: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `fail()` 헬퍼, `MAX_BYTES`/`ALLOWED_MIMES` — 워크스페이스 라우트 복제.
- `POST`: `auth()` → `session?.user?.id` 없으면 401 → `isSessionRevoked` 401 → `isEmailUnverified` 403 → FormData `file` 파싱 → 빈/누락 400 → 5MB 초과 413 → MIME 미허용 415 → `sniffMime` 미스매치 415 → `userAvatar.upsert(userId, buffer, sniffed)` → `userRepo.setAvatarUpdatedAt(userId, new Date())` → `{ ok: true }`.
  - **ACL은 "본인"**: 워크스페이스의 `wsId === id` 체크가 사라지고, `id` 자체를 받지 않는다(`session.user.id`만 사용). 타인 아바타 변경 경로가 구조적으로 없음.
- `DELETE`: `auth()` + `isSessionRevoked` + `isEmailUnverified` → `userAvatar.remove(userId)` → `userRepo.setAvatarUpdatedAt(userId, null)` → `{ ok: true }`.

**`app/api/user/[id]/avatar/route.ts`** — 서빙(로그인 필수):
- `GET`: `auth()` → 세션(`session?.user?.id`) 없으면 **401**(워크스페이스 로고의 공개 GET과 다름). → `userAvatar.find(id)` → 없으면 404 → 바이트(Uint8Array 래핑) + `Content-Type: {mime}` + `Content-Length` + `Cache-Control: private, max-age=31536000, immutable` 반환.
- `?v` 쿼리는 라우트가 **무시**한다(캐시 키 분리 용도일 뿐). 항상 현재 바이트를 반환.

### 4.4 Avatar 컴포넌트 (`components/primitives/Avatar.tsx`)
- `'use client'` 전환(현재 서버 컴포넌트) — `imgError` state 필요. (client 컴포넌트는 서버 트리에서 렌더 가능하므로 기존 import 안전; props 직렬화만 OK.)
- props 추가: `userId?: string`, `avatarUpdatedAt?: string | null`. (기존 `name`/`color`/`size`/`className` 유지 → **하위호환**: 둘 다 없으면 기존 이니셜 동작.)
- `userId && avatarUpdatedAt && !imgError` →
  `<img src={`/api/user/${userId}/avatar?v=${Date.parse(avatarUpdatedAt)}`} onError={() => setImgError(true)} className="… object-cover rounded-[var(--md-sys-shape-full)] {sizeMap[size]}">`
  (Avatar는 원형 `shape-full`이므로 img도 원형 + `object-cover`. `alt`/`aria-label`로 접근성 유지.)
- 그 외 → 기존 이니셜 + `colorMap`/`sizeMap` 폴백 그대로.
- `WorkspaceAvatar`의 `imgError` 폴백 패턴 복제(막 삭제된 사진 레이스 방어).

### 4.5 렌더 호출부 배선 (작업량의 핵심)
`Avatar`를 쓰는 지점. 각자 `userId`+`avatarUpdatedAt`를 확보해 전달한다:

| 호출부 | 파일 | userId 출처 | `avatarUpdatedAt` 배선 |
|---|---|---|---|
| 헤더/사이드바 사용자 메뉴 | `components/shell/UserMenu.tsx` | 현재 세션 | shell 레이아웃(`app/(app)/layout.tsx`)이 `getUserRepo().findById(session.user.id)`로 현재 사용자 `avatarUpdatedAt`를 **서버 로드**해 prop 전달. (JWT/세션엔 넣지 않음 — 4.7 참조) |
| 1:1 채팅 발신자 | `components/messages/ThreadView.tsx` | `m.authorUserId` | 메시지 read shape에 `authorAvatarUpdatedAt` 추가, users 조인으로 hydrate |
| 팀 채팅 발신자 | `components/messages/TeamThreadView.tsx` | `m.authorUserId` | 팀 메시지 read shape(`TeamThreadMessage`)에 `authorAvatarUpdatedAt` 추가, hydrate |
| 멘션 드롭다운 | `components/messages/MentionDropdown.tsx` | 멤버 `userId` | roster 항목(`TeamMember`/`MentionCandidate`)에 `avatarUpdatedAt` 추가 |
| 멤버 행 | `components/settings/MemberRow.tsx` | `m.id`(=userId) | `workspace.members[]`(`User`)의 `avatarUpdatedAt`(§4.2) |
| 설정 프로필 | `app/(app)/settings/profile/page.tsx` | `me.id` | `me.avatarUpdatedAt`(§4.2) |
| 초대 페이지 | `app/(public)/invite/page.tsx` | 초대자 id(있으면) | 공개 페이지·현재 placeholder("샘플테크")라 **이니셜 유지**(낮은 우선순위, 실제 유저 컨텍스트 없음) |

**데이터 read shape 변경 (서버):**
- **1:1 채팅 메시지**(`ThreadView`가 쓰는 read 타입)에 `authorAvatarUpdatedAt: string | null` 추가 + repo 조회의 users 조인에 `users.avatar_updated_at` 컬럼 추가. 발신자 이름(`authorName`, PR#181)을 이미 같은 조인으로 hydrate하므로 컬럼 하나만 더 select.
- **팀 채팅 메시지**: `lib/server/repositories/drizzle/rfp-team-message.ts`의 `TEAM_MESSAGE_COLUMNS`(명시 projection — 드리프트 가드)에 `users.avatar_updated_at` 추가, `RfpTeamMessageWithAuthor`(types.ts) + `TeamThreadMessage`(`teamThreadLoader.ts`)에 필드 추가.
- **멤버 roster**: `workspace.teamRoster()`(`drizzle/workspace.ts`) select에 `users.avatar_updated_at` 추가 → `TeamMember`/`MentionCandidate` 타입에 반영. (`isSystemAccount=false` 필터 유지 — null 안전.)
- **`workspace.members[]`**: `hydrate`의 `rowToUser`가 채움(위 §4.2).
- **실시간(Centrifugo)**: 팀/1:1 라이브 payload(`useTeamChannel`의 `TeamLivePayload` 등)에 `authorAvatarUpdatedAt` 추가. optimistic **self** 메시지는 viewer 자신의 `avatarUpdatedAt`이 필요 → `TeamThreadView`/`ThreadView`에 viewer prop 전달(채팅 sender-account PR#181의 `viewer.name` 패턴과 동일).

### 4.6 설정 UI
**`UserAvatarForm`** (`components/settings/UserAvatarForm.tsx`) — `WorkspaceLogoForm` 복제:
- props: `userId`, `name`, `avatarUpdatedAt: string | null`.
- 파일 선택 → `POST /api/user/avatar` (워크스페이스와 달리 `[id]` 없음), 삭제 버튼(`avatarUpdatedAt != null`일 때만) → `DELETE /api/user/avatar`.
- `Avatar`(client, §4.4)로 현재 사진 미리보기. 업로드/삭제 로딩 상태, **`router.refresh()`** 후 서버 컴포넌트가 새 `avatar_updated_at`을 다시 읽어 → 새 `?v` → 즉시 새 이미지 반영(캐시 버스트 덕에 별도 로컬 미리보기 불필요). 토스트 문구 재사용("프로필 사진을 변경했어요." / "프로필 사진을 삭제했어요.").
- `settings/profile` 사용자 섹션(현재 read-only, line ~85~110) 상단에 배치. 기존 주석 `name/avatar editing is M9 surface` 갱신.

### 4.7 세션/레이아웃 주의
- `avatar_updated_at`을 **JWT/세션 토큰에 넣지 않는다**. JWT는 재로그인 전까지 stale → `?v`가 안 바뀌어 캐시 버스트가 깨진다. shell 레이아웃에서 DB로 라이브 로드(`getUserRepo().findById`)해 Header/Sidebar→UserMenu로 내린다.
- `app/(app)/layout.tsx`가 Header에 내리는 user shape는 현재 `{ name, email }`뿐 → `id`와 `avatarUpdatedAt` 추가 필요(Sidebar는 이미 `user.id` 보유). `AppSidebarLayout`/`Header`/`UserMenu` props 시그니처도 동기화.

## 5. 에러 처리
- 업로드: 클라이언트(폼)에서 MIME/크기 1차 검증 + 서버에서 재검증(권위). 서버 에러 코드(`FILE_TOO_LARGE`/`MIME_NOT_ALLOWED`/`MIME_MISMATCH`/`FILE_REQUIRED`/`EMPTY_FILE`/`INVALID_MULTIPART`)는 워크스페이스 라우트와 동일하게 토스트로 노출.
- 서빙: 사진 없으면 404 → `Avatar`가 이니셜 폴백(`avatarUpdatedAt=null`이면 애초에 `<img>` 안 그림). `<img>` 로드 실패 시 `onError`로 이니셜 폴백(레이스: 막 삭제된 경우). 미인증 GET은 401.
- ACL: POST/DELETE는 `session.user.id` 본인만. 임의 id를 받지 않으므로 타인 아바타 변경 불가.

## 6. 테스트 (TDD — RED→GREEN 필수)
참조 템플릿: `app/api/workspace/[id]/avatar/__tests__/route.test.ts`(라우트), `lib/server/repositories/drizzle/__tests__/workspace-logo.test.ts`(repo, PGlite).
- **repo**: `DrizzleUserAvatarRepository` find/exists/upsert(insert+update 경로)/remove — PGlite 실 DB, bytea round-trip(Buffer). `userRepo.setAvatarUpdatedAt` 토글(Date / null).
- **API POST** (`/api/user/avatar`): 미인증 401, sv stale 401, 이메일 미인증 403, 파일 없음 400, 빈 파일 400, 5MB 초과 413, 잘못된 MIME 415, MIME 미스매치 415, 성공 시 upsert + `avatar_updated_at` non-null.
- **API DELETE**: 인증 가드 + remove + `avatar_updated_at` null.
- **API GET** (`/api/user/[id]/avatar`): **미인증 401**, 존재 시 바이트+MIME+`Cache-Control: private, …, immutable` 헤더, 없으면 404.
- **Avatar 컴포넌트**: `userId+avatarUpdatedAt` → `<img>`(src에 `?v=` 포함) 렌더, 미충족 → 이니셜, `onError` → 이니셜 폴백.
- **read shape hydrate**: 1:1/팀 메시지 조회가 `authorAvatarUpdatedAt` 채움, `teamRoster`/members가 `avatarUpdatedAt` 채움, `rowToUser` 2곳 모두 반영(repo 테스트).
- **UserAvatarForm**: 파일 변경 시 `/api/user/avatar`로 POST, 삭제 버튼은 `avatarUpdatedAt != null`일 때만 노출.

## 7. 배포
- **DDL** (additive): `user_avatar_blobs` 테이블 생성 + `users.avatar_updated_at` 컬럼(nullable timestamptz) 추가. 공유 DB(localhost:5432) 드리프트 주의 → `drizzle-kit push` blind `--force` 금지, statement 리뷰 후. 운영은 PR body에 SQL 명시(워크스페이스 로고 배포 선례). 프로젝트는 push-only(마이그레이션 폴더 없음, snake_case casing — 새 스키마 파일 자동 감지).
- **백필 불필요**: 기존 사용자는 `avatar_updated_at = NULL`로 시작 → 이니셜 유지(동작 불변).
- 스토리지·env 변경 없음(바이트는 자사 Postgres bytea, repo 경유 — db-boundary allowlist 추가 불필요).

## 8. 미러링 원본 (참조 — 검증 완료 2026-06-21)
- `lib/db/schema/workspace-logo-blobs.ts`(bytea customType), `lib/db/schema/workspaces.ts`(`has_logo`→`avatar_updated_at`로 변형), `lib/db/schema/index.ts:21`(export)
- `app/api/workspace/[id]/avatar/route.ts`(GET/POST/DELETE, sniffMime, fail 헬퍼, 가드 순서)
- `lib/server/repositories/drizzle/workspace-logo.ts`, `factory.ts`(BUNDLE_VERSION·4지점), `types.ts`(`WorkspaceLogoRepo`, `setHasLogo`)
- `components/primitives/WorkspaceAvatar.tsx`(imgError 폴백), `components/primitives/Avatar.tsx`(대상)
- `components/settings/WorkspaceLogoForm.tsx`, `app/(app)/settings/profile/page.tsx:34,85-110,129`
- 채팅 sender-account 배선 선례: PR#181(`authorUserId`/`authorName` users 조인, viewer prop), `rfp-team-message.ts`의 `TEAM_MESSAGE_COLUMNS`, `teamThreadLoader.ts`, `workspace.teamRoster()`
