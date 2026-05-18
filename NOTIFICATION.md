# 알림 시스템 설계 (Notification System Design)

**작성일**: 2026-05-05 (마지막 업데이트 2026-05-08)  
**상태**: M7 시점 구현 가동 — outbox(`lib/server/outbox/*`), Toaster shell, activity list (Drawer + bell), Resend 이메일, Vercel `after()` flush 모두 작동. 잔여 검증: AUTH_EMAIL_VERIFY · AUTH_PASSWORD_RESET 핸들러 e2e 정합성, 중복 알림 dedup 회귀.

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

```ts
export type NotificationEvent =
  | 'RFP_SENT'
  | 'RFP_MODIFIED'
  | 'RFP_CANCELLED'
  | 'BID_SUBMITTED'
  | 'BID_WITHDRAWN'
  | 'AWARD_SELECTED'
  | 'AWARD_REJECTED'
  | 'AUTH_EMAIL_VERIFY'
  | 'AUTH_PASSWORD_RESET';

export type NotificationChannel = 'email' | 'inapp';

export type Notification = {
  id: string;
  recipientId: string | null;      // 미가입자(PG 초대) 시 null 가능
  recipientEmail: string;
  event: NotificationEvent;
  title: string;
  body: string;
  metadata: Record<string, unknown>; // rfpId, bidId, rfpNumber, pgName 등
  channels: NotificationChannel[];
  readAt: string | null;
  emailSentAt: string | null;
  emailMessageId: string | null;   // Resend message ID
  createdAt: string;
};
```

### DB 스키마

```sql
CREATE TABLE notifications (
  id               TEXT PRIMARY KEY,
  recipient_id     TEXT,              -- users.id (nullable: 미가입자)
  recipient_email  TEXT NOT NULL,
  event            TEXT NOT NULL,
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  metadata         JSONB NOT NULL DEFAULT '{}',
  channels         TEXT[] NOT NULL,
  read_at          TIMESTAMPTZ,
  email_sent_at    TIMESTAMPTZ,
  email_message_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX notifications_recipient_id_idx ON notifications(recipient_id);
CREATE INDEX notifications_created_at_idx   ON notifications(created_at DESC);
```

### `outbox_event` 타입

```ts
export type OutboxEvent = {
  id: string;
  type: 'notification.dispatch';
  payload: DispatchInput;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
  processedAt: string | null;
};
```

**설계 근거**
- `recipientEmail` 분리: PG 담당자가 아직 미가입인 RFP 초대 시나리오 대응
- `channels` 배열: 이벤트마다 이메일만/인앱만/둘 다 유연하게 지정
- `metadata JSONB`: 링크 생성, 이메일 템플릿 변수 주입에 사용
- `AUTH_*` 이벤트는 인앱 알림 없이 이메일만 (`channels: ['email']`)

---

## 모듈 구조

```
lib/
└─ notifications/
   ├─ service.ts           # dispatch() — 진입점
   ├─ outbox.ts            # enqueue(), claimPending(), markSent(), markFailed()
   ├─ dispatcher.ts        # pending outbox 처리 + 재시도
   ├─ events.ts            # 이벤트 → 채널·제목·본문 매핑 테이블
   ├─ channels/
   │  ├─ email.ts          # Resend 호출, react-email 렌더
   │  └─ inapp.ts          # DB INSERT + SSE broadcast
   └─ templates/           # react-email 컴포넌트
      ├─ rfp-sent.tsx
      ├─ rfp-modified.tsx
      ├─ rfp-cancelled.tsx
      ├─ bid-submitted.tsx
      ├─ bid-withdrawn.tsx
      ├─ award-selected.tsx
      ├─ award-rejected.tsx
      └─ auth-verify.tsx
```

### `service.ts` 인터페이스

```ts
export interface DispatchInput {
  event: NotificationEvent;
  recipientId?: string;
  recipientEmail: string;
  metadata: Record<string, unknown>;
}

export async function dispatch(input: DispatchInput): Promise<void>
```

`dispatch()` 내부 흐름:
1. 도메인 mutation 트랜잭션 안에서 `outbox_event(type='notification.dispatch')` row INSERT
2. dispatcher가 pending event를 claim하고 `events.ts`에서 `channels`, `titleFn(metadata)`, `bodyFn(metadata)` 조회
3. DB `notifications` 테이블에 row INSERT
4. `channels`에 `'email'` 포함 → `channels/email.ts` 호출
5. `channels`에 `'inapp'` 포함 → `channels/inapp.ts`가 SSE 연결 맵에서 해당 `recipientId` 조회 후 push
6. 성공 시 outbox `sent`, 실패 시 `attempts + 1`, `lastError`, exponential backoff 기반 `nextAttemptAt` 기록

RFP 초대(`RFP_SENT`)와 수주 통보(`AWARD_SELECTED`/`AWARD_REJECTED`)는 사용자가 다음 행동을 시작하는 접근 경로이므로 console-only 실패 처리를 금지한다.

### `events.ts` 매핑 테이블 구조

```ts
type EventConfig = {
  channels: NotificationChannel[];
  titleFn: (meta: Record<string, unknown>) => string;
  bodyFn:  (meta: Record<string, unknown>) => string;
};

export const EVENT_CONFIG: Record<NotificationEvent, EventConfig> = {
  RFP_SENT:            { channels: ['email'],          titleFn: ..., bodyFn: ... },
  RFP_MODIFIED:        { channels: ['email', 'inapp'], titleFn: ..., bodyFn: ... },
  RFP_CANCELLED:       { channels: ['email', 'inapp'], titleFn: ..., bodyFn: ... },
  BID_SUBMITTED:       { channels: ['email', 'inapp'], titleFn: ..., bodyFn: ... },
  BID_WITHDRAWN:       { channels: ['email', 'inapp'], titleFn: ..., bodyFn: ... },
  AWARD_SELECTED:      { channels: ['email', 'inapp'], titleFn: ..., bodyFn: ... },
  AWARD_REJECTED:      { channels: ['email', 'inapp'], titleFn: ..., bodyFn: ... },
  AUTH_EMAIL_VERIFY:   { channels: ['email'],          titleFn: ..., bodyFn: ... },
  AUTH_PASSWORD_RESET: { channels: ['email'],          titleFn: ..., bodyFn: ... },
};
```

---

## 이메일 채널 (Resend + react-email)

### `channels/email.ts`

```ts
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(notification: Notification): Promise<void> {
  const template = resolveTemplate(notification.event, notification.metadata);
  const { data, error } = await resend.emails.send({
    from: 'bidit <noreply@bidit.kr>',
    to: notification.recipientEmail,
    subject: notification.title,
    react: template,
  });
  if (data) {
    // DB: emailSentAt, emailMessageId 업데이트
  }
  if (error) throw error;
}
```

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
│ ● BID  토스페이먼츠가 입찰서를 제출했습니다  │
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
| `RFP_SENT` | RFP 발송 Action | 초대 PG 이메일 | email | `[bidit] {buyer}가 RFP를 보냈습니다` |
| `RFP_MODIFIED` | RFP 수정 Action | 참여 PG 담당자 전체 | email + inapp | `[bidit] RFP Q-{no} 내용이 변경되었습니다` |
| `RFP_CANCELLED` | RFP 취소 Action | 참여 PG 담당자 전체 | email + inapp | `[bidit] RFP Q-{no}이 취소되었습니다` |
| `BID_SUBMITTED` | 입찰 제출 Action | buyer | email + inapp | `[bidit] {pg}이 입찰서를 제출했습니다` |
| `BID_WITHDRAWN` | 입찰 철회 Action | buyer | email + inapp | `[bidit] {pg}이 입찰서를 철회했습니다` |
| `AWARD_SELECTED` | 수주 확정 Action | 선택된 PG | email + inapp | `[bidit] 수주가 확정되었습니다 — {rfpTitle}` |
| `AWARD_REJECTED` | 수주 확정 Action | 비선택 PG 전체 | email + inapp | `[bidit] 이번 RFP는 다른 PG가 선택되었습니다` |
| `AUTH_EMAIL_VERIFY` | 이메일 인증 Action | 가입 시도 이메일 | email | `[bidit] 이메일 인증 코드: {code}` |
| `AUTH_PASSWORD_RESET` | 비밀번호 재설정 Action | 요청 이메일 | email | `[bidit] 비밀번호 재설정 링크` |

---

## 구현 순서 (Milestone 연계)

### M1.5 (Auth 플로우)와 함께
- `lib/notifications/` 모듈 골격 생성
- `AUTH_EMAIL_VERIFY`, `AUTH_PASSWORD_RESET` 이벤트 + 이메일 템플릿
- Resend 연동 및 환경변수 설정 (`RESEND_API_KEY`)
- outbox 테이블/dispatcher 골격 + 실패 재시도 테스트

### M3 (RFP 발송)
- `RFP_SENT` 이벤트 — PG 초대 이메일
- `RFP_MODIFIED`, `RFP_CANCELLED` 이벤트

### M4 (입찰)
- `BID_SUBMITTED`, `BID_WITHDRAWN` 이벤트
- SSE Route 구현 (`stream/route.ts`)
- Notification Drawer UI 컴포넌트

### M6 (수주 확정)
- `AWARD_SELECTED`, `AWARD_REJECTED` 이벤트

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
