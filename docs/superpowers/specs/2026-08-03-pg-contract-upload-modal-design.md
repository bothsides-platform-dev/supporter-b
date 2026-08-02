# PG 계약서 올리기 — 전체화면 모달 전환

작성일: 2026-08-03 · 브랜치: `worktree-feat-signing-send-modal` · 기준: v0.4.38.1

## 문제

PG 가 낙찰 딜룸에서 계약서를 올리고 서명칸을 배치하는 스노우싸인 임베드가, 지금은
`SigningTab` 카드 안쪽 인라인 패널로 렌더된다 (`SigningTab.tsx:430`). 두 가지가 나쁘다.

1. **좁다.** iframe 이 `h-[min(72dvh,760px)]` 인데, 딜룸이 인터셉트 모달로 열리면 그
   모달 자체가 `min(1320px,100%-2rem)` × `min(900px,100dvh-2rem)` 다. 좁은 상자 안의
   좁은 상자에서 PDF 를 올리고 서명칸을 찍어야 한다.
2. **산만하다.** 같은 화면에 상태 헤더·서명 타임라인·액션 바·채팅 칼럼이 함께 있어,
   되돌리기 어려운 발송 작업에 집중이 안 된다.

## 해결

임베드를 **거의 전체화면 모달**로 띄운다. 딜룸 위에 겹쳐서 나머지를 백드롭으로 가리고,
iframe 면적을 `~72dvh` 에서 `100dvh - 2rem - 헤더` 로 넓힌다.

**범위 밖**: `보낸 계약서 찾기`(`SigningRecoveryDialog`)는 지금 모양 그대로 둔다.
서버 액션·리스 프로토콜·`attachProviderContract` 게이트는 일절 손대지 않는다.
이 작업은 **표현 계층 전환**이다.

## 컴포넌트 경계

```
SigningTab                       변경 없음 — 리스·하트비트·이어받기·서버 액션 소유
  └ SigningSendModal             신설 — 표현 + 이탈
      ├ Dialog(Backdrop + Popup)
      ├ header: 제목 · 수신자 · ✕
      ├ SigningSendEmbed         축소 — iframe + 신뢰 경계
      └ ConfirmDialog            이탈 확인
```

### `SigningSendEmbed` (축소)

**남는 것** — 전부 신뢰 경계다:

- `trustedOrigin` 파생, 파싱 실패 시 `null` → 모든 메시지 거부 (fail-closed)
- `isEmbedCompletionEvent` / `extractContractId` 게이트
- `doneRef` 1회 잠금 — **성공했을 때만** 잠근다 (실패는 재시도를 받는다)
- `phase` (`loading` / `ready` / `failed`) — 스켈레톤, 실패 오버레이, `다시 열기`
- `SANDBOX` / `referrerPolicy="no-referrer"` / `allow` / iframe

**빠지는 것** — 모달로 이사한다:

- 카드 테두리 `border-t`
- `계약서를 올리고 서명칸을 배치해 주세요` 제목 + 설명 두 줄
- `닫기` 버튼
- `buyerSigner` 안내 블록

**높이**: `h-[min(72dvh,760px)] min-h-[420px]` → `h-full`. 부모가 정한다.

**props**: `iframeUrl` · `onComplete` · `onReload`. (`buyerSigner` · `onClose` 는 모달로)

### `SigningSendModal` (신설)

**props**: `open` · `iframeUrl` · `buyerSigner` · `onComplete` · `onReload` · `onClose`
— `SigningTab` 이 지금 `SigningSendEmbed` 에 넘기던 것과 같다. 호출부는 컴포넌트 이름과
`open` 만 바뀐다.

**소유하는 상태**: 이탈 확인 다이얼로그 열림 여부 하나뿐.

### 왜 이 경계인가

신뢰 경계 테스트(오리진 대조·이벤트 형태·완료 가드)는 전부 축소된 `SigningSendEmbed`
안에 남는다. 이탈 확인은 새 모달 테스트로 독립 커버된다. 한 파일이 한 가지 이유로만
바뀐다.

대안이었던 "기존 컴포넌트를 Dialog 로 감싸기"는 `SigningSendEmbed` 에 두 정체(인라인
패널 / 모달 본문)를 주고, 이탈 확인 배선을 이미 552줄인 `SigningTab` 으로 또 흘린다.

## 레이아웃

| | 딜룸 모달 (기존) | 계약서 보내기 모달 (신규) |
|---|---|---|
| 너비 | `min(1320px, 100%-2rem)` | `min(1400px, 100dvw-2rem)` |
| 높이 | `min(900px, 100dvh-2rem)` | `100dvh-2rem` |
| 모서리 | `shape-extra-large` | 동일 |
| 백드롭 | `black/10` + `backdrop-blur-xs` | 동일 |
| z | 50 | 50 — 나중에 마운트된 포탈이 body 뒤쪽에 붙어 같은 z 에서 위에 그려진다 |

딜룸 셸은 채팅 칼럼이 `w-[360px]` 고정에 브레이크포인트가 없다 — 이미 데스크톱 전제
레이아웃이므로 별도 모바일 모드를 만들지 않는다. 뷰포트 상대 단위로만 잡아 좁은 화면에서
자연히 줄어든다.

### 헤더 — 한 줄

```
┌────────────────────────────────────────────────────────┐
│ 계약서 보내기          수신자 홍길동 hong@acme.kr   [✕] │  ~48px
├────────────────────────────────────────────────────────┤
│                                                        │
│              스노우싸인 iframe (남는 높이 전부)          │
│                                                        │
└────────────────────────────────────────────────────────┘
```

- 기존 안내 두 줄(`계약서를 올리고 서명칸을 배치해 주세요` / `아래 화면은 스노우싸인이에요…`)은
  한 줄로 합친다. 모달 자체가 이미 "지금은 이 작업"이라고 말한다.
- 수신자는 카드 박스를 벗고 헤더 인라인으로. 이메일은 `.md-numeric` 유지 — 오타 판독이
  목적이라 등폭이 필요하다.
- Linear 하드룰: 6px 라운드, 그림자 대신 `outline-variant` 1px, 본문 13px 이하,
  액센트 그라디언트 없음.

## 이탈 흐름

작업물은 **스노우싸인 안에만 있다**. 우리는 PDF 도 서명칸 좌표도 저장하지 않으므로,
iframe 이 언마운트되면 올린 것이 전부 사라진다. 모달은 백드롭 클릭·Esc 라는 실수하기 쉬운
이탈 경로를 기본으로 달고 오므로 셋 다 확인을 거친다.

```
백드롭 클릭 ─┐
Esc ────────┼─→ onRequestClose() ─→ ConfirmDialog
✕ ──────────┘                          │
                            ┌──────────┴──────────┐
                     [계속 작성하기]          [그만두기]
                            │                     │
                  확인창만 닫힘             onClose()
                  iframe 그대로            = SigningTab.closeEmbed()
                  (리마운트 없음)           = 리스 반납 + setEmbed(null)
```

Dialog 는 controlled 다 — `onOpenChange(false)` 를 받아도 `open` 을 내리지 않고, 확인을
통과할 때만 부모가 내린다.

**불변식: 확인창이 떠도 `SigningSendEmbed` 는 언마운트되지 않는다.** 리마운트하면
작성물이 날아가 확인을 받는 의미가 사라진다. React 트리에서 형제로 두고, `SigningTab` 이
이미 걸고 있는 `key={embed.url}` 을 유지한다.

**확인은 무조건 뜬다.** iframe 은 서드파티 오리진이라 진행 상태를 알 수 없어, "아직 아무것도
안 했으니 그냥 닫기" 를 판별할 방법이 없다. 문구를 그 사실에 맞게 쓴다.

### 문구 (UX_WRITING.md — 해요체·능동형)

- 제목: `계약서 작성을 그만둘까요?`
- 설명: `작성 중인 계약서와 배치한 서명칸은 저장되지 않아요. 다시 열면 처음부터 올려야 해요.`
- 확인: `그만두기` (danger) / 취소: `계속 작성하기`

## 건드리지 않는 계약

| 계약 | 왜 그대로인가 |
|---|---|
| 리스 하트비트 (`EMBED_HEARTBEAT_MS`) | `embedOpen = embed !== null` 이고 확인창은 `embed` 를 바꾸지 않는다 → 확인창이 떠 있는 동안에도 핑이 돈다 |
| 언마운트 반납 | `SigningTab` 소유. 딜룸 탭 전환·모달 닫기 경로 그대로 |
| 이어받기 차단 | 신호가 오면 `setEmbed(null)` → 모달이 사라지고 확인창도 함께 사라진다 (뺏겼으면 확인받을 것이 없다) |
| postMessage 신뢰 경계 | 축소된 `SigningSendEmbed` 안에 그대로 |
| `attachProviderContract` 서버 게이트 | 무관 |
| `SigningRecoveryDialog` | 무관 — 범위 밖 |

## 리스크 — 3단 중첩

`DealRoomModal` › `SigningSendModal` › `ConfirmDialog`.

2단 중첩(`DealRoomModal` › `ConfirmDialog`)은 취소·이어받기 확인으로 이미 검증됐지만
3단은 처음이다.

**최악의 실패 모드**: Esc 가 최상단에서 멈추지 않고 딜룸까지 전파되면 `router.back()` 이
돌아 (`DealRoomModal.tsx:58`) 딜룸이 통째로 닫히고 작성물이 날아간다. 테스트로 못박는다.

부수 확인 항목: 확인창 취소 시 포커스가 모달로 돌아오는지, 스크롤락이 중첩에서 정상인지.

## 테스트 (RED 먼저)

### `SigningSendModal` — 신규

1. 백드롭 클릭 → 확인창이 뜨고 모달은 열린 채다
2. Esc → 확인창이 뜨고 모달은 열린 채다
3. 확인창 위에서 Esc 한 번 더 → 확인창만 닫히고 모달은 살아있다 (전파 차단)
4. ✕ → 확인창
5. `계속 작성하기` → **iframe DOM 노드가 동일하다** (리마운트 없음)
6. `그만두기` → `onClose` 정확히 1회
7. `open=false` (이어받기) → 확인창이 떠 있어도 함께 사라진다
8. 수신자 이름·이메일 표시 (기존 `SigningSendEmbed.test.tsx:37` 에서 이사)

### `SigningSendEmbed` — 축소

기존 13개 중 **11개 그대로 GREEN**. 헤더·닫기 어서션만 제거:

- `:37 shows the buyer signer …` → 모달 테스트로 이사
- `:156 closes on the close button` → 모달 테스트로 이사

### `SigningTab`

임베드가 열리면 `SigningSendModal` 이 렌더되고, 리스 반납 계약(닫기 1회 / 언마운트 1회)이
유지된다.

## 관련 문서

갱신 대상: `SCREEN_DESIGN.md` (딜룸 계약 탭 절 — 임베드가 인라인이 아니라 모달임을 기록).
`CLAUDE.md` 의 "선정 후 전자서명" 절은 발송 프로토콜을 서술하므로 표현 전환만으로는
갱신 대상이 아니다.
