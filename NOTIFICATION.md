# 알림 시스템 설계 (Notification System Design)

**작성일**: 2026-05-05 (마지막 업데이트 2026-05-08)  
**상태**: M7 시점 구현 가동 — outbox(`lib/server/outbox/*`), Toaster shell, activity list (Drawer + bell), Resend 이메일, Vercel `after()` flush 모두 작동. 잔여 검증: `auth.verify`·`auth.reset` 핸들러 e2e 정합성, 중복 알림 dedup 회귀.

---

## Context

bidit는 buyer(구매사)와 PG(결제대행사) 간의 private 1:N RFP 플랫폼이다. 알림은 두 가지 채널로 동작한다: **이메일** (Resend + react-email)과 **인앱** (bell 아이콘 + Notification Drawer). 실시간 인앱 알림은 SSE(Server-Sent Events)로 구현한다. v0에서는 SMS/Slack/KakaoWork는 지원하지 않는다.

아키텍처는 **중앙 NotificationService + outbox-backed dispatch** 방식: Server Action 내에서 도메인 상태 전이와 `outbox_event` 기록을 같은 트랜잭션으로 커밋하고, dispatcher가 DB 저장 → 이메일 발송 → SSE 브로드캐스트를 처리한다. 이메일 실패는 콘솔 로그로 끝내지 않고 retry 가능한 상태로 남긴다.

---

## 설계 결정 요약

| 항목 | 결정 |
|---|---|
| 이메일 발송 | Resend + react-email |
| 인앱 실시간 | SSE (Next.js Route Handler) |
| 데이터 저장 | DB `notifications` 테이블 |
| 아키텍처 | NotificationService 중앙 모듈 + outbox_event 기반 재시도 |
| v0 제외 | SMS, Slack, KakaoWork, push, digest, 결재 탭 |

---

## 데이터 모델

### `Notification` 타입 (`lib/types/notification.ts`)

채널은 단일 — 한 row가 in-app 또는 email 하나만 담는다. 같은 이벤트가 두 채널로 가야 할 때는 row를 2개 만든다.

```ts
export type NotificationChannel = 'email' | 'inapp';
// DB enum 표기는 'in_app' (드라이버 변환). UI 코드는 'inapp' 그대로 사용.
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'read';
// DB enum은 'queued|sent|failed|read'. 신규 row가 'pending'으로 들어와
// 즉시 'sent'로 전이되는 인앱 경로가 일반적.

export type Notification = {
  id: string;
  userId: string;             // 수신자 (notNull)
  workspaceId: string;        // 수신자 워크스페이스 (notNull, 권한 라우팅용)
  type: string;               // 'bid.submitted', 'rfp.awarded', 'rfp.rejected' 등
  title: string;
  body: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  linkUrl?: string;           // 예: '/rfp/P-2604-0001', '/inbox/P-2604-0001'
  createdAt: string;
  sentAt?: string;
  readAt?: string;
};
```

### DB 스키마 (`lib/db/schema/notifications.ts`)

```sql
CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  channel       notification_channel NOT NULL,  -- enum: email | in_app
  status        notification_status  NOT NULL DEFAULT 'queued',
                                                -- enum: queued | sent | failed | read
  link_url      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ,
  read_at       TIMESTAMPTZ
);

CREATE INDEX notifications_user_created_idx
  ON notifications(user_id, created_at DESC);
```

미가입자(PG 초대) 알림은 `notifications` 테이블에 들어가지 않는다 — `userId` notNull이라 row를 만들 수 없다. 이메일만 보내야 하는 경우는 `outbox_entries`에 직접 enqueue한다 (`workspace.invited`, `rfp.invited`의 초대 단계 등).

### `outbox_entries` 테이블 (`lib/db/schema/outbox-entries.ts`)

이메일 큐. 렌더된 HTML을 직접 저장 — JSONB payload + dispatcher가 템플릿 lookup 하는 옛 모델 대신, 액션 안에서 react-email로 렌더한 후 row에 넣는다.

```sql
CREATE TABLE outbox_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event         outbox_event NOT NULL,  -- enum (아래)
  to_addr       TEXT NOT NULL,
  subject       TEXT NOT NULL,
  html          TEXT NOT NULL,
  dedupe_key    TEXT,                   -- 동일 이벤트 중복 enqueue collapse
  status        outbox_status NOT NULL DEFAULT 'pending',
                                        -- enum: pending | sent | failed
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 5,
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ,
  last_error    TEXT
);

CREATE UNIQUE INDEX outbox_dedupe_key_unique
  ON outbox_entries(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
```

`outbox_event` enum (`lib/db/schema/_enums.ts`):

```
auth.verify | auth.reset | auth.email-change
rfp.invited | rfp.sent | bid.submitted | rfp.awarded
workspace.invited
```

`dedupe_key` 규칙 (액션별 — 동일 사건 재실행 시 row 1개로 collapse):

| 이벤트 | dedupe_key 패턴 | 발행 위치 |
|---|---|---|
| `rfp.sent` | `rfp:{rfpId}:sent` | `createRfpAction` |
| `rfp.invited` | `rfp:{rfpId}:invite:ws:{pgWsId}:user:{adminUserId}` | `createRfpAction`, `sendDraftInvitationsAction` |
| `bid.submitted` | `bid:{rfpId}:{pgWsId}:{userId}` | `submitBidAction` |
| `rfp.awarded` | `rfp:{rfpId}:awarded:{email}` | `awardRfpAction` |
| `auth.verify` / `auth.reset` / `auth.email-change` | 토큰 hash 기반 | `signupEmailAction`, `requestPasswordResetAction` 등 |
| `workspace.invited` | `ws:{workspaceId}:invite:{email}` | `inviteWorkspaceMemberAction` |

**설계 근거**
- 단일 채널 row + dedupe_key collapse: 메시지 큐 일반화 대신 이메일 발송에 맞춘 단순화. dispatcher가 템플릿 lookup 하지 않아도 됨.
- 미가입자 알림은 outbox만 사용: `notifications.user_id`가 FK·notNull이라 익명 수신자 표현 불가. 초대 이메일은 outbox 직접 enqueue.
- `notifications`는 인앱 채널 진실, `outbox_entries`는 이메일 채널 진실 — 두 테이블이 같은 이벤트에 대해 별도 row를 가진다 (`emitAfterCommit`은 인앱, `flushAfterCommit`은 이메일).
- 인증류는 인앱 알림 없이 outbox 이메일만 (가입 funnel 단계라 인앱 SSE 연결 없음).

---

## 모듈 구조

```
lib/server/
├─ notifications/
│  ├─ bus.ts                       # 인앱 SSE EventEmitter
│  └─ dispatch.ts                  # dispatchNotification(tx, n), emitAfterCommit(n[])
└─ outbox/
   ├─ types.ts                     # OutboxEntry 타입
   ├─ post-commit.ts               # flushAfterCommit() — Next after() 기반
   └─ templates/                   # react-email 컴포넌트 (액션 안에서 직접 렌더)
      ├─ authVerify.tsx
      ├─ authReset.tsx
      ├─ authEmailChange.tsx
      ├─ rfpInvited.tsx
      ├─ rfpSent.tsx
      ├─ bidSubmitted.tsx
      ├─ rfpAwarded.tsx
      └─ workspaceInvited.tsx

lib/server/repositories/
├─ types.ts                        # NotificationRepo / OutboxRepo 인터페이스
└─ drizzle/
   ├─ notification.ts              # save(notification, tx) 구현
   └─ outbox.ts                    # enqueue(input, tx) + flush(sender, batch) 구현
```

### 호출 패턴 (액션 안에서)

옛 `dispatch(input)` 진입점은 사라졌다. 액션이 트랜잭션 안에서 인앱 row insert + outbox row enqueue를 *직접* 수행하고, 트랜잭션 커밋 후에 SSE emit + 이메일 flush를 호출한다. 캐노니컬 예시 (`lib/server/actions/bid/submitBidAction.ts`):

```ts
import { dispatchNotification, emitAfterCommit }
  from '@/lib/server/notifications/dispatch';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { getOutboxRepo } from '@/lib/server/repositories/factory';
import { renderBidSubmitted } from '@/lib/server/outbox/templates/bidSubmitted';

const pendingEmits: Notification[] = [];

const result = await db.transaction(async (tx) => {
  // ... 도메인 mutation (예: bid insert)
  const outbox = await getOutboxRepo();
  const html = await renderBidSubmitted({ rfpId, rfpTitle, pgName, submittedAt });

  for (const m of buyerMembers) {
    const notif: Notification = {
      id: randomUUID(), userId: m.userId, workspaceId: buyerWsId,
      type: 'bid.submitted',
      title: `[${rfpId}] ${pgName} 제안 도착`,
      body: `${pgName}가 제안을 제출했습니다.`,
      channel: 'inapp', status: 'pending',
      linkUrl: `/rfp/${rfpId}`,
      createdAt: now.toISOString(),
    };
    await dispatchNotification(tx, notif);   // notifications row insert
    pendingEmits.push(notif);
    await outbox.enqueue({
      event: 'bid.submitted',
      to: m.email,
      subject: `[Supporter B · ${rfpId}] ${pgName} 제안 도착`,
      html,
      dedupeKey: `bid:${rfpId}:${pgWsId}:${m.userId}`,
    }, tx);
  }
  return { ok: true, bidId };
});

if (result.ok) {
  emitAfterCommit(pendingEmits);  // 인앱 SSE 브로드캐스트 (bus.ts)
  flushAfterCommit();             // 이메일 flush — Next after()로 응답 후 실행
}
```

### 두 단계 분리 이유 (`dispatch.ts` 문서주석)

- **트랜잭션 안**: `dispatchNotification(tx, n)`이 `notifications` row를 insert만 한다. SSE emit는 하지 않는다 — tx가 rollback 되면 row도 사라지는데 SSE만 떠나면 클라이언트가 "환영 row" 보러 갔다가 404 나는 정합 깨짐.
- **커밋 후**: `emitAfterCommit(pendingEmits)`가 inapp channel만 SSE emit. email channel notification은 outbox에서 따로 관리되므로 SSE는 인앱 화면 채널에만 의미가 있다.
- **이메일 flush**: `flushAfterCommit()`이 `next/server`의 `after()`로 응답 반환 이후 `getOutboxRepo().flush(sender, BATCH)`를 호출. 실패는 console + Sentry로 swallowing — 액션 결과에는 영향 X. Next 요청 scope 밖에서 호출되면(예: vitest) no-op.

Drizzle pglite/postgres-js에 commit hook이 없어서 caller가 이 분리를 책임진다. `tx throw → emit 미발생` 이라 rollback과 SSE가 정합.

---

## 이메일 채널 (Resend + react-email)

### `channels/email.ts`

실제 sender는 outbox row의 `html`을 직접 발송한다 — 템플릿 lookup도, metadata 변환도 없다. 액션이 렌더한 결과를 그대로 전송할 뿐이다.

```ts
// lib/integrations/resend.ts (개략)
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export function getResendSender(): OutboxSender {
  return async (entry: OutboxEntry) => {
    if (!process.env.RESEND_API_KEY) {
      // dev fallback — 콘솔에 한 줄 로깅 후 success로 처리
      console.log(`[email DEV] event=${entry.event} to=${entry.toAddr} ` +
        `subject=${entry.subject} dedupeKey=${entry.dedupeKey}`);
      return { ok: true };
    }
    const { error } = await resend.emails.send({
      from: 'Supporter B <noreply@supporter-b.store>',
      to: entry.toAddr,
      subject: entry.subject,
      html: entry.html,
    });
    if (error) return { ok: false, error: String(error) };
    return { ok: true };
  };
}
```

`flushAfterCommit`이 이 sender를 `outbox.flush(sender, BATCH)`에 주입하면 repo가 `status='pending' AND scheduled_at <= now()`인 row를 batch로 claim, sender 호출 후 결과에 따라 `sent` 또는 `attempts+1 / lastError`로 마킹한다.

### react-email 템플릿 원칙 (Korean Editorial Modernism)

- `font-family: 'Pretendard Variable', -apple-system, sans-serif`
- 배경: 흰색 (`#FFFFFF`), 텍스트: 먹 (`#0D0D0D`)
- 버튼: 채워진 색 없이 테두리 스타일, `[ 확인하기 ]` 형태
- RFP 번호/금액 등 수치: 모노스페이스 폰트 + `font-variant-numeric: tabular-nums`

---

## 인앱 채널 (SSE + Drawer UI)

### Route 구조

```
app/
└─ (app)/
   └─ api/
      └─ notifications/
         ├─ stream/route.ts   # GET — SSE 연결 (인증 필수)
         └─ route.ts          # GET 목록, PATCH 읽음 처리
```

### `channels/inapp.ts` — SSE 연결 관리

```ts
// 서버 메모리 내 SSE 연결 맵 (단일 인스턴스 환경 기준, v0)
const sseClients = new Map<string, ReadableStreamDefaultController>();

export function registerClient(userId: string, ctrl: ReadableStreamDefaultController): void
export function removeClient(userId: string): void
export function broadcast(userId: string, notification: Notification): void
// → controller.enqueue(`data: ${JSON.stringify(notification)}\n\n`)
```

> **Note**: 단일 Next.js 프로세스 기준 설계. 다중 인스턴스 배포 시 Redis Pub/Sub로 교체 필요.

### `stream/route.ts`

```ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      registerClient(session.userId, controller);
      heartbeat = setInterval(() => {
        controller.enqueue(': heartbeat\n\n');
      }, 25000);
      req.signal.addEventListener('abort', () => {
        if (heartbeat) clearInterval(heartbeat);
        removeClient(session.userId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
    },
  });
}
```

SSE route constraints:
- `dynamic = 'force-dynamic'` 로 정적 캐시/프리렌더 대상에서 제외한다.
- `runtime = 'nodejs'` 로 장기 연결과 서버 메모리 연결 맵을 명시한다.
- `Cache-Control: no-cache, no-transform` 으로 proxy buffering 가능성을 낮춘다.
- 25초 heartbeat를 보내 중간 프록시 idle timeout과 죽은 연결을 조기에 드러낸다.
- `abort` 이벤트에서 heartbeat와 연결 맵을 반드시 정리한다.

### Notification Drawer UI (`components/NotificationDrawer.tsx`)

```
┌─────────────────────────── w=420px ───────┐
│ 알림                                    ⚙ │
│ ─────────────────────────────────────── │
│ [ 모든 알림  3 ]  [ 발송·조회 ]           │
│ ─────────────────────────────────────── │
│ ● BID  서포터 B 페이가 입찰서를 제출했습니다 │
│        P-2605-0042 · 3분 전              │
│ ─────────────────────────────────────── │
│   RFP  요청서 내용이 수정되었습니다         │
│        P-2605-0041 · 1시간 전            │
│ ─────────────────────────────────────── │
│                                          │
│         새로운 알림이 없습니다.             │
│                                          │
└───────────────────────────────────────────┘
```

- 읽지 않은 알림: 왼쪽 `●` 마커, `font-weight: 600`
- 상대 시각: `Intl.RelativeTimeFormat('ko', { numeric: 'auto' })`
- 클릭: 해당 RFP 페이지로 이동 + `PATCH /api/notifications/:id` 읽음 처리
- 탭 v0 구현: `모든 알림` + `발송·조회`
- 탭 v0 제외: `결재 요청` (결재선 기능 도입 시 추가)
- 빈 상태: 텍스트 + 라인 SVG (stroke 1.4)

---

## 이벤트 → 알림 매핑

| 이벤트 | 트리거 위치 | 수신자 | 채널 | 이메일 제목 |
|---|---|---|---|---|
| outbox event | trigger action | 수신자 | 채널 | 이메일 제목 (이벤트 enum 값 = `type` 컬럼 값) |
|---|---|---|---|---|
| `rfp.sent` | `createRfpAction` | buyer admin | email | `[Supporter B · {rfpId}] 발송 완료` |
| `rfp.invited` | `createRfpAction`, `sendDraftInvitationsAction` | 초대된 각 PG ws의 admin들 | email | `[Supporter B · {rfpId}] 제안 요청 도착` |
| `bid.submitted` | `submitBidAction` | buyer ws 멤버 전원 | email + inapp(`type='bid.submitted'`) | `[Supporter B · {rfpId}] {pgName} 제안 도착` |
| `rfp.awarded` (winner) | `awardRfpAction` | 낙찰 PG ws 멤버 전원 | email + inapp(`type='rfp.awarded'`) | `[Supporter B · {rfpId}] 낙찰 결과` |
| `rfp.awarded` (loser → 인앱 only) | `awardRfpAction` | 비낙찰 PG ws 멤버 전원 | inapp(`type='rfp.rejected'`) | (이메일 없음 — advisor pin 6) |
| `auth.verify` | `signupEmailAction` | 가입 시도 이메일 | email | `[Supporter B] 이메일 인증 코드` |
| `auth.reset` | `requestPasswordResetAction` | 요청 이메일 | email | `[Supporter B] 비밀번호 재설정 링크` |
| `auth.email-change` | `requestEmailChangeAction` | 신규 이메일 | email | `[Supporter B] 이메일 변경 확인` |
| `workspace.invited` | `inviteWorkspaceMemberAction` | 초대 이메일 | email | `[Supporter B] 워크스페이스 초대` |

---

## 구현 순서 (Milestone 연계)

### M1.5 (Auth 플로우)와 함께
- `lib/server/outbox/` + `lib/server/notifications/` 모듈 골격 생성
- `auth.verify`, `auth.reset` 이벤트 + 이메일 템플릿 (`templates/authVerify.tsx`, `authReset.tsx`)
- Resend 연동 및 환경변수 설정 (`RESEND_API_KEY`) — 미설정 시 콘솔 fallback
- outbox 테이블/`flush(sender, batch)` 골격 + 실패 재시도 (attempts/maxAttempts) 테스트

### M3 (RFP 발송)
- `rfp.sent` (buyer 확인) + `rfp.invited` (초대된 PG ws admin들) 이벤트

### M4 (입찰)
- `bid.submitted` 이벤트 — buyer ws 멤버 전원에게 email + inapp
- SSE Route 구현 (`/api/notifications/stream`)
- Notification Drawer UI 컴포넌트

### M6 (수주 확정)
- `rfp.awarded` 이벤트 — winner 멤버에게 email + inapp(`type='rfp.awarded'`), loser 멤버에게는 inapp(`type='rfp.rejected'`)만

---

## 검증 방법

1. **이메일 발송**: Resend 대시보드에서 각 이벤트 이메일 수신 확인
2. **SSE 연결**: DevTools Network 탭 → `/api/notifications/stream` EventStream 확인
3. **인앱 Drawer**: 입찰 제출 시 bell 배지 숫자 증가 + Drawer 카드 표시
4. **읽음 처리**: 알림 클릭 후 `●` 마커 소멸 + DB `read_at` 업데이트 확인
5. **End-to-end**: PG_RFP_SPEC.md §6 시나리오 A (RFP 발송 → 입찰 → 수주 확정) 전 과정 알림 검증
6. **재시도**: Resend 실패 mock → outbox `failed/pending` 전이 → 재시도 성공 시 `sent` 확인
7. **SSE 안정성**: heartbeat 수신, 탭 종료 시 연결 정리, proxy buffering 없이 즉시 Drawer 반영 확인

---

## v0 이후 로드맵

- **Redis Pub/Sub**: 다중 인스턴스 배포 시 SSE 브로드캐스트 동기화
- **결재 요청 탭**: 결재선 기능 도입 시 Drawer 탭 추가
- **알림 설정 (⚙)**: 이벤트별 채널 구독 on/off
- **다이제스트**: 일별/주별 요약 이메일
