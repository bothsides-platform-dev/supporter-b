# Messages Page UI Redesign

**Date:** 2026-06-16  
**Goal:** 데스크탑 업무용 공간 활용도 향상 + 업계 표준 3컬럼 메시지 레이아웃 도입

---

## 요약

현재 `/messages` 페이지는 2컬럼(대화 목록 w-80 + 스레드)으로 구성되어 있으며, 갤러리 패널이 스레드 영역을 침범하는 방식으로 팝업된다. 이번 개편은 **Intercom·Front·HubSpot 계열 B2B 메시징 표준**인 3컬럼으로 전환하여 RFP 컨텍스트와 파일을 항상 노출하고, 중간 폭에서는 탭으로 자연스럽게 접힌다.

---

## 레이아웃 구조

### 반응형 3단계

| 폭 | 레이아웃 | 설명 |
|---|---|---|
| ≥1280px (xl) | **3컬럼** | 대화 목록 \| 채팅 스레드 \| 우측 컨텍스트 패널 |
| 768–1279px (md–lg) | **2컬럼 + 탭** | 대화 목록 \| 스레드 헤더에 채팅/RFP/파일 탭 |
| <768px | **단일 컬럼** | 기존 동작 유지 (목록 ↔ 스레드, 뒤로가기) |

### 컬럼 폭

- **대화 목록**: `w-64` (256px) — 현행 `w-80`에서 축소, 스레드/컨텍스트에 공간 양보
- **채팅 스레드**: `flex-1` (나머지 전체)
- **우측 컨텍스트 패널**: `w-64` (256px), xl에서만 표시

---

## 컴포넌트별 변경

### 1. `MessageInbox` (최상위 레이아웃)

- `md:w-80` → `md:w-64` (목록 폭 축소)
- xl 이상에서 우측 컨텍스트 패널 `ContextPanel` 렌더
- md–lg 에서 스레드에 `variant="tabs"` 전달
- 기존 2컬럼 모바일 토글 로직 유지

### 2. `ConversationList` (대화 목록)

**추가:**
- 상단 검색 인풋 (`대화 검색`, 클라이언트 필터링, 키워드는 이름·미리보기·RFP 코드 대상)
- 각 항목에 RFP 칩 인라인 표시 (`rfp-chip` — RFP 코드 + 제목 truncate)

**변경:**
- 시간 포맷: 오늘 → `HH:mm` 절대시각, 같은 주 → 요일(예: `월요일`), 그 이전 → `M/D` 날짜
- 기존 구조(avatar, name, preview, unread dot) 유지

**인터페이스 변경 없음** — `InboxListItem` 타입에 `rfpCode?: string`, `rfpTitle?: string` 필드 추가 필요 (서버 액션에서 join)

### 3. `ThreadView` (채팅 스레드)

**제거:**
- 헤더의 "파일 N" 토글 버튼 (`totalAttachmentCount` 버튼)
- `showGallery` 상태 및 `AttachmentGalleryPanel` 렌더 로직 (우측 패널로 이동)

**추가 (`variant="tabs"` 시):**
- 헤더에 탭 UI: `채팅 | RFP | 파일`
- 탭 상태(`activeTab: 'chat' | 'rfp' | 'files'`)에 따라 본체 영역 전환
  - `채팅`: 기존 메시지 목록 + 컴포저
  - `RFP`: `ContextPanel`의 RFP 카드 내용 (동일 컴포넌트 재사용)
  - `파일`: `AttachmentGalleryPanel`

**props 추가:**
```ts
variant?: 'page' | 'rail' | 'tabs'
rfpContext?: { code: string; title: string; status: string; deadline: string | null }
```

### 4. `ContextPanel` (신규 컴포넌트)

**위치:** `components/messages/ContextPanel.tsx`

**역할:** 우측 컨텍스트 패널과 탭 내 RFP/파일 뷰의 공통 렌더 담당.

**props:**
```ts
type ContextPanelProps = {
  conversationId: string
  rfpContext?: {
    code: string
    title: string
    status: string
    deadline: string | null
    // bidCount 제외 — sealed-bid 원칙: PG는 경쟁자 수를 볼 수 없음
  }
}
```

**렌더 구조:**
1. **RFP 카드** — `rfpContext`가 있을 때만 렌더
   - 코드(`md-numeric`), 제목, 상태 Chip, 마감일
   - 없으면 빈 섹션 (팀 스레드는 rfpContext 항상 존재)
2. **공유 파일** — `AttachmentGalleryPanel` 재사용 (기존 컴포넌트)

### 5. `AttachmentGalleryPanel` (변경 없음)

기존 컴포넌트를 `ContextPanel` 내부에서 그대로 호출. `rail` 변형 오버레이 로직도 유지 (딜룸 ChatRail에서 여전히 사용).

---

## 서버 액션 변경

### `listInboxForViewer` (inboxLoader.ts)

`InboxListItem` 반환 타입에 RFP 정보 필드 추가:

```ts
rfpCode?: string    // 상대방 대화: conversation에 연결된 RFP의 표시 코드
rfpTitle?: string   // 상대방 대화: RFP 제목 (truncate용, 풀 제목 그대로)
```

- **상대방 대화**: `conversations` → `rfps` LEFT JOIN으로 `rfp_code`, `title` 조회
- **팀 스레드**: `rfpCode`/`rfpTitle`이 이미 있음 (기존 `rfpCode`, `rfpTitle` 필드 그대로)

`ThreadPane`→`ThreadView` prop 체인에 `rfpContext` 추가 필요.

**팀 스레드 처리:** `TeamThreadPane`은 `rfpId`를 이미 알고 있으므로, `MessageInbox`에서 `InboxListItem`의 `rfpCode/rfpTitle/rfpStatus/rfpDeadline`을 `ContextPanel`에 직접 전달. `TeamThreadView` 자체는 변경 없음.

---

## 검색 동작

- **클라이언트 사이드 필터링** (서버 요청 없음)
- 검색 대상: `counterparty.name`, `preview`, `rfpCode`, `rfpTitle`
- 대소문자 무시, 한글 부분 문자열 매칭
- 검색어가 비어있으면 기존 `filter`(전체/상대방/팀) 탭 기준으로만 필터

---

## 타입 변경

```ts
// inboxLoader.ts의 InboxListItem에 추가 (counterparty 대화용; team 스레드는 기존 rfpCode/rfpTitle 유지)
rfpCode?: string
rfpTitle?: string
rfpStatus?: string   // ContextPanel RFP 카드용
rfpDeadline?: string | null

// ThreadView props에 추가
variant?: 'page' | 'rail' | 'tabs'
rfpContext?: { code: string; title: string; status: string; deadline: string | null }
```

---

## 제외 범위

- DDL 변경 없음 (기존 conversations, rfps 테이블 조인만)
- `TeamThreadView` 내부 변경 없음
- 모바일 단일 컬럼 동작 변경 없음
- 딜룸 `ChatRail`의 `ThreadPane` 사용 변경 없음 (`variant='rail'` 그대로)
- `AttachmentGalleryPanel` 내부 변경 없음

---

## 테스트 범위

- `ConversationList`: 검색 필터링(이름·RFP 코드·미리보기), RFP 칩 렌더, 시간 포맷(오늘/어제/이전 주/더 오래됨)
- `ContextPanel`: rfpContext 있을 때/없을 때 렌더
- `MessageInbox`: xl variant에서 ContextPanel 렌더, md variant에서 tabs variant 전달 확인
- `ThreadView`: `variant='tabs'` 시 탭 전환 동작
- 기존 `ThreadView` 유닛 테스트 회귀 없음
