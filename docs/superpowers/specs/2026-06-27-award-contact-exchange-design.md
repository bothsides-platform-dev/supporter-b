# 선정 후 담당자 연락처 교환 (deal-room contact card)

**Date**: 2026-06-27
**Status**: Design approved, pending spec review

## Problem

견적이 선정/미선정으로 종결된 뒤, 견적서 화면에 후속 안내가 없다. 선정이 끝나면
구매사 담당자와 선정된 PG 담당자가 플랫폼 밖에서 직접 연락(이메일·유선)할 수 있어야
하는데, 서로의 연락처를 교환할 자리가 없다. 미선정된 PG에게도 결과 안내가 명시적으로
보이지 않는다.

## Goal

견적이 `awarded` 상태가 되면, 선정된 PG와 구매사가 견적서(딜룸) 화면에서 **서로의
담당자 연락처(이름·이메일·전화)를 보고 직접 연락**할 수 있게 한다. 선정되지 않은 PG에게는
**연락처 없이 정중한 미선정 안내**만 보여준다.

## Scope decisions (확정)

- **연락처 = 개인 담당자.** 구매사 = `rfps.createdBy`, PG = 선정된 bid 의 `submittedBy`.
  워크스페이스(회사) 단위 연락처는 도입하지 않는다 (현재 스키마에 없음).
- **이메일은 항상, 전화는 있을 때만.** `users.phone` 은 nullable 이며 가입 후 보기/수정
  UI 가 없다. null 이면 전화 행을 생략한다. 별도 전화 편집 UI 는 **이번 범위 밖**.
- **미선정 PG 는 안내만, 연락처 없음.** 연락처 교환은 선정된 PG ↔ 구매사 사이에서만,
  **양방향 대칭**으로 일어난다. 패자는 구매사 연락처를 볼 수 없고, 구매사는 패자 연락처를
  볼 수 없다.
- **전달 방식 = 딜룸 카드만.** 이메일/아웃박스 변경 없음. 신규 라우트 없음. **DDL 없음.**

## Behavior matrix

| 주체 | RFP 상태 | 견적서(딜룸) 화면 표시 |
|---|---|---|
| 구매사 | `awarded` | **"선정한 PG 담당자 연락처"** 카드 → 선정 bid 의 `submittedBy`: 회사명·이름·이메일·전화(있으면) |
| PG — 선정됨 (`awardedToMe`) | `awarded` | **"구매사 담당자 연락처"** 카드 → `rfps.createdBy`: 구매사명·이름·이메일·전화(있으면) |
| PG — 미선정 | `awarded` (타사 선정) | **미선정 안내** 카드 — 연락처 없음 |
| 누구나 | `sent` / `closed` / `cancelled` | 카드 없음 (현행 유지) |

`closed`/`cancelled` (선정자 없음) 는 "누가 선정된" 순간이 아니므로 현행 동작을 유지한다
(안내 카드 없음).

## Data boundary (핵심)

봉인 입찰 플랫폼이므로 연락처 이메일/전화는 **로더에서 서버 측으로 게이트**되어야 한다.
상대 당사자의 RSC 페이로드에 잘못 실리면 안 된다 (기존 현재-수수료 strip 과 동일 패턴).

- **`lib/server/rfp-detail-loader.ts` → `loadBuyerRfpDetail`**: `status === 'awarded'` 일 때
  선정 bid 의 `submittedBy` 를 해석해 `awardedPgContact: { workspaceName, name, email, phone } | null`
  을 부착한다. 선정자(winner)의 것만; 그 외 상태에서는 항상 `null`.
- **`lib/server/rfp-detail-loader.ts` → `loadPgRfpDetail`**: 이미 `awardedToMe` 를 계산한다.
  `awardedToMe === true` 이면 `rfp.createdBy` 를 해석해 `buyerContact: { workspaceName, name, email, phone }`
  을 부착한다. **그 외에는 `buyerContact: null`** — 미선정 PG 에게는 연락처를 애초에
  조회하지 않으므로 누출 불가 (fail-closed).
- **유저 리포지토리 신규 read**: 전용 메서드 `findContactById(userId) → { name, email, phone } | null`
  을 **추가**한다 (기존 `findProfileById`(UserProfileCard)는 presence/ACL 성격이고 phone 을
  포함하지 않으므로 확장하지 않고 분리). DB 접근을 `lib/server/repositories/**` 안에 유지
  (repo 경계 규칙). phone 은 null 가능 → 그대로 흘려보낸다.

## Components

- **`CounterpartyContactCard`** (공용) — props `{ title, workspaceName, name, email, phone? }`.
  렌더: 제목 → 회사명 → 이름 → 이메일 행(`mailto:`) → 전화 행(`tel:`, **phone 있을 때만**).
  Linear 카드: 1px `outline-variant` 보더, 6px radius, dense 행. 전화 숫자에 `.md-numeric`
  (tabular). 라인 SVG 아이콘(mail/phone), 일러스트 없음. 버튼/연락 링크는 pill 아님(6px).

  ```
  ┌─────────────────────────────────────────┐
  │ 선정한 PG 담당자 연락처                    │
  │ 토스페이먼츠                              │
  │ 김영업                                    │
  │ ✉  sales@tosspayments.com   → mailto     │
  │ ☎  010-1234-5678            → tel  (있으면)│
  └─────────────────────────────────────────┘
  ```

- **`NotSelectedNotice`** (PG 패자) — 작은 안내 카드: "이번엔 선정되지 않았어요" + 한 줄
  격려. 연락처/링크 없음. 최종 문구는 `UX_WRITING.md` 해요체를 따른다.

**배치:**
- `components/deal-room/buyer/BuyerDealRoomBody.tsx` — `awarded` 상태에서 카드를 눈에 띄게
  렌더.
- `components/deal-room/pg/PgDealRoomBody.tsx` — `awardedToMe` 면 카드, 타사 선정이면 notice
  를 `SubmittedSummary` 인접에 렌더.

지속 카드는 1회성 `AwardResult` 축하 오버레이를 **대체하지 않고 보완**한다 (새로고침 후에도
다시 찾아볼 수 있어야 하는 것이 핵심 가치).

## Non-goals

- 전화번호 보기/수정 UI 추가 (가입 후 stale 가능성은 수용; 별도 작업).
- 이메일/아웃박스 전달, 신규 라우트, 신규 DB 컬럼/마이그레이션.
- 워크스페이스(회사) 단위 연락처.
- 연락처 = 워크스페이스 owner 가 아니라 해당 건의 실제 담당자(`createdBy`/`submittedBy`).

## Edge cases

- `phone === null` → 전화 행 생략, "미등록" 같은 군더더기 표기 없음.
- 재요청(requote) 라운드: 선정자 = 선정된 bid 의 `submittedBy` (라운드 무관).
- 철회(withdrawn) bid 는 선정 대상이 아님 → 해당 없음.
- 워크스페이스에 멤버가 여럿이어도 연락처는 그 건의 담당자 1인.

## Testing (TDD, RED 먼저)

1. `findContactById` — `{name,email,phone}` 반환; 없는 id 는 `null`.
2. `loadBuyerRfpDetail` — `awardedPgContact` 가 `awarded` 일 때만 정확히 존재; 그 외 `null`.
3. `loadPgRfpDetail` — `awardedToMe` 면 `buyerContact` 존재; **미선정 PG 페이로드엔 buyer
   email/phone 부재** (봉인 경계 회귀 테스트).
4. `phone === null` → 연락처 객체의 phone 이 null 로 흐르고 행이 생략된다.
5. `CounterpartyContactCard` — 이메일 mailto 항상; 전화 tel 은 phone 있을 때만.
6. `NotSelectedNotice` — 렌더되며 출력에 **이메일/전화 없음**.
7. 딜룸 바디 wiring — 구매사 awarded → 카드, PG 선정 → 카드, PG 미선정 → notice.

## Docs to update

- `SCREEN_DESIGN.md` — rfp/inbox 화면에 신규 카드/안내 등록 (스크린 스펙).
- `UX_WRITING.md` 해요체 기준으로 미선정 안내 문구 확정.

## Files (예상)

- `lib/server/repositories/**` (users repo) — `findContactById` + 인터페이스/팩토리.
- `lib/server/rfp-detail-loader.ts` — 연락처 부착 (양 로더) + 반환 타입 확장.
- `components/deal-room/CounterpartyContactCard.tsx` (신규)
- `components/deal-room/NotSelectedNotice.tsx` (신규)
- `components/deal-room/buyer/BuyerDealRoomBody.tsx` — wiring
- `components/deal-room/pg/PgDealRoomBody.tsx` — wiring
- 각 항목의 테스트 (`__tests__/*.test.ts(x)`)

DDL 없음 · 신규 env 없음 · 신규 라우트 없음.
