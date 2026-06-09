# 견적 선정 완료 결과 화면 (Award Result Celebration)

- 날짜: 2026-06-09
- 상태: 설계 확정 (구현 전)
- 워크스페이스: buyer
- 관련 화면: B-시리즈 (`/rfp/[id]` 비교·선정)

## 1. 배경 · 문제

구매사가 견적 비교 화면(`FocusComparison`)에서 `선정하기`를 확정하면,
지금은 `AwardConfirmDialog`가 닫히고 `router.refresh()`가 호출돼
같은 비교 화면이 조용히 다시 그려질 뿐이다. 바뀌는 건 상단 상태 칩과
탭의 `선정 / 미선정` 칩뿐 — **완료의 순간도, 구매사가 얻은 혜택의 제시도 없다.**

목표: 선정 확정 직후 **전체 화면 결과 화면**으로 전환해
(1) 견적 요청이 끝났다는 종결감을 직관적으로 느끼게 하고,
(2) 구매사가 이 선정으로 얻은 혜택을 보조적으로 제시하며,
(3) "끝"이 아니라 "선정한 PG와의 다음 단계(메시지)"로 자연스럽게 잇는다.

## 2. 확정된 결정 (브레인스토밍 결과)

| 항목 | 결정 |
|---|---|
| 피드백 형태 | **전체 화면 결과 화면** (일시적 클라이언트 오버레이) |
| 히어로(주인공) | **선정한 PG · 완료 사실** ("{PG명}를 선정했어요") |
| 혜택 표시 | 보조. 기존 `ImprovementSummary` 델타 재사용, 데이터 없으면 사실만 |
| 톤 | **적극적 축하 — Linear 하드룰의 승인된 예외** (이 화면에 한정) |
| 주 CTA | **선정한 PG와 메시지 시작** → `/messages?c=<id>` (빈 대화 + 작성란) |
| 보조 CTA | 견적 목록으로 (`/rfp`) |

## 3. 접근 방식 — 일시적 클라이언트 오버레이 (A안)

`awardRfpAction` 성공 콜백에서 기존 `router.refresh()` 대신
화면 전체를 덮는 `<AwardResult>` 오버레이를 렌더한다.

선정된 bid와 `rfp.current`(현재 조건)는 이미 `FocusComparison`이
props로 보유하고 있어 **추가 fetch·새 라우트가 필요 없다.**

### 왜 전용 라우트(B안)가 아닌가
- 축하는 **선정 직후 딱 1회만** 발화해야 한다. 전용 라우트는 매 방문마다
  발화되지 않도록 "1회성 가드"가 필요하고, 로더·refetch가 추가된다.
- 재방문 시에는 일반 "선정 완료" 비교 화면(칩)만 보이는 게 옳다 —
  축하는 그 순간의 것.

### 1회성 보장
오버레이는 **award 성공 콜백에서 set되는 클라이언트 상태**로만 표시된다.
이미 선정된 RFP를 처음 열 때(`rfpStatus === 'awarded'`)는 오버레이를
띄우지 않는다. 이것이 "1회성"의 핵심 불변식이며 테스트로 고정한다.

## 4. 화면 구성

```
┌──────────────────────────────────────┐
│            (컨페티 버스트)             │
│                                      │
│              ✓  (체크마크)            │   ← 히어로
│         토스페이먼츠를 선정했어요        │
│         견적 요청이 마무리됐어요          │
│                                      │
│   ── 이 조건으로 함께하게 됐어요 ──      │   ← 보조: 혜택 요약
│   수수료    2.5% → 2.1%    ↓0.4%p     │     (ImprovementSummary 재사용)
│   정산주기   D+2 → D+1     더 빠름     │
│   정산한도   +5,000만원    ↑          │
│   보증보험   1만 → 0원     ↓          │
│                                      │
│   [ 토스페이먼츠와 메시지 시작 → ]      │   ← 주 CTA
│   [ 견적 목록으로 ]                    │   ← 보조 CTA
└──────────────────────────────────────┘
```

- **히어로**: "{PG명}를 선정했어요" + "견적 요청이 마무리됐어요". 완료 사실이 주인공.
  PG명은 선정된 bid의 워크스페이스명에서 온다.
- **혜택 요약**: 기존 `ImprovementSummary`의 델타 계산 로직을 재사용
  (수수료 ↓, 정산주기 quality, 정산한도 ↑, 보증보험 ↓).
  - **현재 조건(`rfp.currentFeeRate` 등)이 비어 있으면** 화살표·델타 없이
    선정한 조건을 사실로만 표기("이 조건으로 함께해요"). 데이터 의존 없이 항상 성립.
- **주 CTA `{PG명}와 메시지 시작 →`**: §6 흐름으로 `/messages?c=<id>` 이동.
- **보조 CTA `견적 목록으로`**: `/rfp`.

UX 문구는 `UX_WRITING.md`(해요체·능동형·긍정형) 및 도메인 용어집('견적'·'선정') 준수.

## 5. 모션 — 축하 모먼트 (승인된 예외)

선정 직후 **1회**, `prefers-reduced-motion`이면 전부 정적 폴백.

- **체크마크**: stroke draw-in (`motion`의 `pathLength` 0→1, ~250ms).
- **컨페티**: 짧은 1회 버스트. `canvas-confetti`는 **이미 의존성으로 설치돼 있음**
  (`components/pending-approval/approval-waiting-screen.tsx`에 동일 패턴 존재 —
  `confetti.create(canvas, { disableForReducedMotion: true })`). 그 패턴을 그대로 차용.
  파티클 컬러는 **브랜드 팔레트로 제한**(네온·그라데이션 금지 유지).
- **히어로 텍스트**: fade + scale-in (0.96→1).
- **혜택 행**: 아래로 stagger fade-in.
- **`prefers-reduced-motion: reduce`**: `disableForReducedMotion`로 컨페티 생략,
  체크마크·텍스트 즉시 표시.

## 6. 메시지 연결 — 신규 액션

딥링크는 `/messages?c=<conversationId>` 형태뿐이고, 대화는
`(buyerWsId, pgWsId)` 쌍당 1개로 **첫 메시지 전송 시 lazy 생성**된다.
선정 시점엔 `conversationId`가 아직 없을 수 있으므로 단순 `router.push` 불가.

### 신규: `getOrCreateConversationAction(counterpartyWorkspaceId)`
- `lib/server/actions/chat/getOrCreateConversationAction.ts`
- 세션에서 활성 워크스페이스를 받아 buyer/PG를 판별,
  `chatConversationRepo.findOrCreatePair(buyerWsId, pgWsId)` 호출.
- **메시지를 전송하지 않는다** — 대화 row만 보장하고 `{ ok, conversationId }` 반환.
- `ServiceResult` 규약 준수, 세션 검증은 액션 계층.

### CTA 흐름
```ts
const r = await getOrCreateConversationAction(winningPgWsId);
if (r.ok) router.push(`/messages?c=${r.conversationId}`);
```

### 인박스 변경 불필요 (조사로 확인됨)
- `listConversationsForViewer`는 메시지 0건 대화도 포함(`lastMessageAt NULLS LAST`로 맨 아래).
- `MessageInbox`는 `?c=` id를 목록에서 찾아 선택, `ThreadView`는 빈 스레드를
  "첫 메시지를 보내 대화를 시작해보세요" 작성란으로 렌더.
- 따라서 빈 대화 생성 + 작성란 열기는 **기존 코드로 그대로 동작**. 신규 액션만 추가.

## 7. 서버 변경 없음

`awardRfpAction` / `RfpService.award`는 그대로 `{ ok: true }` 반환.
계약 생성·승자/패자 알림 팬아웃은 현행 유지. 이 작업은 **클라이언트 UX + 채팅 액션 1개**로 한정.

## 8. 디자인 원칙 수정 (요청)

현행 `DESIGN.md` §9와 `CLAUDE.md` 하드룰은 컨페티·펄스·강한 모션을 전면 금지한다.
이를 **좁게 한정된 "축하 모먼트" 예외**로 명문화한다.

- **`DESIGN.md` §9**: 안티패턴 목록에 carve-out 추가. 발동 조건 4가지로 못박음 —
  ① 사용자가 직접 일으킨 ② 종결성(terminal) 성공 이벤트에만 ③ 1회성
  ④ `prefers-reduced-motion` 준수 + 브랜드 컬러 유지(네온·그라데이션 여전히 금지).
  현재 등록된 유일한 발동 지점 = **견적 선정 완료**.
- **`CLAUDE.md`** "Linear Design Language — Hard Rules": "No pulse/...",
  "Motion animates transform/opacity/color only" 항목에
  "단, DESIGN.md §9의 축하 모먼트 예외 참조" 한 줄 추가.
- `styles/tokens.css`: 토큰 변경 없음(프로즈만 수정) → 손대지 않음.

## 9. 테스트 (TDD — RED 먼저)

### `AwardResult` 컴포넌트 (jsdom)
1. 승자 PG명 + 완료 문구 렌더.
2. 현재 조건이 있을 때 델타(↓0.4%p 등) 렌더.
3. **현재 조건이 없을 때** 화살표 없이 사실만(폴백).
4. 주 CTA 클릭 → `getOrCreateConversationAction` 호출 후 `/messages?c=<id>` 이동.
5. 보조 CTA → `/rfp` 이동.
6. `prefers-reduced-motion`일 때 confetti 미호출(컨페티 모듈 mock).

### `FocusComparison` 통합 (jsdom)
7. award 성공 시 즉시 refresh 대신 오버레이 표시.
8. **이미 선정된 RFP를 처음 열 때는 오버레이가 뜨지 않음** (1회성 불변식).

### `getOrCreateConversationAction` (node + PGlite)
9. 대화가 없을 때 생성하고 `conversationId` 반환.
10. 이미 있을 때 같은 `conversationId` 반환(멱등).
11. 메시지를 전송하지 않음(메시지 0건 유지).

### 변경 없음
- `awardRfpAction` / `RfpService.award` — 서버 테스트 변경 없음.
- `ImprovementSummary`, `bid-compare` 유틸 — 재사용, 변경 없음.

## 10. 영향 파일 (요약)

신규:
- `components/rfp/comparison/AwardResult.tsx` (+ 테스트)
- `lib/server/actions/chat/getOrCreateConversationAction.ts` (+ 테스트)

신규 (서비스):
- `lib/server/services/chat.ts` — `ChatService.getOrCreateConversation` 메서드 (+ 액션 경유 테스트)

수정:
- `components/rfp/comparison/FocusComparison.tsx` — award `onAwarded` 콜백에서
  오버레이 상태 표시 (기존 `router.refresh()` 대체). `AwardConfirmDialog`는
  `onAwarded` 콜백을 이미 받으므로 **변경 불필요**.
- `DESIGN.md` §9, `CLAUDE.md` 하드룰 — 축하 모먼트 예외

의존성 변경 없음: `canvas-confetti`는 이미 설치됨.

## 11. 열린 항목

없음. (메시지 연결 방식까지 조사로 확정.)
