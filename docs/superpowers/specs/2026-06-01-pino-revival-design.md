# pino 운영 로깅 살리기 — 설계

- 날짜: 2026-06-01
- 상태: 설계 승인 대기
- 범위: 작음 (설정 + 소수 호출부 + 전달 검증). 신규 서브시스템 아님.

## 1. 배경 / 문제

`lib/observability/logger.ts`(pino)는 멀쩡히 배선돼 있고 Axiom transport 분기까지
유닛테스트가 끝나 있지만, **프로덕션 호출부가 `instrumentation.ts`의 `server.start`
단 한 줄**이고 `.env.production.example`에 `AXIOM_*`이 **아예 없어** prod에서
transport가 켜질 수조차 없다. 즉 pino는 "Vercel → Axiom 로그 드레인" 시절 설계의
잔재로, Lightsail 이전 + Sentry Logs 도입 이후 사실상 잠들어 있다.

옵저버빌리티 경계(코드 주석에 이미 정의됨):
- **pino(`logger.ts`)** = 운영/인프라 시그널 (서버 부팅, 외부 연동 성공·지연, 운영 에러)
- **Sentry Logs(`log.ts`)** = 비즈니스 이벤트 (`rfp.created`, `bid.submitted`)
- **`Sentry.captureException`** = 예외/알림 (28개 파일)

## 2. 확정 결정 (브레인스토밍)

| 항목 | 결정 |
|---|---|
| 전달 메커니즘 | **Axiom 직결** — 계정/데이터셋 이미 있음. `AXIOM_TOKEN`/`AXIOM_DATASET` 주입만 |
| 계측 범위 | **curated seam** — 프로덕션 디버깅에 실제 필요한 인프라 심만 |
| 검증 경로 | **로컬 프로덕션 빌드** — `next build && next start` + 실제 AXIOM 자격증명(throwaway dataset) |

## 3. Non-goals

- `logger.ts` 모듈 자체 변경 (이미 완성·테스트됨).
- 요청/액션 전체 트레이싱, DB repo 전수 계측 (YAGNI — 노이즈·비용).
- Sentry가 이미 잡는 예외의 재로깅.
- 외부 shipper(Vector/fluent-bit) 도입 — Axiom 직결이라 불필요.
- next-axiom(`withAxiom`) 활성화 — Vercel 드레인 전제라 이번 범위 밖(향후 별도 판단).

## 4. 설계

### A. 설정·번들링 (TDD 면제 — 순수 설정)
1. `.env.production.example`: Axiom 블록 추가
   ```
   # --- Axiom (operational/infra logs via pino) --------------------------
   # 설정 시 server-side pino 가 @axiomhq/pino transport 로 직접 전송.
   # 둘 다 있어야 transport 활성화(lib/observability/logger.ts). 미설정 시 stdout.
   AXIOM_TOKEN=
   AXIOM_DATASET=
   ```
2. `next.config.ts:8` `serverExternalPackages`에 `@axiomhq/pino` 추가 (싼 보험.
   런타임 `createRequire` 우회가 이미 worker-thread 로드를 처리하지만 명시적 외부화).
3. `lib/observability/logger.ts` 상단 주석 수정: "Vercel Log Drain" → "Axiom via
   @axiomhq/pino transport (self-hosted Lightsail; AXIOM_* gated)".
4. `docs/DEPLOY_LIGHTSAIL.md`: Axiom env 등록 + "운영 로그가 Axiom으로 간다" 한 줄.

### B. 계측 호출부 (curated)
경계 원칙: **이미 Sentry가 잡는 실패는 재로깅하지 않는다.** pino는 성공·지연·운영
시그널을 추가한다.

| seam | 파일 | 추가 로그 | 비고 |
|---|---|---|---|
| 이메일 전송 성공 | `lib/integrations/resend.ts` | `logger.info('email.sent', { event, to, durationMs })` | 실패는 이미 `Sentry.captureException`. 성공 경로 관측 0 → 추가 |
| 운영자 메일 성공 | `lib/integrations/admin-email.ts` | `logger.info('admin_email.sent', { subject, durationMs })` | 동상 |
| 서버 로그인 실패 | `lib/server/actions/auth/loginAction.ts` (또는 authorize) | `logger.warn('auth.login_failed', { reason })` | ⚠️ 클라 `login-attempts.ts`(localStorage)가 아니라 **서버 seam**. 정확한 위치는 plan에서 핀 |
| 부트 | `instrumentation.ts` | `server.start` (기존 유지) | 변경 없음 |
| NTS 조회 | (plan에서 핀) | 실패/지연 시 `logger.warn`/`info` | **서버 seam이 깔끔히 존재할 때만** 포함. 없으면 drop |

### C. 흩어진 `console.*` 일원화
서버측 ad-hoc 로그(총 5곳)를 pino로 라우팅:

| 위치 | 현재 | 변경 |
|---|---|---|
| `lib/server/outbox/post-commit.ts:30` | `console.error('post-commit flush failed', err)` | `logger.error('outbox.post_commit_failed', { err })` — Sentry.captureException은 알림용으로 유지 |
| `lib/integrations/resend.ts:52` | `console.log('[email DEV] …')` (RESEND_API_KEY 미설정 폴백) | `logger.info('email.dev_skipped', { event, to, subject, dedupeKey })` |
| `lib/integrations/admin-email.ts:33,42` | `console.log('[admin-email DEV] …')` ×2 | `logger.info('admin_email.dev_skipped', { subject, … })` |

주의: resend dev-fallback 의 `grep -rn "[DEV " lib/server` 회귀 게이트(0 hits)와의
상호작용 확인 — 라벨 변경이 게이트를 깨지 않는지 plan에서 점검.

### D. 전달 검증 — **합격 기준 (done의 정의)**
유닛테스트는 pino를 mock하므로 "Axiom에 줄이 도착"을 증명하지 못한다. 별도 절차:

1. throwaway Axiom dataset(예: `bidit-smoke`) + 토큰 발급.
2. `AXIOM_TOKEN=… AXIOM_DATASET=bidit-smoke` 환경으로 `pnpm build && pnpm start`
   (로컬, NODE_ENV=production).
3. 로그가 찍히는 경로를 트리거(서버 부팅만으로 `server.start` 1줄, 또는 dev-fallback
   이메일 1건).
4. **Axiom UI에서 해당 줄(`server.start` 등) 도착을 눈으로 확인.**
5. `thread-stream` worker가 `next start`에서 정상 spawn·flush 하는지까지 이 단계가 증명.

이 검증이 통과하지 않으면 done이 아니다 (그린 유닛테스트는 전달을 보장하지 않음).

## 5. 테스트 전략 (TDD)

- `logger.ts`: 변경 없음 → 기존 테스트 유지.
- 호출부: **실제 분기가 있는 곳만 테스트**한다. 예) resend의 "API key 없음 → dev_skipped
  로그 + ok:true" 같은 분기는 테스트(분기 동작 검증). 단순 "성공 시 logger.info 호출됨"
  류의 assert-log-was-called 테스트는 로그 문자열에 결합되는 저가치 테스트라 **만들지
  않는다**(TDD 스킬의 trivial/style 면제에 해당).
- 검증의 본체는 §4-D(수동 Axiom 도착 확인)이며 자동 테스트로 대체하지 않는다.

## 6. 리스크

- **worker-thread 미동작/무전송**: mock 아래 실패 모드. → §4-D가 유일한 방어.
- **Axiom 비용/노이즈**: curated 범위라 낮음. dev_skipped 로그는 prod에서 RESEND_API_KEY
  설정 시 발생 안 함.
- **`[DEV ` 회귀 게이트**: §4-C 라벨 변경이 grep 게이트와 충돌 가능 → plan에서 확인.
- **stale 주석**: post-commit.ts 등의 "Vercel lambda" 주석은 범위 밖(건드리지 않음).
  단 logger.ts 의 "Vercel Log Drain" 주석은 직접 관련이라 A-3에서 수정.
