# 선정 후 전자서명 안내 — 딜룸 '계약' 탭 재설계

- 날짜: 2026-07-21
- 대상: `components/deal-room/SigningPanel.tsx` 및 buyer·PG 딜룸 본문
- 성격: 배치·시각 개편(서버 로직·ACL·액션 시그니처 무변경)

## 왜 고치나

선정(award) 직후 전자서명은 딜룸의 주 작업이 된다. 그런데 지금은 그 안내가 **견적 비교 탭 상단에 끼워진 카드 하나**로만 존재한다. 세 가지가 겹쳐 있다.

1. **위계** — 선정이 끝나면 견적비교표는 참고 자료로 내려앉는데, 서명 카드가 그 표와 같은 스크롤에 나란히 놓여 우선순위를 드러내지 못한다.
2. **문법 불일치** — 8개 상태(`awaiting_pg_template` / `sent` / `in_progress` / `completed` / `declined` / `expired` / `canceled` / `send_failed`)가 저마다 색면 배너·진행바·참여자 리스트·버튼을 다른 조합으로 쓴다. 상태가 바뀌면 카드 구조 자체가 바뀌어 눈이 매번 다시 훑어야 한다.
3. **중복** — 진행바(`1/2`)와 참여자 리스트가 같은 사실을 두 번 말한다.

부수적으로, `awaiting_pg_template` 상태에서 PG가 자기 자신에 대한 3인칭 안내("PG사가 계약서를 준비하고 있어요")를 받고 템플릿 등록 화면으로 가는 길이 화면에 없다. 알림(`signing.awaiting_template`)은 `/inbox/{code}` 딜룸으로 보내는데, 정작 거기서 할 일을 알 수 없다.

## 무엇을 만드나

### 1. 전용 '계약' 탭

`signing !== null`일 때만 나타나는 탭을 **탭 배열 맨 앞**에 넣고, 그 경우 **기본 활성 탭**으로 연다.

```
구매사:  [계약 ●]  [견적 비교]  [요청 조건]  [첨부]  [PG 관리]
PG   :  [계약 ●]  [견적 작성]  [요청 조건]  [첨부]      ← awardedToMe && signing
```

좌측 `DealRoomActionRail`도 같은 순서로 `계약`을 첫 항목에 둔다. `RailAction`에 `dot?: ChipColor` 한 필드를 더해 아이콘 우상단에 상태 도트를 찍는다(준비 중 `warning` / 진행 중 `primary` / 완료 `tertiary` / 실패 `error`).

계약 탭이 기본으로 열리면서 `DealResultHeader`(선정 완료 + 담당자 연락 블록)가 뒤 탭으로 밀린다. 이를 메우기 위해 계약 카드 **위에 한 줄 컨텍스트**를 둔다 — `✓ {PG명} · 선정 완료 · 담당자 {이름}` + `[메시지]`. 박스를 두르지 않아 카드가 하나 더 늘어난 것처럼 보이지 않게 한다. 전화·이메일까지 담은 전체 연락 블록은 견적 비교 탭의 결과 헤더에 그대로 남는다.

### 2. 요약 스트립

견적 비교 탭(PG는 견적 작성 탭)의 결과 헤더 아래에 38px 한 줄을 남긴다.

```
✎ 전자서명   서명 진행 중 · 1/2                       보기 ›
```

클릭하면 계약 탭으로 이동한다. 다른 탭에 머무는 동안에도 상태 변화를 놓치지 않게 하는 장치다.

### 3. 카드의 시각 문법 — 세 구역 고정

상태와 무관하게 **항상 같은 순서·같은 자리**를 쓴다. 내용만 교체된다.

```
┌──────────────────────────────────────────────┐
│ ✎  전자서명                     [서명 진행 중] │  ① 상태 헤더
│    이메일로 보낸 링크에서 서명을 진행해 주세요.  │
├──────────────────────────────────────────────┤
│   ●  발송                     07-20 14:02    │  ② 서명 타임라인
│   │                                          │
│   ●  김민수 · 구매사           07-20 15:10    │
│   ┊                                          │
│   ◍  박지은 · PG              서명 대기       │
│   ┊                                          │
│   ○  완료                                    │
├──────────────────────────────────────────────┤
│ 서명은 스노우싸인에서 진행돼요   [리마인더] [취소] │  ③ 액션 바
└──────────────────────────────────────────────┘
```

**① 상태 헤더** — 색면 배너를 제거한다. 상태색은 아이콘과 Chip에만 싣고 제목(13.5px semibold)·보조문(12.5px `on-surface-variant`)은 평범한 텍스트로 둔다. Linear 하드룰의 "저대비 경계선이 구조를 만든다"에 맞고, 상태 전환 시 화면이 출렁이지 않는다.

**② 서명 타임라인** — 이 화면의 시그니처. 기존 진행바 + 참여자 리스트를 하나로 합친다. 노드는 항상 4개, 골격은 `시작 → 사람 → 사람 → 종결`로 고정한다. 완료 구간은 실선(`tertiary`), 대기 구간은 점선(`outline`). 마일스톤 노드는 10px 점, 사람 노드는 28px 이니셜 디스크 — 사람이 본체라는 위계를 크기로 표현한다. 진행률 막대는 삭제한다(중복).

**③ 액션 바** — hairline 구분선 위, 좌측 맥락 안내문 한 줄 + 우측 버튼. 위치가 고정이라 상태가 바뀌어도 버튼을 눈으로 찾지 않는다.

`completed`에서만 ②와 ③ 사이에 **문서 행** 두 개가 들어간다. 버튼 두 개 대신 파일 행으로 두는 이유는, 사용자가 그 시점에 얻는 것이 실제로 문서이기 때문이다.

```
📄 계약서             양측 서명이 담긴 완료본 PDF        ↓
📄 감사추적인증서      열람·서명 이력과 타임스탬프        ↓
```

### 4. 상태별 내용

| 상태 | 헤더 제목 | 타임라인 4노드 | 액션 |
|---|---|---|---|
| `awaiting_pg_template` · buyer | PG사가 계약서를 준비하고 있어요 | 선정 ✓ / **계약서 준비 ◍** / 양측 서명 ○ / 계약 완료 ○ | 없음 |
| `awaiting_pg_template` · **PG** | 계약서 템플릿을 등록해 주세요 | 선정 ✓ / **계약서 등록 ◍** / 양측 서명 ○ / 계약 완료 ○ | `[서명 템플릿 등록하기]` → `/signing-templates` |
| `sent` · `in_progress` | 서명을 기다리는 중이에요 | 발송 ✓ / 구매사 / PG / 계약 완료 ○ | `[리마인더 보내기]` `[취소]` |
| `completed` | 모든 서명이 완료됐어요 | 전 노드 ✓ | 문서 행 2개 |
| `declined` | 서명이 거절됐어요 | 거절 참여자 노드 error / 종결 error | `[다시 발송]` |
| `expired` | 서명 기한이 지났어요 | 미서명 노드 dim / 종결 error | `[다시 발송]` |
| `canceled` | 전자서명이 취소됐어요 | 미서명 노드 dim / 종결 dim | `[다시 발송]` |
| `send_failed` | 전자서명을 시작하지 못했어요 | 선정 ✓ / **발송 실패 ✗** / 양측 서명 ○ / 계약 완료 ○ | `[다시 시작]` |

역할(buyer/pg)로 갈리는 것은 `awaiting_pg_template` 한 상태의 헤더 문구·2번 노드 라벨·액션뿐이다. 나머지 일곱 갈래는 양측이 동일하다.

문구는 `UX_WRITING.md`의 해요체·능동형·긍정형을 따른다. 실패 상태의 안내문은 "선정 결과는 그대로예요"로 사용자가 잃은 것이 없음을 먼저 말한다.

## 구조

`SigningPanel.tsx` 한 파일(현재 330줄, 8개 상태가 JSX 안에서 분기)을 파생과 렌더로 나눈다.

```
components/deal-room/signing/
├─ signing-view-model.ts    (SigningView, side) → { header, nodes[], actions[], docs[] } 순수 함수
├─ SigningTab.tsx           3구역 셸 + 액션 실행 (기존 SigningPanel 대체)
├─ SigningTimeline.tsx      노드 배열 렌더 (표시 전용)
└─ SigningSummaryStrip.tsx  한 줄 요약 + 탭 이동 콜백
```

- 상태 × 역할 조합의 진실은 전부 `signing-view-model.ts`에 모인다. 렌더 컴포넌트는 파생 결과를 그리기만 하므로 각각 독립적으로 이해·테스트된다.
- 서버 액션(`remindSigningAction` / `cancelSigningAction` / `resendSigningAction`)·ACL·라우트·타입은 손대지 않는다. 토스트 문구는 기존 `signingErrorMessage`(`lib/signing/error-messages.ts`)를 그대로 재사용한다.
- `components/deal-room/SigningPanel.tsx`는 삭제하고 임포트 2곳(`BuyerDealRoomBody` / `PgDealRoomBody`)을 교체한다.

### 데이터 흐름

`lib/server/rfp-detail-loader.ts`가 이미 `signing: SigningView | null`을 양측 딜룸에 내려주고 있다. 서버 변경 없이 이 값만으로 탭 존재 여부·기본 탭·도트 색·카드 내용이 전부 결정된다.

```
loadBuyerRfpDetail / loadPgRfpDetail
   └─ signing: SigningView | null
        ├─ null            → 계약 탭 없음, 스트립 없음, 기존과 동일
        └─ non-null        → 탭 추가(맨 앞) + 기본 활성 + 레일 도트 + 스트립
```

`SigningTab`은 `side: 'buyer' | 'pg'`를 prop으로 받는다. 각 body가 자기 값을 고정으로 넘기므로 클라이언트가 역할을 추측하지 않는다.

## 테스트

TDD로 진행한다 — 각 단계에서 실패하는 테스트를 먼저 확인한다.

1. **`signing-view-model.test.ts`** — 8갈래 × side 2 매트릭스. 헤더 제목·Chip 색·노드 4개의 상태·액션 id를 검증한다. 이 스펙 표가 곧 테스트 케이스다.
2. **`SigningTab.test.tsx`** — 기존 `SigningPanel.test.tsx` 4케이스를 이관하고, PG `awaiting` CTA가 `/signing-templates`로 연결되는지, 액션 실패 시 `signingErrorMessage` 문구가 토스트로 뜨는지를 추가한다.
3. **`SigningTimeline.test.tsx`** — 노드 배열을 넣으면 순서·라벨·시각이 그려지는지(표시 전용이므로 얇게).
4. **`BuyerDealRoomBody.test.tsx` / `PgDealRoomBody.test.tsx`** — `signing`이 null이면 계약 탭이 없고 기본 탭이 기존 값, non-null이면 계약 탭이 첫 번째이며 기본으로 열리는지. 스트립 클릭이 탭을 전환하는지.

기존 `components/deal-room/__tests__/SigningPanel.test.tsx`는 삭제한다(케이스는 2번으로 이관).

## 검증

- `pnpm test components/deal-room/signing` — 신규 스위트 green
- `pnpm test components/deal-room components/rfp` — 딜룸 회귀 없음
- `pnpm tsc --noEmit` / `pnpm lint`
- 육안 — 로컬 dev에서 선정 완료 RFP를 buyer·PG 계정으로 각각 열어 탭 순서·기본 탭·다크 모드 확인

## 범위 밖

- 서버 액션·서비스·리포지토리·알림 문구 변경
- 알림 `linkUrl`을 `/signing-templates`로 바꾸는 것 (딜룸 CTA로 충분)
- 선정 확정 다이얼로그(`AwardConfirmDialog`)의 서명 예고 문구
- 참여자별 서명 링크를 앱 화면에 노출하는 것 (서명은 스노우싸인 이메일 링크가 정본)
