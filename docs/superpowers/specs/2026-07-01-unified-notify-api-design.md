# 통합 `notify()` 알림 API 설계

- **날짜**: 2026-07-01
- **브랜치**: `feat/unified-notify-api`
- **상태**: 설계 확정 (구현 대기)
- **DDL**: 없음 (스키마 변경 0, repo 메서드 2개 추가만)

## 배경 / 문제

인앱(inbox) 알림과 이메일 알림은 **이미 코드 레벨에서 분리된 두 경로**다.

- 인앱: `dispatchNotification(tx, n)` → `notifications` 테이블 insert. commit 후 `emitAfterCommit(notifs)` → SSE.
- 이메일: `outboxRepo.enqueue({...}, tx)` → `outbox_entries` 큐. cron/post-commit `flush()` → Resend 배치 발송.

중앙 진입점이 없어, 알림을 내보내는 서비스(rfp/bid/chat/team-chat)마다 이 **두 호출을 손으로 나란히 배치**한다. 채널 선택이 각 호출부에 흩어져 있고, 매번 `pendingEmits` 배열을 손수 스레딩하고 `emitAfterCommit`을 잊지 않아야 한다.

**목표**: "채널 명시 통합 API" — 흩어진 `dispatchNotification` + `outboxRepo.enqueue` 2-콜 패턴을 `notify(tx, { recipients, channels, ... })` 한 곳으로 모아, 호출부가 채널을 **명시적으로** 선택하게 한다.

## 핵심 결정 (확정)

1. **수신자 모델 = 통합 recipient 리스트.** `recipients: {userId, workspaceId, email}[]` 하나로 받고 `channels`로 분기. 향후 사용자별 알림 선호 게이팅 확장을 자연스럽게 연다.
2. **emit 생명주기 = 명시적 반환.** `notify()`가 생성한 in-app `Notification[]`을 반환 → 호출부가 `pendingEmits`에 모아 commit 후 `emitAfterCommit()`. 래퍼 없음, 현행 컨벤션 유지. (Drizzle pglite/postgres-js 드라이버에 commit hook이 없어 진짜 post-commit 콜백 등록은 불가하므로, 명시적 핸드오프가 정직한 형태다.)
3. **이메일 콘텐츠 = 호출부 렌더.** `subject`/`html`은 서비스가 렌더(`renderRfpAwarded()` 등)해서 넘김. notify()는 순수 채널 기계장치, 템플릿 지식 0.
4. **스코프 = 멤버십 기반 알림 전용.** userId+email을 둘 다 아는 워크스페이스 멤버 대상만. auth/invite 등 "비-유저 주소로 나가는 순수 트랜잭션 메일"은 notify() 밖에 남긴다.
5. **마이그레이션 = 한 번에 전부.** 대상 11곳을 한 PR에서 전환. 두 패턴 공존(half-migrated) 없음.

### FnF(fire-and-forget) 구분 근거

"알림"은 두 부분이고 FnF은 그중 하나만 맞다:

| 부분 | 성격 | FnF 가능? |
|---|---|---|
| ① 인앱 row insert + 이메일 outbox enqueue | 내구성 있는 DB 쓰기 | ❌ — tx 안 await 필수 |
| ② SSE `emit` | 휘발성 실시간 푸시 | ✅ — 이미 인메모리 EventEmitter, no-op-if-no-handler |

①을 FnF로 하면 (a) 원자성이 깨져 `award` 롤백 후에도 "선정됐어요" 알림/메일이 남고, (b) Next 서버액션에서 await 안 한 백그라운드 작업이 응답 반환 시 런타임에 의해 유실될 수 있다. 그래서 ①은 트랜잭션의 일부로 남기고, ②(emit)만 commit 이후 FnF로 실행한다. `dispatch.ts`의 insert(tx 안)↔emit(commit 후) 2단계 분리가 이 불변식을 이미 강제한다.

## 아키텍처

신규 `lib/server/notifications/notify.ts`. 기존 `dispatch.ts`(`dispatchNotification`/`emitAfterCommit`)·`bus.ts`(`emit`)는 그대로 두고, notify()가 그 위의 **팬아웃 계층**이 된다.

- notify()는 내부적으로 in-app 수신자마다 `dispatchNotification(tx, n)`(= `repo.save`)을, email 수신자마다 `outboxRepo.enqueue(...)`를 호출한다.
- repo 접근은 `dispatch.ts`와 동일하게 factory(`getNotificationRepo()`/`getOutboxRepo()`)로 얻는다 → repo-boundary 규칙 준수.
- 반환값이 in-app 알림뿐이므로 기존 `emitAfterCommit`(channel !== 'inapp' skip)이 **무수정 재사용**된다.

### 시그니처

```ts
export type NotifyChannel = 'inapp' | 'email';

export type NotifyRecipient = {
  userId: string;
  workspaceId: string | null;   // null = user-level 알림 (어느 ws에서 보든 노출)
  email: string;
};

export type NotifyEmail = {
  event: OutboxEvent;
  subject: string;
  html: string;                            // 호출부가 렌더
  dedupeKey?: (email: string) => string;   // 수신자별 파생, 생략 시 dedupe 없음
  scheduledAt?: Date;                      // digest 코얼레싱용 (team_chat)
};

export type NotifyInput = {
  recipients: NotifyRecipient[];
  channels: NotifyChannel[];               // 이 호출의 모든 수신자에 적용
  // in-app 콘텐츠 ('inapp' ∈ channels 일 때 사용)
  type: string;
  title: string;
  body: string;
  linkUrl?: string;
  // email 콘텐츠 ('email' ∈ channels 이면 필수)
  email?: NotifyEmail;
};

/** tx 안에서 호출. 생성한 in-app Notification[]을 반환 → 호출부가 emitAfterCommit. */
export async function notify(tx: Tx, input: NotifyInput): Promise<Notification[]>;
```

### 동작

각 recipient마다:

- **`'inapp' ∈ channels`** → `Notification { id: randomUUID(), userId, workspaceId, type, title, body, channel: 'inapp', status: 'pending', linkUrl, createdAt: now }` 생성 → `dispatchNotification(tx, n)` → 결과 배열에 수집.
- **`'email' ∈ channels`** → `input.email`이 반드시 있어야 함(없으면 에러) → `outboxRepo.enqueue({ event, to: recipient.email, subject, html, dedupeKey: email.dedupeKey?.(recipient.email), scheduledAt: email.scheduledAt }, tx)`.

**채널은 호출 단위**로 적용된다. 수신자별로 채널이 다른 흐름(chat)은 수신자별/그룹별로 notify()를 여러 번 부른다(아래 참조). `channels`가 빈 배열이거나 어떤 recipient에도 해당 채널이 없으면 no-op.

## 스코프 경계

| notify() 대상 (in) | notify() 밖 — 직접 `outboxRepo.enqueue` 유지 (out) |
|---|---|
| 멤버십 기반: userId+email을 둘 다 아는 워크스페이스 멤버 | `auth.verify` / `auth.reset` / `auth.email-change` — 비-유저·미인증·변경대상 주소 |
| award, bid.submit, requote, sendDraftInvitations, cancel, close, pgRequest 3종, chat, team_chat | `workspace.invited` / `workspace.approved` / `workspace.rejected` — 아직 멤버가 아닐 수 있음 |

이유: 아웃박스는 `user_id` FK가 없는 순수 딜리버리 큐다. auth/invite 흐름은 아직 유저가 아니거나(`workspace.invited`), 유저의 등록 주소와 다른 새 주소로 나가야 한다(`auth.email-change` → `newEmail`). 이런 흐름은 recipient의 `userId`가 존재하지 않거나 무의미하므로 통합 대상이 아니다.

## repo (신규 추가 불필요 — 기존 메서드 재사용)

> **정정(구현 중 확인):** 스펙 초안은 `members`/`membersBatch` 신규 추가를 가정했으나, 통합 recipient(`{userId, email}`) 조회는 **이미 존재하는** 메서드로 전부 충족된다. 신규 repo 메서드 0.

모두 `notifiableAccount`(`passwordHash != '!'`, 데모/시스템 계정 제외) 필터를 적용한다 — 마스터/운영자 이메일 누출 방지.

- `WorkspaceRepo.memberRecipients(wsId): {userId, email}[]` — 단일 ws 전체 멤버 (bid/chat/reject·createPgRequest/accept in-app)
- `WorkspaceRepo.adminRecipients(wsId): {userId, email}[]` — admin + approved (requote·accept·sendDraftInvitations·createRfp 이메일)
- `WorkspaceRepo.memberRecipientsBatch(wsIds): {workspaceId, userId, role, approvalStatus, email}[]` — 다중 ws(award/cancel/close), 앱 레이어에서 wsId 로 그룹핑

유일한 필터 변화: `award` 이메일이 `memberEmails`(isSystemAccount) → `memberRecipientsBatch`(notifiableAccount)로 통일됨. 실계정 대상 델타 0(위 "확정 델타" 참조).

## 호출부 마이그레이션 (11곳, 한 PR)

### 단순 흐름 — 수신자 전원 동일 채널

`bid.submit`, `requote`, `sendDraftInvitations`, `cancel`, `close`, `pgRequest`(create/accept/reject).

```ts
emits.push(...await notify(tx, {
  recipients,                                   // members()/membersBatch()에서
  channels: ['inapp', 'email'],                 // 또는 ['inapp'] (cancel/close/pgRequest 등)
  type, title, body, linkUrl,
  email: { event, subject, html, dedupeKey: (e) => `rfp:${rfpId}:<action>:${e}` },
}));
```

### award — 승자/패자 채널이 다름 → notify 2회

- **승자**: `channels: ['inapp', 'email']`, `email.dedupeKey = (e) => \`rfp:${rfpId}:awarded:${e}\``.
- **패자**: `channels: ['inapp']` (이메일 없음 — 현행 그대로), 기존 type/title/body 유지.

### chat — 수신자별 조건부 → 수신자별 notify 1회

인앱은 dedupe 윈도우(`hasPendingChatNotification`) 미충족 시에만, 이메일은 대화방 부재(`isUserPresentInConversation`) 시에만. **조건 판정 로직은 서비스에 그대로 남기고**, 그 결과를 채널 배열로 접어 recipient당 한 번 호출한다.

```ts
for (const m of recipients) {
  const ch: NotifyChannel[] = [];
  if (!(await hasPendingChatNotification(...))) ch.push('inapp');
  if (!(await isUserPresentInConversation(...))) ch.push('email');
  emits.push(...await notify(tx, {
    recipients: [m], channels: ch,
    type, title, body, linkUrl, email: { ... },
  }));
}
```

`ch`가 비면 notify no-op → 현행과 동일 결과.

### team_chat — 인앱은 chat과 동일, 이메일은 digest

이메일이 즉시 발송이 아니라 **코얼레싱 digest**다. digest 스케줄 계산(`scheduledAt`, dedupeKey 코얼레싱 윈도우)은 서비스가 유지하고, 계산 결과를 `email.scheduledAt`·`email.dedupeKey`로 notify에 넘긴다. notify는 enqueue 기계장치만 담당한다. (이 흐름이 유일하게 특수하다 — `email.scheduledAt`으로 충분히 흡수 가능하다고 보나, 구현 중 부적합이 드러나면 team_chat 이메일만 후속 PR로 분리한다.)

## 에러 처리 / 원자성

notify()의 두 쓰기 모두 tx 안 `await` → 비즈니스 트랜잭션과 원자적으로 커밋/롤백된다. enqueue 실패 시 tx가 throw → 인앱 row·비즈니스 변경 전부 롤백되고 emit은 발생하지 않는다(`emitAfterCommit`은 `if (r.ok)` 뒤에서만 호출). 현행 불변식과 동일.

`'email' ∈ channels`인데 `input.email`이 없으면 개발 실수이므로 즉시 throw(fail-fast).

## 테스트 (TDD — RED → GREEN)

1. **notify() 단위** (PGlite 실 DB):
   - 채널 조합별로 올바른 side-effect: `['inapp']` → notifications row만, `['email']` → outbox 엔트리만, `['inapp','email']` → 둘 다, `[]` → 아무것도 안 함.
   - 다중 recipient 팬아웃: N명 → N개 row / N개 outbox 엔트리, 각 `to`·`dedupeKey` 정확.
   - `dedupeKey` 파생: `email.dedupeKey?.(recipient.email)`이 recipient별로 적용됨.
   - 반환값 = in-app 알림만(email 채널 recipient는 반환에 없음).
   - `'email'` 채널인데 `email` 미제공 → throw.
2. **repo 단위** — 신규 메서드 없음(기존 `memberRecipients`/`adminRecipients`/`memberRecipientsBatch` 재사용). 이들의 `notifiableAccount` 필터·빈 ws 처리는 기존 workspace repo 테스트가 이미 커버.
3. **behavior-preservation (핵심 게이트)**:
   - 마이그레이션 전후 각 서비스 흐름이 **동일한 notifications row + outbox 엔트리**를 생성하는지. 기존 서비스 테스트 그린 유지가 1차 게이트.
   - 명시 케이스: award 승/패 채널 분기, chat 조건부(dedupe/presence 4가지 조합), team_chat digest `scheduledAt`.

## 비목표 (YAGNI)

- **사용자별 알림 선호 설정** — 이번 범위 아님. 통합 recipient 모델이 나중에 이를 붙일 자리를 열어두지만, 지금은 채널 결정이 서비스에 하드코딩된 채로 둔다.
- **auth/invite 이메일의 notify() 편입** — 스코프 경계상 제외.
- **commit-hook 기반 자동 emit 래퍼** — 드라이버 미지원 + 명시적 `emitAfterCommit`으로 충분.

## 영향 범위 요약

- 신규: `lib/server/notifications/notify.ts` + 단위 테스트.
- 수정: `lib/server/services/{rfp,bid,chat,team-chat}.ts` **12개 흐름**(구현 중 확인: 초안의 11개 + `createRfp` send-path 1개). 마이그레이션으로 각 서비스의 마지막 `outboxRepo`(rfp/bid/chat/team-chat) 사용처가 사라져 해당 서비스 생성자에서 미사용 `outboxRepo` param 제거 + 생성 사이트(factory·`_setup.ts`·테스트) 동기화 수반.
- 불변: `dispatch.ts`·`bus.ts`·`emitAfterCommit`·outbox flush·스키마(DDL 0), repo 메서드(신규 0). 범위 밖 유지: `auth.*`·`workspace.*` 이메일, `_workspaceInviteNotify.ts` 인앱.
