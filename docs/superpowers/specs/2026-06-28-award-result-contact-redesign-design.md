# 선정 결과 + 담당자 연락처 화면 개선 (결과 통합형)

- 작성일: 2026-06-28
- 상태: 설계 승인 대기 → 구현 계획(writing-plans)
- 선행: PR#303 v0.2.47.0 「선정 후 견적서 화면에서 담당자 연락처 교환」 (`docs/superpowers/specs/2026-06-27-award-contact-exchange-design.md`)
- 시각 목업: `.superpowers/brainstorm/.../content/final-both-sides.html`, `misselected-pg.html` (세션 산출물, 참고용)

## 1. 배경 / 문제

선정이 끝나면 딜룸 상단에 **떠 있는 카드**가 붙는다:

- **선정 PG**(`PgDealRoomBody`): `CounterpartyContactCard "구매사 담당자 연락처"`
- **구매사**(`BuyerDealRoomBody`): `CounterpartyContactCard "선정한 PG 담당자 연락처"`
- **미선정 PG**(`PgDealRoomBody`): `NotSelectedNotice "이번엔 선정되지 않았어요"`

세 카드 모두 탭(견적 작성 / 요청 조건 / 첨부) **위에 맥락 없이 떠 있는** 평면 박스다. 문제:

1. **선정 완료의 무게감이 없다** — "드디어 선정됐다/연결됐다"는 성취 모먼트가 그냥 정보 박스로 소비된다.
2. **정보 위계가 약하다** — 회사명·담당자·이메일·전화가 같은 톤으로 나열돼 한눈에 안 들어온다.
3. **위치·맥락이 끊겨 있다** — 카드가 견적 보낸 결과(✓ 견적을 보냈어요)와 분리돼 떠 있어, "내 견적의 결과"로 읽히지 않는다.

(사용자 우선순위: ① 선정 완료 무게감 · ② 정보 위계·레이아웃 · ③ 위치·맥락)

## 2. 해결 방향 — 「결과 통합형(C안)」

연락처/안내를 **별도 카드에서 떼어내, 각 화면의 '선정 결과' 맥락 안으로 병합**한다. 떠 있던 카드는 제거한다.

| 화면 | 결과 헤더(승격) | 연락처 | 헤더 칩 |
|---|---|---|---|
| 선정 PG | `견적 작성` 탭의 "✓ 견적을 보냈어요" → **"✓ 이 견적이 선정됐어요"** | 구매사 담당자 (ContactBlock) | `견적 보냄` → **`선정됨`**(tertiary) |
| 구매사 | 딜룸 상단 결과 패널 **"✓ {PG}를 선정했어요"** | 선정 PG 담당자 (ContactBlock) | **`선정 완료`**(기존, 변경 없음) |
| 미선정 PG | `견적 작성` 탭 → **"이번엔 선정되지 않았어요"**(중립 톤) | **없음**(봉인입찰) | `견적 보냄` → **`선정 마감`**(surface) |

공통 규칙:
- 세 화면이 **같은 시각 언어**를 공유한다(결과 헤더 + 그 아래 본문). 선정=tertiary 초록 + 체크, 미선정=중립 회색 + 담백한 아이콘(빨강 오류 톤 금지).
- 선정 PG·미선정 PG 모두 **"보낸 내용 보기 ▾"(SubmittedSummary)는 그대로 유지** — 결과 헤더 아래에 둔다.
- **연락처 블록은 양쪽(선정 PG·구매사)이 동일 컴포넌트**를 쓴다(카드형 + 복사 버튼).
- 미선정 PG에 **CTA 링크는 넣지 않는다**(담백하게). 연락처도 없다.

## 3. 컴포넌트 설계

### 3.1 신규 — `ContactBlock` (`components/deal-room/ContactBlock.tsx`)
선정된 양쪽이 공유하는 담당자 연락처 비주얼. `CounterpartyContactCard`의 알맹이를 대체한다.

- props: `{ contact: DealContact; counterpartyKind: 'buyer' | 'pg' }`
- 렌더: 아바타(이름 첫 글자, tertiary-container 배경) + 이름(굵게) + 상대 구분 칩(`구매사 · {회사}` / `PG · {회사}`) + "담당자" 역할 라벨 + 이메일 행 + 전화 행(값 있을 때만).
- 이메일/전화 각 행 우측에 `CopyButton`. 이메일은 `mailto:`, 전화는 `tel:` 링크 유지(`.md-numeric` 전화).
- 시각: 이메일/전화는 `--md-sys-color-primary` 링크. 칩·라벨은 토큰 사용(DESIGN.md 하드룰 준수, 6px radius, 아바타만 `shape-full`).

### 3.2 신규 — `CopyButton` (`components/deal-room/CopyButton.tsx`)
클라이언트 컴포넌트. `navigator.clipboard.writeText(value)` 후 `toast('복사했어요')`(`lib/toast`). 실패 시 `toast(..., {type:'error'})`. (앱 내 첫 클립보드 복사 패턴 — 신규.)

- props: `{ value: string; label?: string }`
- 접근성: `aria-label="{label} 복사"`, lucide `Copy` 아이콘 + "복사" 텍스트.

### 3.3 신규 — `DealResultHeader` (`components/deal-room/DealResultHeader.tsx`)
선정/미선정 결과 헤더(아이콘 + 제목 + 보조문구 + 본문 children) — 세 화면 공유.

- props: `{ tone: 'award' | 'neutral'; title: string; subtitle?: string; children?: ReactNode }`
- `award`: tertiary 초록 + `CheckCircle`, 제목 16px 굵게. `neutral`: 중립(on-surface 제목 + on-surface-variant 아이콘 `Flag`), 빨강 금지.
- children 영역에 `ContactBlock`(또는 미선정은 children 없음)을 슬롯.

### 3.4 변경 — `PgDealRoomBody` (`components/deal-room/pg/PgDealRoomBody.tsx`)
- 상단의 떠 있는 `CounterpartyContactCard` / `NotSelectedNotice` **제거**.
- `writeContent` 분기 우선순위 재정의:
  1. `pendingRequote` → 기존 RequoteBanner + BidWizard (변경 없음)
  2. **`rfp.status === 'awarded' && !awardedToMe`(미선정)** → `<DealResultHeader tone="neutral" title="이번엔 선정되지 않았어요" subtitle="구매사가 다른 PG를 선정했어요. 보내주신 견적은 잘 전달됐고, 좋은 기회로 다시 만나요." />` + (myBid 있으면 SubmittedSummary). **BidWizard 노출 안 함**(라운드 종료).
  3. **`awardedToMe`(선정)** → `<DealResultHeader tone="award" title="이 견적이 선정됐어요" subtitle="보낸 시각 {submittedAt}"><ContactBlock contact={buyerContact} counterpartyKind="buyer" /></DealResultHeader>` + SubmittedSummary.
  4. `myBid`(제출, 선정 전) → 기존 "✓ 견적을 보냈어요" + SubmittedSummary (변경 없음)
  5. else → BidWizard (변경 없음)
- 미선정인데 myBid가 없을 수 있음(미제출 후 마감) → 결과 헤더만, SubmittedSummary·BidWizard 없음.

### 3.5 변경 — `BuyerDealRoomBody` (`components/deal-room/buyer/BuyerDealRoomBody.tsx`)
- `rfp.status === 'awarded' && awardedPgContact` 슬롯(현 163–167행, **탭 위 상단 유지**)의 `CounterpartyContactCard`를 결과 패널로 교체:
  `<DealResultHeader tone="award" title="{awardedPgContact.workspaceName}를 선정했어요" subtitle="선정 {awardedAt?}"><ContactBlock contact={awardedPgContact} counterpartyKind="pg" /></DealResultHeader>`
- 제안 비교 탭 내용은 그대로(상단 패널 아래에 그대로 노출).

### 3.6 변경 — `pgRequestChip` (`lib/rfp-status.ts`)
awarded 상태 인자 추가:
```ts
pgRequestChip({ pendingRequote, hasBid, awarded?, awardedToMe? })
// awarded && awardedToMe → { '선정됨', 'tertiary' }
// awarded && !awardedToMe → { '선정 마감', 'surface' }
// else → 기존 로직
```
호출처(`app/(app)/inbox/[rfpId]/page.tsx`, `app/(app)/inbox/@modal/(.)[rfpId]/page.tsx`)에서 `awarded: data.rfp.status==='awarded'`, `awardedToMe: data.awardedToMe` 전달. 구매사(`rfpStatusChip`)는 이미 `awarded → 선정 완료`라 변경 없음.

### 3.7 제거
- `CounterpartyContactCard.tsx` + 테스트 — `ContactBlock`로 대체.
- `NotSelectedNotice.tsx` + 테스트 — `DealResultHeader(neutral)`로 대체.

## 4. 데이터 / 로더

봉인입찰 경계는 **변경 없음**. 연락처는 이미 서버 로더가 게이트한다:
- 선정 PG: `buyerContact`는 `awardedToMe`일 때만 부착(`loadPgRfpDetail`).
- 구매사: `awardedPgContact`는 `awarded`일 때만 부착(`loadBuyerRfpDetail`).
- **미선정 PG: 연락처 조회조차 안 함** → 이번 변경도 미선정 분기에 연락처를 절대 만들지 않는다(회귀 테스트로 고정).

### 선정 시각(선택 사항)
award 타임스탬프는 `contracts.awardedAt`에 있음(RFP 아님). 
- **PG 선정 헤더**: `myBid.submittedAt`("보낸 시각")만 사용 — 추가 조회 불필요.
- **구매사 선정 헤더**: "선정 {날짜}"를 보이려면 `loadBuyerRfpDetail`에서 contract `awardedAt` 1건을 추가 부착(`awardedAt: string | null`).
- **폴백**: contract 조회가 번거로우면 구매사도 보조문구를 생략한다(필수 아님). 시각 줄 유무는 비교 화면 가치에 영향 없음.

## 5. 안전 / 봉인입찰 가드 (회귀 테스트)

- 미선정 PG 페이로드에 `buyerContact === null`이고, `DealResultHeader(neutral)`는 `ContactBlock`을 렌더하지 않는다(이메일/전화 문자열 부재 단언).
- 선정 PG는 구매사 연락처만, 구매사는 선정 PG 연락처만 노출(상호 노출, 제3 PG 신원 비노출 — 기존 불변식 유지).
- `pgRequestChip(awarded && !awardedToMe)`가 승자 신원을 노출하지 않음(라벨 `선정 마감`만).

## 6. TDD 계획 (RED → GREEN, 프로젝트 하드룰)

| 대상 | 핵심 단언 |
|---|---|
| `CopyButton` | 클릭 → `navigator.clipboard.writeText(value)` 호출 + 성공 toast (clipboard mock) |
| `ContactBlock` | 이름·이메일·전화·상대 칩 렌더, 전화 null이면 전화 행 없음, mailto/tel href |
| `DealResultHeader` | `award`=초록 체크+제목, `neutral`=중립(초록/빨강 클래스 부재), children 슬롯 |
| `PgDealRoomBody` | awardedToMe→결과 헤더+ContactBlock+SubmittedSummary; 미선정→중립 헤더+연락처 부재+BidWizard 부재; 떠 있는 카드 부재 |
| `BuyerDealRoomBody` | awarded→"{PG}를 선정했어요" 결과 패널+ContactBlock; 비awarded→없음 |
| `pgRequestChip` | 선정됨/선정 마감/기존 분기 |

시각/스타일만인 부분은 TDD 면제 가능하나, **분기·상태가 얽힌 PgDealRoomBody/pgRequestChip은 테스트 필수**.

## 7. 문서

- `SCREEN_DESIGN.md` — 딜룸 "선정 후 담당자 연락처" 섹션을 「결과 통합형」(결과 헤더 + ContactBlock, 미선정 중립 헤더)으로 갱신(PR#303에서 등록된 항목 수정).

## 8. 범위 밖 (YAGNI)

- 구매사 비교 화면 자체 재설계(상단 패널만 추가, 비교 UI 불변).
- 미선정 PG의 오픈 게시판 재참여 CTA(명시적 제외).
- 채팅/메시지 변경 없음. 알림·이메일 변경 없음. 신규 DDL 없음.

## 9. 영향 파일 요약

신규: `ContactBlock.tsx`, `CopyButton.tsx`, `DealResultHeader.tsx` (+각 테스트)
변경: `PgDealRoomBody.tsx`, `BuyerDealRoomBody.tsx`, `lib/rfp-status.ts`, `app/(app)/inbox/[rfpId]/page.tsx`, `app/(app)/inbox/@modal/(.)[rfpId]/page.tsx`, (선택) `lib/server/rfp-detail-loader.ts`, `SCREEN_DESIGN.md`
제거: `CounterpartyContactCard.tsx`, `NotSelectedNotice.tsx` (+테스트)
DDL: 없음. 신규 env: 없음.
