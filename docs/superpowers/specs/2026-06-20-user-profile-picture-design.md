# 사용자(계정) 프로필 사진 업로드 — 설계

작성일: 2026-06-20
상태: 설계 승인 완료, 구현 계획 대기

## 1. 목표

개인 **사용자 계정**도 프로필 사진을 업로드·교체·삭제할 수 있게 한다. 현재 사용자 아바타는 이름 이니셜 + `avatar_color`만 렌더한다(`components/primitives/Avatar.tsx`). 워크스페이스 로고(PR#246, `workspace_logo_blobs`)가 이미 이미지 blob 업로드를 지원하므로 그 패턴을 사용자용으로 1:1 미러링한다.

업로드한 사진은 **앱 전체**(헤더·사이드바·채팅 메시지·멤버 목록·설정)에 노출한다. 서빙 라우트는 **공개 읽기**(인증 없음)다 — 워크스페이스 로고와 동일.

## 2. 스코프

### 포함
- 사용자 아바타 이미지 저장(DB bytea) + 서빙 + 업로드/삭제 API
- `Avatar` 컴포넌트에 이미지 렌더 + 이니셜 폴백 추가
- 모든 사용자-아바타 렌더 지점에 `userId`/`hasAvatar` 배선
- 설정 페이지(`settings/profile`)에 업로드 폼

### 제외 (YAGNI)
- 이름·`avatar_color` 편집 (요청은 사진만; 필요 시 별도 작업)
- 이미지 크롭/리사이즈 UI (원본 저장, 화면에서 `object-cover`)
- WebP/GIF/SVG 등 추가 포맷 (PNG/JPEG만 — SVG는 워크스페이스 로고와 동일한 XSS 사유로 의도적 제외)

## 3. 제약 (워크스페이스 로고와 동일)
- 최대 5MB
- MIME: `image/png`, `image/jpeg`만
- `sniffMime`(매직바이트) 검증으로 선언 MIME ↔ 실제 바이트 일치 확인
- 서빙 캐시: `Cache-Control: public, max-age=3600, s-maxage=3600`

## 4. 컴포넌트별 설계

### 4.1 DB 스키마
**새 테이블 `user_avatar_blobs`** (`lib/db/schema/user-avatar-blobs.ts`) — `workspace-logo-blobs.ts` 복제:
- `user_id` uuid PK, FK → `users.id` `ON DELETE CASCADE`
- `bytes` bytea NOT NULL (customType, 동일 정의)
- `mime` text NOT NULL
- `updated_at` timestamptz NOT NULL default now()

**`users` 테이블에 `has_avatar` 추가** (`lib/db/schema/users.ts`):
- `has_avatar` boolean NOT NULL default false — 이니셜 vs 사진 분기를 위한 비정규화 플래그(워크스페이스 `has_logo` 패턴).
- 스키마 export barrel(`lib/db/schema/index.ts`)에 새 테이블 등록.

> **users→user_avatar_blobs 타입 사이클 주의**: `user-avatar-blobs.ts`가 `users`를 import하지만 `users.ts`는 새 테이블을 import하지 않으므로(단방향) 사이클 없음. `has_avatar`는 `users.ts`에 평범한 컬럼으로 추가.

### 4.2 리포지토리
**`DrizzleUserAvatarRepository`** (`lib/server/repositories/drizzle/user-avatar.ts`) — `workspace-logo.ts` 복제:
- `find(userId, tx?)` → `{ bytes, mime } | undefined`
- `exists(userId, tx?)` → boolean
- `upsert(userId, bytes, mime, tx?)` (INSERT … ON CONFLICT DO UPDATE)
- `remove(userId, tx?)`

**`UserAvatarRepo` 인터페이스**를 `lib/server/repositories/types.ts`에 추가(`WorkspaceLogoRepo` 형태 그대로).

**factory 등록** (`lib/server/repositories/factory.ts`): import, `Repositories` 인터페이스 필드(`userAvatar`), 인스턴스화, `getUserAvatarRepo()` 접근자 — `workspaceLogo` 4개 지점 미러링.

**`UserRepo`에 `setHasAvatar(userId, hasAvatar, tx?)` 추가** (`types.ts` + `drizzle/user.ts`) — 워크스페이스의 `setHasLogo` 패턴. `users.has_avatar` 컬럼 갱신.

**`User` 타입 + `findById`가 `hasAvatar` 노출**: `User` read shape에 `hasAvatar: boolean` 추가, `findById`(및 사용자를 조회하는 다른 read 경로)가 `users.has_avatar`를 select해 채움.

### 4.3 API 라우트

**`app/api/user/avatar/route.ts`** — 본인 아바타 변경(세션 userId 사용, `[id]` 불필요):
- `POST`: 세션 + sv 검증(`isSessionRevoked`) + 이메일 인증(`isEmailUnverified`) → FormData `file` → 5MB·MIME·`sniffMime` 검증 → `userAvatar.upsert(userId, …)` → `userRepo.setHasAvatar(userId, true)`. 워크스페이스 POST 핸들러 복제(ACL만 "본인 = session.user.id"로 변경).
- `DELETE`: 세션 + sv + 이메일 인증 → `userAvatar.remove(userId)` → `setHasAvatar(userId, false)`.

**`app/api/user/[id]/avatar/route.ts`** — 공개 서빙:
- `GET`: `userAvatar.find(id)` → 바이트 + MIME 반환, 공개 캐시 헤더. 없으면 404. 워크스페이스 GET 핸들러 복제. 인증 없음.

> POST/DELETE를 서빙 GET과 **다른 파일**(`/api/user/avatar` vs `/api/user/[id]/avatar`)에 두는 이유: 쓰기는 본인(session)만, 읽기는 임의 `id` 공개. 한 파일에 섞으면 `id` 의미가 충돌.

### 4.4 Avatar 컴포넌트 (`components/primitives/Avatar.tsx`)
- `'use client'` 전환(현재 서버 컴포넌트) — `imgError` state 필요.
- props 추가: `userId?: string`, `hasAvatar?: boolean`.
- `hasAvatar && userId && !imgError` → `<img src={/api/user/{userId}/avatar} onError={…}>` (rounded-full, `object-cover`, 기존 `sizeMap` 크기 유지).
- 그 외 → 기존 이니셜 + `colorMap`/`sizeMap` 폴백 그대로.
- `WorkspaceAvatar`의 `imgError` 폴백 패턴 복제. `aria-label`/`alt`로 접근성 유지.

> Avatar를 client로 바꿀 때 **순수 서버 컴포넌트에서 import하던 곳이 깨지지 않는지** 확인(client 컴포넌트는 서버에서 렌더 가능하므로 일반적으로 안전, props 직렬화만 OK).

### 4.5 렌더 호출부 배선 (작업량의 핵심)
`Avatar`를 쓰는 7개 지점. 각자 `userId`+`hasAvatar`를 확보해 전달해야 한다:

| 호출부 | 파일 | userId 출처 | `hasAvatar` 배선 |
|---|---|---|---|
| 헤더 사용자 메뉴 | `components/shell/UserMenu.tsx` | 현재 세션 | shell 레이아웃이 현재 사용자 `hasAvatar`를 서버 fetch해 prop 전달(세션/JWT엔 없음) |
| 채팅(상대방) | `components/messages/ThreadView.tsx` | `m.authorUserId` | 메시지 read shape에 `authorHasAvatar` 추가, users 조인으로 hydrate |
| 채팅(팀) | `components/messages/TeamThreadView.tsx` | `m.authorUserId` | 팀 메시지 read shape에 `authorHasAvatar` 추가, hydrate |
| 멘션 드롭다운 | `components/messages/MentionDropdown.tsx` | 멤버 id | roster 멤버 항목에 `hasAvatar` 추가 |
| 멤버 행 | `components/settings/MemberRow.tsx` | 멤버 id | `workspace.members[]` 에 `hasAvatar` 추가 |
| 설정 프로필 | `app/(app)/settings/profile/page.tsx` | `me.id` | `me.hasAvatar`(§4.2) |
| 초대 페이지 | `app/(public)/invite/page.tsx` | 초대자 id | 초대 로더가 가지면 전달, 없으면 이니셜 유지(공개 페이지, 낮은 우선순위) |

**데이터 read shape 변경 (서버):**
- 채팅 메시지 read 타입(상대방·팀 둘 다)에 `authorHasAvatar: boolean` 추가 + 해당 repo 조회에 `users.has_avatar` 조인. `authorName`을 이미 users에서 hydrate하므로 같은 조인에 컬럼 하나 추가.
- `workspace.members[]`(`Workspace` read shape, `drizzle/workspace.ts`)의 각 멤버에 `hasAvatar` 추가 — members 조립 쿼리에 `users.has_avatar` 포함.
- 실시간 채팅(Centrifugo) optimistic/수신 메시지 경로도 `authorHasAvatar`를 전달하는지 확인(self 메시지는 viewer의 hasAvatar prop 필요 — 채팅 sender-account PR#181의 viewer.name 패턴과 동일).

### 4.6 설정 UI
**`UserAvatarForm`** (`components/settings/UserAvatarForm.tsx`) — `WorkspaceLogoForm` 복제:
- props: `userId`, `name`, `hasAvatar`.
- 파일 선택 → `POST /api/user/avatar` (워크스페이스와 달리 `[id]` 없음), 삭제 버튼 → `DELETE /api/user/avatar`.
- `Avatar`(client, §4.4)로 현재 사진 미리보기. 업로드/삭제 로딩 상태, `router.refresh()`, 토스트 문구 그대로 재사용("프로필 사진을 변경했어요." 등).
- `settings/profile` 사용자 섹션(현재 read-only, line ~85~110) 상단에 배치. 기존 주석 `name/avatar editing is M9 surface` 갱신.

## 5. 에러 처리
- 업로드: 클라이언트(폼)에서 MIME/크기 1차 검증 + 서버에서 재검증(권위). 서버 에러 코드(`FILE_TOO_LARGE`/`MIME_NOT_ALLOWED`/`MIME_MISMATCH`/`FILE_REQUIRED` 등)는 워크스페이스 라우트와 동일하게 토스트로 노출.
- 서빙: 사진 없으면 404 → `Avatar`가 이니셜 폴백(`hasAvatar=false`면 애초에 `<img>` 안 그림). `<img>` 로드 실패 시 `onError`로 이니셜 폴백(레이스: 막 삭제된 경우).
- ACL: POST/DELETE는 session.user.id 본인만. 타인 아바타 변경 불가(임의 id를 받지 않음).

## 6. 테스트 (TDD — RED→GREEN 필수)
- **repo**: `DrizzleUserAvatarRepository` find/exists/upsert(insert+update 경로)/remove — PGlite 실 DB. `setHasAvatar` 토글.
- **API POST**: 미인증 401, sv stale 401, 이메일 미인증 403, 파일 없음 400, 5MB 초과 413, 잘못된 MIME 415, MIME 미스매치 415, 성공 시 upsert + has_avatar=true.
- **API DELETE**: 인증 가드 + remove + has_avatar=false.
- **API GET**: 존재 시 바이트+MIME+공개 캐시 헤더, 없으면 404.
- **Avatar 컴포넌트**: `hasAvatar+userId` → `<img src>` 렌더, 미충족 → 이니셜, `onError` → 이니셜 폴백.
- **read shape hydrate**: 메시지 조회가 `authorHasAvatar` 채움, members가 `hasAvatar` 채움(repo 테스트).
- **UserAvatarForm**: 파일 변경 시 올바른 엔드포인트 POST, 삭제 버튼은 hasAvatar일 때만.

## 7. 배포
- **DDL**: `user_avatar_blobs` 테이블 생성 + `users.has_avatar` 컬럼 추가 — additive. 공유 DB(localhost:5432) 드리프트 주의 → `drizzle-kit push` blind `--force` 금지, statement 리뷰 후. 운영은 PR body에 SQL 명시(워크스페이스 로고 배포 선례).
- **백필 불필요**: 기존 사용자는 `has_avatar=false`(default)로 시작 → 이니셜 유지.
- 스토리지·env 변경 없음(바이트는 자사 Postgres bytea).

## 8. 미러링 원본 (참조)
- `lib/db/schema/workspace-logo-blobs.ts`, `lib/db/schema/users.ts`(has_logo→has_avatar 패턴은 `workspaces.ts`)
- `app/api/workspace/[id]/avatar/route.ts`
- `lib/server/repositories/drizzle/workspace-logo.ts`, `factory.ts`(4 지점), `types.ts`(`WorkspaceLogoRepo`, `setHasLogo`)
- `components/primitives/WorkspaceAvatar.tsx`(imgError 폴백), `components/primitives/Avatar.tsx`(대상)
- `components/settings/WorkspaceLogoForm.tsx`, `app/(app)/settings/profile/page.tsx`
- 채팅 sender-account 배선 선례: PR#181(`authorUserId`/`authorName` users 조인, viewer prop)
