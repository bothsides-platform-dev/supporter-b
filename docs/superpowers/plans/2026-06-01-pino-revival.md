# pino 운영 로깅 살리기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 잠들어 있던 pino 운영 로거를 Lightsail/Axiom 환경에서 실제로 동작하게 만들고, 가치 있는 운영 시그널(이메일 전송, outbox 실패)을 흘려보낸다.

**Architecture:** `lib/observability/logger.ts`(pino)는 이미 Axiom transport 분기까지 구현·테스트 완료 — 모듈 자체는 수정하지 않는다. 작업은 (A) `AXIOM_*` env + Next 번들 외부화로 **전달을 활성화**, (B) 이메일 성공·지연 로그 추가, (C) `post-commit` 의 ad-hoc `console.error` 를 구조화 `logger.error` 로 일원화, (D) 로컬 프로덕션 빌드로 **Axiom 실제 도착 검증**. Sentry 가 이미 잡는 예외/비즈니스 이벤트는 재로깅하지 않는다(경계 유지).

**Tech Stack:** Next.js 16 (App Router), pino@10 + `@axiomhq/pino` transport, Vitest, PM2(`next start`).

**설계 문서:** `docs/superpowers/specs/2026-06-01-pino-revival-design.md`

**범위에서 제외 (의도적):**
- **NTS 조회 계측** — `NTS_SERVICE_KEY` 사용 seam 이 깔끔히 핀되지 않음. 별도 후속.
- **서버 로그인 실패 로그** — `loginAction.ts` 가 **의도적으로** 예상된 bad-creds 를 로깅 안 함("quota noise"). 여기 `auth.login_failed` 를 넣으면 그 결정을 되돌리는 꼴. 예상외 에러는 이미 Sentry(`captureActionError`)로 감. → 추가 안 함.
- **dev-fallback `console.log` (`[email DEV]`/`[admin-email DEV]`) 일원화** — dev 전용 경로(prod 가치 0)이고 `resend.test.ts:73`·`admin-email.test.ts:52,66` 단언을 깨므로 변경하지 않음.

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `.env.production.example` | prod env 템플릿 | `AXIOM_TOKEN`/`AXIOM_DATASET` 블록 추가 |
| `next.config.ts` | Next 빌드 설정 | `serverExternalPackages` 에 `@axiomhq/pino` 추가 |
| `lib/observability/logger.ts` | pino 로거 (수정 X, 주석만) | 상단 주석을 Lightsail/Axiom 현실로 정정 |
| `docs/DEPLOY_LIGHTSAIL.md` | 배포 런북 | `AXIOM_TOKEN`/`AXIOM_DATASET` 설명 한 줄 |
| `lib/integrations/resend.ts` | 트랜잭션 이메일 전송 | 성공 시 `logger.info('email.sent', …)` |
| `lib/integrations/__tests__/resend.test.ts` | resend 테스트 | logger mock + `email.sent` 테스트 |
| `lib/integrations/admin-email.ts` | 운영자 알림 메일 | 성공 시 `logger.info('admin_email.sent', …)` |
| `lib/integrations/__tests__/admin-email.test.ts` | admin-email 테스트 | logger mock + `admin_email.sent` 테스트 |
| `lib/server/outbox/post-commit.ts` | 커밋 후 outbox flush | `console.error` → `logger.error('outbox.post_commit_failed', …)` |
| `lib/server/outbox/__tests__/post-commit.test.ts` | post-commit 테스트 | 에러 경로 단언을 `logger.error` 로 교체 |

---

## Task 1: Axiom 전달 활성화 (config + docs)

> TDD 면제 (순수 설정/문서 — CLAUDE.md "TDD 면제" 의 config 파일·docs 항목). 빌드가 깨지지 않는지만 확인.

**Files:**
- Modify: `.env.production.example`
- Modify: `next.config.ts:8`
- Modify: `lib/observability/logger.ts:1-2`
- Modify: `docs/DEPLOY_LIGHTSAIL.md` (환경변수 절, "사용하는 것만" 줄 아래)

- [ ] **Step 1: `.env.production.example` 에 Axiom 블록 추가**

기존 Sentry 블록의 `SENTRY_AUTH_TOKEN=` 줄 다음(빈 줄 뒤, `# --- Channel.io` 앞)에 삽입:

```bash
# --- Axiom (operational/infra logs via pino, optional) ----------------------
# server-side pino(lib/observability/logger.ts)가 @axiomhq/pino transport로
# 운영 로그(server.start, email.sent, outbox.post_commit_failed 등)를 Axiom으로
# 직접 전송한다. 두 값이 모두 있어야 transport가 켜진다(없으면 stdout→`pm2 logs`).
AXIOM_TOKEN=
AXIOM_DATASET=
```

- [ ] **Step 2: `next.config.ts` 에서 `@axiomhq/pino` 외부화**

`next.config.ts:8` 을 수정:

```ts
// 변경 전
  serverExternalPackages: ["pino", "pino-pretty"],
// 변경 후
  serverExternalPackages: ["pino", "pino-pretty", "@axiomhq/pino"],
```

(런타임 `createRequire` 가 worker-thread 로드를 이미 처리하지만, transport target 을 명시적으로 외부화해 번들러가 손대지 않게 하는 보험.)

- [ ] **Step 3: `logger.ts` 상단 주석 정정**

`lib/observability/logger.ts:1-2` 의 두 줄을 교체:

```ts
// 변경 전
// Operational/infra logging (server start, DB calls, action traces) → stdout → Axiom via Vercel Log Drain.
// For product/business events (rfp.created, bid.submitted) use lib/observability/log.ts (Sentry Logs) instead.
// 변경 후
// Operational/infra logging (server start, email sends, outbox failures). When
// AXIOM_TOKEN+AXIOM_DATASET are set, pino ships directly to Axiom via the
// @axiomhq/pino transport (self-hosted Lightsail — no Vercel Log Drain); otherwise
// → stdout, captured by `pm2 logs bidit`.
// For product/business events (rfp.created, bid.submitted) use lib/observability/log.ts (Sentry Logs) instead.
```

- [ ] **Step 4: 배포 런북에 Axiom env 설명 추가**

`docs/DEPLOY_LIGHTSAIL.md` 환경변수 절에서 이 줄:

```markdown
- `RESEND_*`, `SENTRY_*`, `SOLAPI_*`, `AXIOM_*` 등 — 사용하는 것만
```

을 다음 두 줄로 교체:

```markdown
- `RESEND_*`, `SENTRY_*`, `SOLAPI_*` 등 — 사용하는 것만
- `AXIOM_TOKEN` / `AXIOM_DATASET` — 둘 다 설정하면 운영 로그(pino)가 Axiom으로 전송된다. 미설정 시 `pm2 logs bidit` 으로만 확인.
```

- [ ] **Step 5: 빌드가 깨지지 않는지 확인**

Run: `pnpm tsc --noEmit`
Expected: 에러 없음(또는 기존 wizard-test-globals 노이즈만 — 메모리 `typecheck-red-wizard-test-globals` 참조. 본 변경으로 인한 신규 에러 0).

- [ ] **Step 6: Commit**

```bash
git add .env.production.example next.config.ts lib/observability/logger.ts docs/DEPLOY_LIGHTSAIL.md
git commit -m "chore(observability): enable pino→Axiom delivery on Lightsail (env + bundle externalize + docs)"
```

---

## Task 2: 이메일 전송 성공·지연 로그 (`email.sent`)

**Files:**
- Modify: `lib/integrations/resend.ts`
- Test: `lib/integrations/__tests__/resend.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/integrations/__tests__/resend.test.ts` 상단의 `vi.mock('resend', …)` 블록 **다음**에 logger mock 을 추가하고, import 도 추가한다.

import 섹션(파일 상단 `import type { OutboxEntry }` 아래)에 추가:

```ts
import { logger } from '@/lib/observability/logger';
```

`vi.mock('resend', …)` 블록 아래에 추가:

```ts
vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
```

기존 `beforeEach` 안(`sendMock.mockReset();` 옆)에 추가:

```ts
  vi.mocked(logger.info).mockClear();
```

`describe('ResendSender', …)` 안, 기존 "calls Resend with from/to/subject/html on success" 테스트 **아래**에 새 테스트 추가:

```ts
  it('emits an email.sent operational log on success', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    sendMock.mockResolvedValue({ data: { id: 'msg_123' }, error: null });

    const { ResendSender, __resetResendClientForTest } = await import('../resend');
    __resetResendClientForTest();
    await ResendSender(makeEntry({ event: 'rfp.invited', to: 'pg@toss.im' }));

    expect(logger.info).toHaveBeenCalledWith(
      'email.sent',
      expect.objectContaining({
        event: 'rfp.invited',
        to: 'pg@toss.im',
        messageId: 'msg_123',
        durationMs: expect.any(Number),
      }),
    );
  });
```

- [ ] **Step 2: RED 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/integrations/__tests__/resend.test.ts`
Expected: FAIL — `email.sent` 테스트가 "logger.info … not called" 로 떨어짐 (나머지 기존 테스트는 통과).
(Node 20 PATH 프리픽스는 메모리 `node26-breaks-jsdom-localstorage` 참조. 여긴 jsdom 아니지만 일관 사용.)

- [ ] **Step 3: 최소 구현**

`lib/integrations/resend.ts` 의 import 섹션(상단)에 추가:

```ts
import { logger } from '@/lib/observability/logger';
```

`ResendSender` 의 `try` 블록을 다음과 같이 수정 (`t0` 추가 + 성공 직전 로그):

```ts
  try {
    const client = getClient(apiKey);
    const t0 = Date.now();
    const result = await client.emails.send({
      from: resolveFrom(),
      to: entry.to,
      subject: entry.subject,
      html: entry.html,
    });

    if ('error' in result && result.error) {
      const err = result.error as { name?: string; message?: string };
      const message = err.message ?? err.name ?? 'resend_unknown_error';
      Sentry.captureException(new Error(`Email send failed: ${message}`), {
        extra: {
          event: entry.event,
          to: entry.to,
          subject: entry.subject,
          dedupeKey: entry.dedupeKey ?? null,
        },
      });
      return { ok: false, error: message };
    }

    logger.info('email.sent', {
      event: entry.event,
      to: entry.to,
      messageId: (result as { data?: { id?: string } | null }).data?.id ?? null,
      durationMs: Date.now() - t0,
    });
    return { ok: true };
  } catch (e) {
    Sentry.captureException(e, {
      extra: {
        event: entry.event,
        to: entry.to,
        subject: entry.subject,
        dedupeKey: entry.dedupeKey ?? null,
      },
    });
    return { ok: false, error: (e as Error).message ?? 'resend_threw' };
  }
```

- [ ] **Step 4: GREEN 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/integrations/__tests__/resend.test.ts`
Expected: PASS — 전체 통과(신규 + 기존 dev-fallback/success/error 테스트 모두).

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/resend.ts lib/integrations/__tests__/resend.test.ts
git commit -m "feat(observability): log email.sent (event/to/messageId/durationMs) on Resend success"
```

---

## Task 3: 운영자 메일 성공 로그 (`admin_email.sent`)

**Files:**
- Modify: `lib/integrations/admin-email.ts`
- Test: `lib/integrations/__tests__/admin-email.test.ts`

> 프라이버시 일관성: admin-email 의 기존 Sentry extra 는 수신자 주소를 남기지 않고 `subject` 만 남긴다. 로그도 실주소 대신 `recipientCount` 만 남긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/integrations/__tests__/admin-email.test.ts` 상단 import 에 추가:

```ts
import { logger } from '@/lib/observability/logger';
```

`vi.mock('resend', …)` 블록 아래에 추가:

```ts
vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
```

기존 `beforeEach` 안(`sendMock.mockReset();` 옆)에 추가:

```ts
  vi.mocked(logger.info).mockClear();
```

`describe('sendAdminEmail', …)` 안, "sends via Resend with from/to/subject/html when fully configured" 테스트 **아래**에 추가:

```ts
  it('emits an admin_email.sent operational log on success (no recipient addresses)', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.ADMIN_NOTIFY_EMAIL = 'a@x.test, b@y.test';
    sendMock.mockResolvedValue({ data: { id: 'm1' }, error: null });

    const { sendAdminEmail } = await import('../admin-email');
    await sendAdminEmail({ subject: '새 심사 요청', html: '<p>hi</p>' });

    expect(logger.info).toHaveBeenCalledWith(
      'admin_email.sent',
      expect.objectContaining({
        subject: '새 심사 요청',
        recipientCount: 2,
        messageId: 'm1',
        durationMs: expect.any(Number),
      }),
    );
  });
```

- [ ] **Step 2: RED 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/integrations/__tests__/admin-email.test.ts`
Expected: FAIL — `admin_email.sent` 테스트가 "logger.info … not called" 로 떨어짐.

- [ ] **Step 3: 최소 구현**

`lib/integrations/admin-email.ts` import 섹션에 추가:

```ts
import { logger } from '@/lib/observability/logger';
```

`try` 블록을 수정 (`t0` 추가 + 성공 직전 로그):

```ts
  try {
    const client = new Resend(apiKey);
    const t0 = Date.now();
    const result = await client.emails.send({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: recipients,
      subject: args.subject,
      html: args.html,
    });

    if ('error' in result && result.error) {
      const err = result.error as { name?: string; message?: string };
      const message = err.message ?? err.name ?? 'resend_unknown_error';
      Sentry.captureException(new Error(`Admin email send failed: ${message}`), {
        extra: { context: 'admin-email', subject: args.subject },
      });
      return { ok: false, error: message };
    }

    logger.info('admin_email.sent', {
      subject: args.subject,
      recipientCount: recipients.length,
      messageId: (result as { data?: { id?: string } | null }).data?.id ?? null,
      durationMs: Date.now() - t0,
    });
    return { ok: true };
  } catch (e) {
    Sentry.captureException(e, {
      extra: { context: 'admin-email', subject: args.subject },
    });
    return { ok: false, error: (e as Error).message ?? 'resend_threw' };
  }
```

- [ ] **Step 4: GREEN 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/integrations/__tests__/admin-email.test.ts`
Expected: PASS — 전체 통과.

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/admin-email.ts lib/integrations/__tests__/admin-email.test.ts
git commit -m "feat(observability): log admin_email.sent (subject/recipientCount/durationMs) on success"
```

---

## Task 4: outbox post-commit 실패 로그 일원화 (`console.error` → `logger.error`)

**Files:**
- Modify: `lib/server/outbox/post-commit.ts:30`
- Test: `lib/server/outbox/__tests__/post-commit.test.ts` (기존 에러 경로 테스트 교체)

> Sentry.captureException 은 알림용으로 **유지**한다. 이 작업은 *추가 계측*이 아니라 이미 존재하는 bare `console.error` 한 줄을 구조화 + Axiom 전송되는 `logger.error` 로 **교체(일원화)** 하는 것.

- [ ] **Step 1: 실패하는 테스트로 전환**

`lib/server/outbox/__tests__/post-commit.test.ts` 상단 import 에 추가:

```ts
import { logger } from '@/lib/observability/logger';
```

기존 `vi.mock('@/lib/integrations/resend', …)` 블록 아래에 추가:

```ts
vi.mock('@/lib/observability/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
```

기존 `'swallows flush errors (logs only, does not propagate)'` 테스트 전체를 다음으로 교체:

```ts
  it('swallows flush errors and logs via logger.error (does not propagate)', async () => {
    flushMock.mockRejectedValue(new Error('db down'));
    const { flushAfterCommit } = await import('../post-commit');

    expect(() => flushAfterCommit()).not.toThrow();
    await new Promise((r) => setImmediate(r));

    expect(logger.error).toHaveBeenCalledWith(
      'outbox.post_commit_failed',
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });
```

기존 `beforeEach` 의 `flushMock.mockReset();` 옆에 추가:

```ts
  vi.mocked(logger.error).mockClear();
```

- [ ] **Step 2: RED 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/outbox/__tests__/post-commit.test.ts`
Expected: FAIL — `logger.error` 가 호출되지 않음(아직 `console.error` 사용 중).

- [ ] **Step 3: 최소 구현**

`lib/server/outbox/post-commit.ts` import 섹션(상단, `import * as Sentry` 아래)에 추가:

```ts
import { logger } from '@/lib/observability/logger';
```

`doFlush` 의 catch 블록에서 `console.error` 줄만 교체:

```ts
// 변경 전
  } catch (err) {
    console.error('post-commit flush failed', err);
    Sentry.captureException(err, { extra: { context: 'post-commit-flush' } });
  }
// 변경 후
  } catch (err) {
    logger.error('outbox.post_commit_failed', { err });
    Sentry.captureException(err, { extra: { context: 'post-commit-flush' } });
  }
```

- [ ] **Step 4: GREEN 확인**

Run: `PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/outbox/__tests__/post-commit.test.ts`
Expected: PASS — 두 테스트 모두 통과.

- [ ] **Step 5: Commit**

```bash
git add lib/server/outbox/post-commit.ts lib/server/outbox/__tests__/post-commit.test.ts
git commit -m "chore(observability): route post-commit flush failure through logger.error (Axiom), keep Sentry alert"
```

---

## Task 5: Axiom 전달 검증 — **합격 기준 (done의 정의)**

> 유닛 테스트는 pino 를 mock 하므로 "Axiom 에 줄이 도착"을 **증명하지 못한다**. `thread-stream` worker 가 `next start` 에서 정상 spawn·flush 하는지는 실제 프로덕션 빌드로만 확인된다. 이 태스크가 통과하지 않으면 작업은 done 이 아니다. (코드 변경 없음 — 수동 검증 절차.)

**Files:** 없음 (수동 절차)

- [ ] **Step 1: 전체 health 그린 확인**

Run:
```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test
pnpm lint
```
Expected: test 그린, lint 0 error. (tsc 의 기존 wizard-test-globals 노이즈는 본 변경과 무관 — 메모리 참조.)

- [ ] **Step 2: throwaway Axiom dataset + 토큰 준비**

Axiom 콘솔에서 일회용 dataset(예: `bidit-smoke`) 생성 + ingest 토큰 발급. (사용자 수행.)

- [ ] **Step 3: 프로덕션 빌드 + 실제 자격증명으로 기동**

Run (worktree 루트에서):
```bash
AXIOM_TOKEN='<발급한 토큰>' AXIOM_DATASET='bidit-smoke' NODE_ENV=production \
  pnpm build && \
AXIOM_TOKEN='<발급한 토큰>' AXIOM_DATASET='bidit-smoke' \
  pnpm start
```
Expected: 서버 기동 시 `instrumentation.ts` 의 `logger.info("server.start", …)` 가 1회 발생.

- [ ] **Step 4: Axiom UI 에서 도착 확인**

Axiom `bidit-smoke` dataset 스트림에서 `server.start` 이벤트(및 dev-fallback 이 아닌 실제 전송 시 `email.sent`) 줄이 도착했는지 **눈으로 확인**.
- 도착함 → transport·worker·네트워크 경로 전부 정상. 합격.
- 도착 안 함 → worker spawn 실패 또는 transport 미전송. `pm2`/터미널 stderr 에서 `thread-stream`/`@axiomhq/pino` 관련 에러 확인 후 디버깅(번들 외부화·node_modules 존재 여부 점검).

- [ ] **Step 5: 검증 결과를 PR 설명에 기록**

`server.start` 도착 스크린샷/요약을 PR 본문에 남겨, 그린 유닛 테스트가 아니라 실제 전달이 확인됐음을 명시.

---

## Self-Review

**1. Spec coverage (설계 §4 대비):**
- §4-A 설정·번들링 → Task 1 (env, next.config, logger.ts 주석, deploy doc) ✅
- §4-B 계측 → Task 2(`email.sent`), Task 3(`admin_email.sent`) ✅. 로그인/NTS seam 은 본 plan 상단 "범위에서 제외"에 근거와 함께 명시(설계가 "없으면 drop" 허용) ✅
- §4-C `console.*` 일원화 → Task 4(post-commit). dev-fallback 라인은 제외(근거 명시) ✅
- §4-D 전달 검증 → Task 5 ✅

**2. Placeholder scan:** 모든 step 에 실제 코드/명령/기대출력 포함. "TBD"/"적절히"/"비슷하게" 없음 ✅

**3. Type consistency:**
- 이벤트명 일관: `email.sent`, `admin_email.sent`, `outbox.post_commit_failed` — 각 Task 의 테스트 단언과 구현이 동일 문자열 ✅
- logger mock 형태 동일(`{ info, warn, error, debug }`) — 세 테스트 파일 전부 ✅
- `result.data?.id` 접근 형태 동일(`(result as { data?: { id?: string } | null }).data?.id ?? null`) — Task 2·3 일치 ✅
- 검증: Task 2·3 의 `email.sent`/`admin_email.sent` 는 prod 실제 전송 시에만 발생(dev-fallback/에러 경로엔 없음) — Task 5 Step 4 의 "dev-fallback 이 아닌 실제 전송 시" 문구와 정합 ✅
