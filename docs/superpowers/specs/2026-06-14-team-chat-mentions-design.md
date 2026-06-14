# 팀 채팅 `@` 멘션 — Design Spec

- 날짜: 2026-06-14
- 브랜치: `feat/team-chat-mentions`
- 범위: RFP별 **팀 채팅**(`rfp_team_messages`, 같은 워크스페이스 멤버 내부 스레드)에서 `@`로 팀원/전체 멘션
- 마이그레이션: **없음** (순수 코드 기능)

## 1. 목표 / 비목표

**목표**
- 팀 채팅 작성 중 `@` 입력 → 같은 워크스페이스 팀원 자동완성 드롭다운 → 멘션 삽입.
- `@전체`(= `@all`)로 팀원 전체 한 번에 멘션.
- 멘션된 사람에게 **전용 인앱 알림**(`team_chat.mention`) 발송.
- 메시지 렌더링 시 멘션을 **현재 이름으로 강조 표시**(본인 멘션은 더 강한 강조).

**비목표 (YAGNI)**
- 상대방(카운터파티) 채팅 멘션 — 팀 스레드 내부 한정.
- "내가 멘션된 메시지" 전용 인박스 필터 — 추후.
- 멘션 전용 **별도 이메일** — 기존 팀 다이제스트 이메일에 합류(변경 없음).
- 입력 중 실시간 칩(chip) 렌더 — textarea 유지, 전송 후 색상 강조.
- 멘션 저장용 별도 테이블 / 메시지 스키마 변경.

## 2. 확정 결정 (사용자 합의)

| 항목 | 결정 |
|---|---|
| 멘션 대상 | 개인 팀원 **+ `@전체`(`@all`)** |
| 알림 | 전용 **인앱** `team_chat.mention`. 별도 이메일 없음(기존 `team_chat.message` 다이제스트 유지) |
| 입력 방식 | 기존 `<textarea>` 유지 + 플로팅 드롭다운 (라이브러리 미사용 — react-mentions는 2023년 방치·React 19 미검증·한글 IME 버그) |
| 저장 | `body` 안 구조화 토큰 (별도 테이블/스키마 변경 없음) |

## 3. 검증된 사실 (코드 확인 완료)

- `notifications.type` = `text('type')` (enum 아님) → 새 타입 `team_chat.mention` **DDL 불필요**. (`lib/db/schema/notifications.ts:24`)
- 이메일 다이제스트는 기존 `outboxEventEnum`의 `'team_chat.message'` 재사용 → outbox enum 변경 없음. (`lib/db/schema/_enums.ts:74`)
- `rfp_team_messages.body`는 `text` → 토큰 저장에 스키마 변경 없음.
- 초성 검색 선례: `es-hangul`을 `lib/format.ts`, `components/shell/CommandPalette.tsx`, `components/settings/MembersPanel.tsx` 등에서 사용.
- 순수 cross-boundary 유틸 위치 관례: `lib/` 루트(`lib/format.ts`, `lib/utils/bid-compare.ts`).
- 멤버 로스터: `wsRepo.memberUserIds(workspaceId)` (system 계정 제외, `lib/server/repositories/drizzle/workspace.ts:218`), 이름은 `userRepo`로 해소.
- `TeamChatService` 생성자 = **9-arg** (db + 8 repos). 새 repo 추가 없음 → 생성자 시그니처 불변.

## 4. 토큰 형식 — `body`가 단일 진실 원천(SSOT)

- 개인: `<@{userId}>` (UUID). 예: `<@a1b2c3d4-...>`
- 전체: `<@all>`
- 멘션은 **별도 테이블 없이** `body` 토큰에서 팬아웃·렌더 모두 파생. 이름 변경에 강건, 메시지 테이블 DDL 불필요.
- 정규식: `/<@(all|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/g` (UUID v4 형식 + 리터럴 `all`).

## 5. 공유 순수 유틸 — `lib/team-mentions.ts`

`next-auth`/`server-only` import 없음 → 클라이언트(`TeamThreadView`)·서버(`TeamChatService`, 로더, 다이제스트) 양쪽 import 가능.

```ts
export const ALL_TOKEN = '<@all>';
export function serializeMention(userId: string): string;   // `<@${userId}>`

// 렌더용: 본문을 세그먼트 배열로 분해
export type MentionSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; userId: string }
  | { type: 'all' };
export function parseMentions(body: string): MentionSegment[];

// 서버 팬아웃용: 본문에서 멘션 대상 추출
export function extractMentions(body: string): { userIds: string[]; all: boolean };

// 미리보기/이메일/알림용: 토큰 → 평문(`@이름`/`@전체`)
export function mentionsToPlainText(
  body: string,
  nameById: Map<string, string> | Record<string, string>,
): string;  // unknown id → '@(알 수 없음)', <@all> → '@전체'
```

**TDD (RED 먼저)**: 빈 본문 / 텍스트만 / 단일 멘션 / 다중 멘션 / `@all` / 혼합 / unknown id / 텍스트 안 `<@...>` 유사문자열 비매칭 / round-trip(parse→평문).

## 6. 컴포저 — `TeamThreadView` (순수 코어 + UI)

순수 함수(별도 모듈, 예: `components/messages/mention-input.ts`):
- `detectMentionQuery(text, caret): { query: string; start: number } | null`
  - 커서 직전에서 `@` 토큰 탐색. `@` 앞은 문자열 시작 또는 공백, `@`~커서 사이 공백 없음. 매칭 시 `{query, start}`.
- `filterMembers(members, query): Member[]`
  - 이름 substring + **초성** 매칭(`es-hangul`). `@전체`는 항상 상단 고정(쿼리가 "전체"/"all"/빈 문자열의 초성 접두에 부합할 때).
- `applyMentionSelection(text, caret, picked): { text: string; caret: number }`
  - `@query` 구간을 선택 표시 텍스트(`@이름 ` 또는 `@전체 `)로 치환, 새 caret 반환.

**표시 ↔ 토큰 변환 전략 (Strategy A — 전송 시 해소)**
- textarea에는 평문 `@이름`/`@전체`만 표시. 컴포넌트가 선택분을 `{ display, token }` 목록으로 추적(`token` = `<@userId>` 또는 `<@all>`).
- **전송 시** 본문의 각 추적 `display`를 첫 미소비 occurrence부터 `token`으로 치환 → 최종 `body` 생성.
- **Fail-safe**: 추적된 `display`가 전송 시 본문에 없으면(사용자가 편집/삭제) 해당 멘션은 드롭 — 토큰 없음 = 알림 없음. 선택 없이 손으로 친 `@이름`은 일반 텍스트(멘션 아님).
- 한계(문서화): 동명이인 다중 멘션은 추적 순서 기준 매칭 — v1 수용.

**드롭다운 UX**
- `@` 입력 → 멤버 목록(본인 제외) + 상단 `@전체`. ↑/↓ 이동, Enter/Tab 선택, Esc 닫기. 클릭 선택.
- Linear 디자인: 6px radius, `outline-variant` 보더, elevation(팝오버), 펄스/스피너 금지.
- 후보 로스터 = 로더가 내려준 `teamMembers`(아래 §8). 한글 IME는 textarea 네이티브로 처리.

**TDD**: detectMentionQuery 경계(시작/공백/공백포함 비매칭), filterMembers 초성, applyMentionSelection 치환·caret, 컴포넌트(드롭다운 출현/선택삽입/Esc).

## 7. 렌더링 — 토큰 → 강조

- 메시지 본문: `parseMentions(body)` → 세그먼트. `mention` 세그먼트는 `nameById`로 현재 이름 해소해 강조 span, `all` → "@전체".
  - **본인 멘션**(`userId === viewerUserId`): 강한 강조(accent 배경). 그 외: subtle accent 텍스트.
  - 제거/unknown 멤버: 중립 fallback("@(알 수 없음)").
- 라이브 Centrifugo echo: 발행 이벤트가 이미 `body`(토큰 포함) 운반 → 클라가 동일 파싱. **realtime 변경 없음.**
- 토큰 평문 해소(`mentionsToPlainText`)를 추가 적용할 곳:
  - 인박스 미리보기(`listInboxForViewer` / team thread preview)
  - 이메일 다이제스트 본문(`flushTeamChatDigests` 재계산 지점)
  - 인앱 알림 preview(`team_chat.message` / `team_chat.mention` body)
  - → 어디서도 raw `<@uuid>`가 노출되지 않도록.

**TDD**: 본문 강조 렌더, 본인 멘션 강조 구분, `@전체` 렌더, unknown fallback, 미리보기/알림 평문화.

## 8. 로더 / 서비스 — 팀 로스터 노출

- `LoadTeamThreadResult`에 `teamMembers: { userId: string; name: string }[]` 추가(자동완성 후보 + 렌더 해소용; 본인 포함—렌더 해소 위해, 드롭다운에서만 본인 제외).
- `TeamChatService.listMessages`(또는 신규 `listTeamMembers`)가 로스터를 함께 반환 — 기존 `wsRepo.memberUserIds` + `userRepo` 사용(생성자 불변, additive 반환).
- 로더가 messages + teamMembers를 결과에 매핑.

**TDD**: 로더가 teamMembers 포함, system 계정 제외, 이름 해소.

## 9. 팬아웃 — `TeamChatService.sendMessage`

서버는 **최종 `body`에서 멘션 재도출**(클라 신뢰 안 함):
1. `extractMentions(body)` → `{ userIds, all }`.
2. `all`이면 멘션 대상 = 전체 멤버; 아니면 `userIds`.
3. 각 대상이 **실제 워크스페이스 멤버인지 검증** — 비멤버 토큰은 드롭(크로스팀 누출/알림 방지).
4. 작성자 제외.

알림 루프(멤버 중 작성자 제외):
- **멘션됨** → `team_chat.mention` 인앱 알림 생성. title 예: `"{작성자}님이 회원님을 언급했어요"`, body = preview(평문화), linkUrl = `/messages?t={rfpId}`.
  - 멘션 전용 dedupe(멤버+rfp+type, 3분 윈도)로 연타 스팸 방지. 타입이 달라 기존 `team_chat.message` dedupe와 충돌 없음.
- **멘션 안 됨** → 기존 `team_chat.message` 인앱 알림(현행 dedupe 그대로).
- 각 멤버는 인앱 알림 **정확히 1개**(해당 dedupe 적용).
- **이메일 outbox enqueue 변경 없음** — 전 멤버 대상 기존 enqueue 유지(다이제스트가 멘션 포함 커버). 멘션 전용 이메일 없음.

**보안 불변식**: 멘션 알림은 같은 워크스페이스 멤버에게만. 비멤버 UUID 토큰은 무시(알림/누출 0). sealed-bid 격리 불변(버이어팀↔PG팀 분리) 유지.

**TDD (서비스)**:
- `<@member>` → 그 멤버에게 `team_chat.mention`, 나머지엔 `team_chat.message`, 작성자 제외.
- 비멤버 `<@uuid>` → 알림 0, 누출 0.
- `@all` → 작성자 제외 전원 `team_chat.mention`.
- 이메일 outbox enqueue 현행과 동일(개수/dedupe 키 불변).
- 멘션 dedupe: 같은 윈도 재멘션 시 중복 알림 억제.

## 10. 알림 타입 — DDL 없음

- `notifications.type`는 `text` → `team_chat.mention`는 새 문자열 리터럴일 뿐, ALTER 불필요.
- 알림 목록 UI가 타입별 분기/아이콘을 한다면 `team_chat.mention` 케이스 추가(없으면 일반 경로). 확인 후 처리.

## 11. 변경 파일 (예상)

신규:
- `lib/team-mentions.ts` (+ `__tests__`)
- `components/messages/mention-input.ts` (컴포저 순수 코어, + `__tests__`)
- 드롭다운 UI(컴포넌트 내부 or 작은 보조 컴포넌트)

수정:
- `components/messages/TeamThreadView.tsx` — 드롭다운, 멘션 추적, 전송 시 토큰화, 본문 강조 렌더
- `lib/server/services/team-chat.ts` — 멘션 팬아웃 분기, 로스터 반환
- `lib/server/actions/chat/teamThreadLoader.ts` — `teamMembers` 추가
- 인박스 미리보기 / 이메일 다이제스트 / 알림 preview 평문화 지점
- `lib/server/repositories/drizzle/notification.ts` — 멘션 dedupe 체크(또는 기존 체크 타입 파라미터화)
- 알림 목록 UI 타입 분기(필요 시)

테스트: 위 각 층 RED → GREEN.

## 12. 배포

- **마이그레이션 없음.** 순수 코드 머지.
- env 변경 없음. Centrifugo/outbox 변경 없음.

## 13. 미해결/추후

- 동명이인 다중 멘션의 토큰 매칭 한계(Strategy A) — v1 수용, 필요 시 추후 정교화.
- "내가 멘션된 메시지" 필터·읽음 강조 등 — 추후.
