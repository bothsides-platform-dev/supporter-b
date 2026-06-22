# 견적 채팅 UI 시각 폴리시 — 설계

- **작성일**: 2026-06-22
- **상태**: 설계 확정 (구현 계획 대기)
- **범위**: 시각/모션 폴리시. 기능·데이터·서버 로직 **불변**.
- **영향면**: `/messages` 통합 인박스 + 딜룸 채팅 레일(공유 atom이므로 구매사·PG 양쪽 동시 반영)

---

## 1. 배경

채팅 plumbing(낙관적 전송·Centrifugo 라이브·타이핑·프레즌스·읽음·초안·첨부·@멘션·그룹핑)은 이미 성숙하다. 부족한 건 **메시지를 감싸는 프레임의 시각적 완성도**다. 본 작업은 발신자 표기·대화 목록·헤더·날짜 구분선·빈/로딩/에러 상태를 Linear 디자인 언어에 맞춰 다듬고, 로딩 모션 원칙 하나를 갱신한다.

근거가 된 현재 코드:
- `components/messages/ThreadView.tsx` — 상대방 스레드(헤더·메시지 리스트·컴포저)
- `components/messages/TeamThreadView.tsx` — 팀 스레드
- `components/messages/MessageBubble.tsx` — 말풍선 행(변경 없음)
- `components/messages/ConversationList.tsx` — 대화 목록 행
- `components/messages/message-grouping.ts` / `format.ts` — 그룹핑·날짜 라벨(변경 없음)
- `components/messages/AttachmentGalleryPanel.tsx`, `ThreadSkeleton.tsx`, `TeamThreadPane.tsx` — 상태 표시
- `components/primitives/EmptyState.tsx` — 빈 상태 프리미티브

토큰 실측값(라이트, `styles/tokens.css`): self 말풍선 `#D1E4FF`/`#001D36`, 상대 말풍선 `#F1F2F4`/`#1F2023`, primary `#0061A4`, on-surface-variant `#6B7079`, outline-variant `#E8E9EC`, surface-container `#F1F2F4`, tertiary(온라인 녹색) `#1F9D55`, shape-small 6px, shape-medium 8px, shape-full 9999px.

---

## 2. 목표 / 비목표

**목표**
- 발신자 표기를 "대칭 컴팩트"로 통일해 군더더기를 줄이되 양쪽 작성자 모두 또렷하게.
- 대화 목록·스레드 헤더·날짜 구분선의 정보 위계와 밀도를 끌어올린다.
- 빈/로딩/에러 상태를 디자인 시스템 하나로 통일한다.
- "로딩은 `LOADING…` 텍스트" 하드룰을 **펄스 스켈레톤·점 허용**으로 갱신한다.

**비목표 (이번 PR 범위 밖)**
- 말풍선 모양/색/최대폭/꼬리, 타임스탬프 위치, 읽음 영수증(`✓ 읽음`) — **현행 유지**.
- 메시지 단위 기능(답장·반응·수정·삭제·링크 미리보기·라이트박스) — 없음.
- 레이아웃 구조(3-pane, 레일/탭/FAB) 재배치 — 없음.
- 앱 전역 버튼 `LOADING…` 라벨(~40곳) 일괄 교체 — **후속**(원칙상 허용되나 이번엔 안 함, §6/§9 참조).

---

## 3. 설계 결정

### 3.1 메시지 발신자 표기 — 대칭 컴팩트 (선택: C안)
- 묶음당 1회 **한 줄 헤더** `[xs 아바타] 이름` — self·other 양쪽 모두 표기(현재의 대칭 authorship 유지).
- 아바타 크기 **sm(22px) → xs(18px)**, 헤더-말풍선 간격 축소, 묶음 간 간격은 약간 키워 리듬 분리.
- 그룹핑 로직(`message-grouping.ts`)·말풍선·시각·`✓ 읽음`은 **불변**.
- 비고: 현재도 양쪽 헤더를 그리므로 변경은 "컴팩트화"(아바타 축소·단일 행·간격)에 한정 — 순수 스타일.
- 대상: `ThreadView.tsx`(작성자 헤더 블록), `TeamThreadView.tsx`(동일 패턴).

### 3.2 대화 목록 행 (`ConversationList.tsx`)
- **안읽음 강조 + 파란 점 제거**: `item.unread`일 때 이름 `font-weight 600` + 미리보기 `on-surface(#1F2023)`. 현재의 파란 점(`size-2 bg-primary`) **삭제**. 접근성: 행에 `sr-only` "읽지 않음" 라벨 유지(시각만 제거, 시맨틱 보존).
- **RFP 줄**: 9px primary-container 미니 칩 → `P-2605-0042 · 정산대행 견적` 한 줄(코드 = mono·`#0061A4` 600, 제목 = 11px variant, truncate).
- **선택 행**: 기존 `surface-container` 배경 + **왼쪽 2px `#0061A4` 액센트 바**(`::before` 또는 border-l).
- **팀 행**: `팀 · {code} {title}` 한 줄 뭉침 → 이름줄은 **`팀 채팅`**, 아래에 counterparty와 동일한 RFP 줄 분리.

### 3.3 스레드 헤더 (`ThreadView.tsx` 헤더, page·rail 변형)
- 이름·타입 칩 옆에 프레즌스 텍스트 라벨 `· 온라인`(`online`일 때, `#1F9D55` 500). 기존 `PresenceDot`은 아바타에 유지.
- 이름 아래 RFP 컨텍스트 한 줄 `{code} · {title}`(코드 mono·blue). 데이터는 `rfpContext`/`defaultRfpId`에서 가져온다(이미 prop 존재). 없으면 렌더 안 함.

### 3.4 날짜 구분선
- 현재: 가운데 맨 텍스트(`<div role="separator">` 안 11px). → **은은한 surface 칩**(`surface-container` 배경 + `outline-variant` 1px + `shape-full`, 가운데 정렬).
- `ThreadView`·`TeamThreadView`에 중복된 구분선 마크업을 **`components/messages/DateDivider.tsx`** 단일 컴포넌트로 추출(드리프트 방지). 입력은 `dayLabel` 문자열.

### 3.5 상태 통일 — 빈 / 에러 / 로딩
- **빈**: `EmptyState`(라인 SVG 아이콘 + 제목 + 설명)로 통일. 예) 첨부 갤러리 빈 = 클립 라인 아이콘 + "공유된 파일이 없어요" + 설명. 현재 맨 텍스트("첨부파일 없음") 제거.
- **에러**: `EmptyState` + **"다시 시도" 액션 버튼**. `TeamThreadPane`의 기존 에러+재시도와 시각 통일. `EmptyState`가 액션(children/action prop)을 못 받으면 받도록 확장.
- **로딩**:
  - **넓은 영역** → **펄스 스켈레톤**. `ThreadSkeleton`을 펄스 바로 갱신, 첨부 갤러리/팀 스레드 로딩에도 스켈레톤 적용.
  - **인라인·작은 자리 + 타이핑 인디케이터** → **펄스 점(3개, staggered)**. `ThreadView` 헤더의 `입력 중…` 텍스트를 펄스 점으로 교체.
  - **스피너 미채택**(채팅 표면). 단 기존 spin 사용처(RefreshHeaderButton·첨부 업로드 칩)는 그대로 둔다.

---

## 4. 디자인 원칙 수정 (범위 A)

로딩 금지 룰을 "허용"으로 갱신하되, **장식적 컨페티·강한 모멘텀 모션 제한은 그대로** 둔다(축하 모먼트 예외 유지). 코드베이스에 이미 `animate-spin`(RefreshHeaderButton·업로드 칩)·`animate-pulse`(MessageBubble pending 점)가 존재 → 이 변경은 문서를 현실과 정합시키는 것에 가깝다. 자동 드리프트 가드(금지 클래스 스캐너)는 없다(기존 사용처가 green인 것으로 확인).

**적용 범위 = A**: 원칙은 전역으로 완화하되, **이번 구현은 채팅 로딩 표면에만** 적용. 버튼 `LOADING…` 라벨·타 화면(~40곳)은 후속(원칙상 허용, 강제 아님).

### 4.1 `CLAUDE.md` (line 125)

현재:

```text
- **No** pulse/spinner loading. Use `LOADING…` text (body-medium type). (예외: DESIGN.md §9 "축하 모먼트" — 종결 성공 1회성에 한해 컨페티 허용.)
```

변경(안):

```text
- **로딩 모션 허용** — 넓은 영역은 펄스 스켈레톤, 인라인·타이핑 인디케이터는 펄스 점(staggered). `prefers-reduced-motion: reduce` 존중(저감 시 정지/단순화). 버튼 진행 등 짧은 `LOADING…` 텍스트 표기는 그대로 두어도 무방. 장식적 컨페티·강한 모멘텀 모션 제한은 유지(DESIGN.md §9 "축하 모먼트" 예외만).
```

### 4.2 `DESIGN.md` §9 (line 212)

현재:

```text
- **No** 컨페티·펄스·강한 모멘텀 모션 — 단 하나의 예외(아래 "축하 모먼트")만 허용.
```

변경(안):

```text
- **No** 장식적 컨페티·강한 모멘텀 모션 — 단 하나의 예외(아래 "축하 모먼트")만 허용. **단 기능적 로딩 모션은 허용**: 넓은 영역은 펄스 스켈레톤, 인라인·타이핑 인디케이터는 펄스 점. 모두 `prefers-reduced-motion: reduce`를 존중하며(저감 시 정지), 채팅 표면은 스켈레톤·점을 우선한다.
```

### 4.3 토큰/키프레임
- `styles/tokens.css` **값 변경 없음**(원칙 문구 변경이라 동기화 대상 아님). 본 절을 그 근거로 남긴다.
- 펄스 점이 "통통 튀는" 모션이면 `app/globals.css`에 작은 bounce 키프레임 추가(스피너 `spin`이 이미 여기 있음). `prefers-reduced-motion: reduce`에서 비활성. 스켈레톤은 Tailwind 기본 `animate-pulse` 재사용.

---

## 5. 신규/변경 프리미티브

- **`components/primitives/Skeleton.tsx`** (신규) — `animate-pulse` 회색 바(`surface-container-highest`, `shape-extra-small`). 폭/개수 props. `ThreadSkeleton`·갤러리·팀 스레드 로딩이 소비.
- **`components/messages/TypingDots.tsx`** (신규) — staggered 펄스 점 3개. 타이핑 인디케이터 + 인라인 로딩. reduced-motion 존중.
- **`components/messages/DateDivider.tsx`** (신규) — 칩형 날짜 구분선(§3.4), `ThreadView`·`TeamThreadView` 공용.
- **`components/primitives/EmptyState.tsx`** (변경) — 선택적 액션(예: "다시 시도") 지원(이미 가능하면 그대로).

---

## 6. 접근성

- 대화 목록 안읽음: 시각 점 제거 → `sr-only` "읽지 않음" 텍스트로 시맨틱 보존.
- 타이핑 점·로딩: 적절한 `aria-label`/`aria-live`(예: 타이핑 `aria-label="입력 중"`, 로딩 영역 `role="status"`). 모션은 `prefers-reduced-motion: reduce`에서 정지.
- 선택 행 액센트 바는 보조 신호 — 기존 `aria-current` 유지.

---

## 7. TDD 계획

순수 스타일(className/토큰)만 바뀌는 부분은 프로젝트 TDD 면제(시각 변경). **상태·조건 분기·새 렌더 데이터**가 붙는 부분은 RED→GREEN:

- `ConversationList` — 안읽음 행은 이름 굵게 + **점 없음** + `sr-only "읽지 않음"`; 선택 행 액센트; 팀 행 `팀 채팅` + RFP 줄. (조건 렌더 변경 → 테스트)
- 스레드 헤더 — `online`일 때 `온라인` 라벨, `rfpContext` 있을 때 `code·title` 렌더. (조건 렌더 → 테스트)
- `AttachmentGalleryPanel` — 로딩 시 스켈레톤 렌더. **기존 테스트 `AttachmentGalleryPanel.test.tsx`의 `getByText('LOADING…')` 단언을 스켈레톤 검사로 교체**(이 테스트는 변경 없으면 깨진다).
- 타이핑 인디케이터 — `typingUserIds`>0 일 때 `TypingDots`(role/aria) 렌더, 텍스트 단언 갱신.
- `DateDivider`·`Skeleton`·`TypingDots` — 간단한 렌더/접근성 유닛.

순수 스타일(면제): 발신자 헤더 컴팩트화, 말풍선/시각 불변, 날짜 칩 시각, RFP 줄·선택 바 스타일.

---

## 8. 변경 파일 체크리스트

신규: `primitives/Skeleton.tsx`, `messages/TypingDots.tsx`, `messages/DateDivider.tsx`
변경: `messages/ThreadView.tsx`, `messages/TeamThreadView.tsx`, `messages/ConversationList.tsx`, `messages/AttachmentGalleryPanel.tsx`, `messages/ThreadSkeleton.tsx`, `messages/TeamThreadPane.tsx`, `primitives/EmptyState.tsx`, `app/globals.css`
문서: `CLAUDE.md`(L125), `DESIGN.md`(§9 L212)
테스트: `messages/__tests__/AttachmentGalleryPanel.test.tsx`(+ 신규 유닛들)

---

## 9. 후속 / 미해결

- **전역 `LOADING…` 마이그레이션(B안)** — 버튼 라벨·Suspense 폴백 ~40곳을 스켈레톤/점으로 교체. 원칙상 허용되나 별도 PR(테스트 다수 동반).
- 타이핑 점의 정확한 모션(opacity 펄스 vs translateY bounce)은 구현 시 reduced-motion 친화적으로 확정.
