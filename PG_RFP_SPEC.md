# Supporter B · PG 비공개 RFP 플랫폼 — Design Spec (v0)

> **피벗 노트**: 본 spec 은 기존 일반 B2B 제안 시스템(`SCREEN_DESIGN.md`·`DESIGN.md`·`SPEC.md`·`IMPLEMENTATION.md`)에서 **PG(결제대행사) 도메인 특화**로 좁힌 v0 디자인. 일반 시스템의 IA·디자인 시스템·인증 흐름은 베이스로 유지되되, 도메인 객체·핵심 시나리오·결재 흐름은 본 spec 으로 대체된다.

> 짝 문서: [SCREEN_DESIGN.md](./SCREEN_DESIGN.md) · [DESIGN.md](./DESIGN.md) · [SPEC.md](./SPEC.md) · [IMPLEMENTATION.md](./IMPLEMENTATION.md)

---

## 1. 한 줄 요약

**Supporter B** 은 구매사가 (선택) 사업자번호 자동 enrichment 와 함께 RFP 를 작성해 본인이 허용한 PG 들에게 이메일로 발송하고, PG 는 가입 강제 워크스페이스 안에서 정형 제안을 제출하며, 구매사는 6개 정형 수치 + PDF 첨부로 비교한 뒤 선택하는 **비공개 1:N RFP 플랫폼**이다. 사업자번호·등급은 옵셔널 — 법인 미설립 사전 제안과 마감 압박 시 보완 입력 두 시나리오를 모두 지원한다.

마켓플레이스가 아니라 **이메일 기반 비공개 입찰** — 구매사가 이미 아는 PG 영업담당에게만 RFP 가 도달하고, PG 들은 서로의 존재를 모른다.

---

## 2. 핵심 사용자

| 사용자 | 워크스페이스 | 핵심 액션 |
|---|---|---|
| 구매사 (영업·재무·대표) | `buyer` 영구 | RFP 작성·발송·비교·계약. 연간 누적·재계약 관리 |
| PG 영업담당 | `pg` 워크스페이스 (가입 시 이름 입력 — 토스페이먼츠 등) | RFP 수신 → 제안 작성 → 제출 |

v0 결재선 양측 모두 적용 X — 단일 결정자.

---

## 3. 15개 확정 정책 (브레인스토밍 결과)

| # | 결정 |
|---|---|
| 1 | 사용자 = PG영업담당 + 구매사 양면 |
| 2 | 구조 = 1:N **비공개** 입찰 (마켓플레이스 X) |
| 3 | RFP 정형성 = **자유서술** + (선택) 사업자번호 자동 enrichment |
| 4 | 사업자번호 자동 조회 = **선택 입력 시** RFP 작성 중 NTS(국세청) 조회 (NICE/공정위 v0 제외). 미입력 RFP는 사전 제안 또는 보완 예정으로 발송 가능 |
| 5 | 가맹점 등급 = **카드 우대수수료 등급** (영세/중소1·2·3/일반) |
| 6 | 등급 = **사용자 직접 선택, 옵셔널**. 미입력 RFP는 PG 가 일반 등급 가정으로 9개 카드사 직접 제안 |
| 7 | 매칭 = 구매사가 **검색·선택한 PG 워크스페이스**에게만 (`allowedPgWorkspaceIds` — 가입된 PG ws 목록 중 다중 선택) |
| 8 | RFP 별 **고유 URL + 토큰** (메일 임베드, 제안 제출용) |
| 9 | PG 진입 = **가입 강제** (PG 워크스페이스 안에서 제안 작성) |
| 10 | 익명 정책 = **완전 비공개** (PG 는 경쟁자 존재를 모름) |
| 11 | PG 워크스페이스 정체성 = **사용자가 가입 시 입력한 이름** (가입자는 새 ws 생성 또는 기존 ws 합류를 명시적으로 선택). RFP 접근권은 **초대된 PG 워크스페이스에 소속된 모든 멤버**에게 부여 (2026-05-20 정책 변경 — 도메인 자동 라우팅 폐기) |
| 12 | PG 응답 = 자유 PDF + **6개 정형 수치** (등급별 셋) |
| 13 | 구매사 워크스페이스 = **영구** |
| 14 | 수익 모델 = v0 미결정 (풀 우선) |
| 15 | 결재선 = v0 양측 모두 미적용 |

---

## 4. 도메인 모델

### 4.1 핵심 객체

```ts
type Workspace = {
  id: string;
  type: 'buyer' | 'pg';
  name: string;                   // pg: 가입자가 입력한 회사명 (v0 도메인 컬럼 없음 — `lib/db/schema/workspaces.ts`)
  bizProfile?: BizProfile;        // buyer 의 사업자정보
  members: User[];
  createdAt: string;
};

// 슬림화 (M8 적용 완료): name/ceoName/ksic/mailOrderNo/estimatedRevenue/revenueYear/niceLookedUpAt 제거.
// 회사명은 Workspace.name 사용. NICE/공정위는 v0 제외.
// bizNo·grade 모두 옵셔널 — 둘 다 NULL 인 row 는 의미 없으므로 DB CHECK 로 금지(`bizNo IS NOT NULL OR grade IS NOT NULL`).
type BizProfile = {
  bizNo?: string;                 // 옵셔널. NTS 조회 시 채움.
  taxType?: 'general' | 'simple' | 'exempt';
  status?: 'active' | 'suspended' | 'closed';
  // 등급 (카드 우대수수료) — 옵셔널
  grade?: 'small' | 'sme1' | 'sme2' | 'sme3' | 'general';
  gradeSource: 'user_confirmed' | 'user_overridden' | 'unset';
  gradeConfirmedBy?: string;
  gradeConfirmedAt?: string;
};

type RFP = {
  id: string;                     // RFP-2605-0001
  buyerWsId: string;
  bizProfile?: BizProfile;        // 발송 시점 스냅샷. 사업자번호·등급 모두 미입력 시 undefined.
  title: string;
  memo: string;                   // 자유 서술 RFP
  rfpFiles: Attachment[];
  allowedPgWorkspaceIds: string[]; // 구매사가 검색·선택한 PG 워크스페이스 ID 목록
  deadline: string;
  status: 'draft' | 'sent' | 'closed' | 'cancelled' | 'awarded';
  awardedBidId?: string;
  createdBy: string;
  createdAt: string;
  sentAt?: string;
};

type Invitation = {
  id: string;
  rfpId: string;
  pgWsId: string;                 // 발송 대상 PG 워크스페이스 (FK, notNull)
  acceptedByUserId?: string;      // 첫 클레임자 감사용. 접근권은 pgWsId 단위.
  uniqueToken: string;            // URL 임베드 — 원문은 발송 시점에만 사용, 저장은 `tokenHash`만
  sentAt: string;
  openedAt?: string;
  expiresAt: string;              // = RFP.deadline
  status: 'pending' | 'opened' | 'accepted' | 'declined' | 'expired';
};

type Bid = {
  id: string;
  rfpId: string;
  pgWsId: string;
  invitationId: string;
  // 등급별 정형 6필드 (영세/중소 공통)
  settleCycle: 'D+0' | 'D+1' | 'D+2' | 'weekly' | 'monthly';
  deposit: number;
  setupFee: number;
  monthlyMin: number;
  bankTransferFeePct: number;
  easyPayFeePct: number;
  // 일반등급 추가 (옵션)
  cardFeesByIssuer?: Record<'BC'|'SHINHAN'|'SAMSUNG'|'HYUNDAI'|'KB'|'LOTTE'|'NH'|'HANA'|'WOORI', number>;
  overseasCardFeePct?: number;
  proposalPdf: Attachment;
  memo?: string;
  status: 'draft' | 'submitted' | 'withdrawn';     // PG 라이프사이클
  submittedBy: string;
  submittedAt?: string;
  // 구매사 칸반 분류. status 와 독립 — 자동 전이/award 흐름 무관.
  buyerStage?: 'pending' | 'negotiating' | 'decided';
};

// Bid 별 구매사 협상 메모. 수동 입력 only — Bid 변경 자동 diff/stage 자동 로그
// 절대 생성하지 않음 (§7).
type BidNote = {
  id: string;
  bidId: string;
  authorId: string;                 // buyer ws member
  body: string;                     // 0~2000 chars
  attachments: Attachment[];        // image/* | application/pdf
  createdAt: string;
};

type Contract = {
  id: string;
  rfpId: string;
  bidId: string;
  awardedAt: string;
  awardedBy: string;
};
```

### 4.2 카드 우대수수료 (자동 표시, PG 입력 불필요)

```ts
const STATUTORY_CARD_FEE: Record<Grade, number> = {
  small:   0.005,   // 영세 (≤3억)
  sme1:    0.011,   // 중소1 (3~5억)
  sme2:    0.0125,  // 중소2 (5~10억)
  sme3:    0.015,   // 중소3 (10~30억)
  general: NaN,     // 일반 — PG 가 카드사별 입력
};
// 등급 미입력 RFP 는 일반 등급(NaN)과 동일 분기 — PG 가 9개 카드사별 직접 입력.
// 서버 강제: grade ∈ {'general', null} 일 때만 cardFeesByIssuer 허용.
```

---

## 5. 화면 IA

### 5.1 공통 (인증/온보딩)

| # | 라우트 | 역할 |
|---|---|---|
| C1 | `/login` | 이메일+비밀번호 |
| C2 | `/signup` | 이메일 인증 → 프로필 → **워크스페이스 선택** (구매사 신규 / PG 신규 / 초대 합류) |
| C3 | `/invite/rfp/:token` | RFP 초대 메일 링크 진입점. 토큰 검증 → 기 가입자는 로그인 후 인박스, 미가입자는 가입 funnel(`/signup/pg/verify`) → RFP 수신함 |
| C4 | `/logout` | |

### 5.2 구매사 워크스페이스

| # | 라우트 | 역할 |
|---|---|---|
| B1 | `/home` | 대시보드 — 진행 중 RFP 카운트, 임박 마감, 받은 제안, 최근 활동 |
| B2 | `/rfp` | 전체 RFP (탭: 작성중 / 진행중 / 마감 / 계약완료) |
| B3 | `/rfp/new` | **RFP 작성** — ① (선택) 사업자번호 자동조회 ② (선택) 등급 선택 ③ 자유 메모·RFP 첨부 ④ PG 이메일 입력 ⑤ 마감일·발송 |
| B4 | `/rfp/:id` | **RFP 상세 + 받은 제안 비교** — 좌: RFP 메타·발송 PG 상태 / 우: 6컬럼 비교표 + PDF 라이브 프리뷰. **`[ 표 ] [ 보드 ]` 토글**로 칸반(진행전/협상중/결정 3컬럼) 전환 가능 — 카드 클릭 시 상세 모달(PDF + 6수치 + 메모/첨부 히스토리). 칸반 분류는 buyer 내부 라벨링이며 award 흐름과 독립. |
| B5 | `/rfp/:id/award` | 수주 처리 — Bid 선택 → 미선택 PG 자동 통보 |
| B6 | `/settings/profile` | 사업자 프로필 (등급 갱신 알림) |
| B7 | `/settings/members` | 워크스페이스 멤버 |

### 5.3 PG 워크스페이스

| # | 라우트 | 역할 |
|---|---|---|
| P1 | `/home` | 대시보드 — 신규 RFP·임박 마감·제출 완료·수주율 |
| P2 | `/inbox` | **받은 RFP 함** (탭: 신규 / 작성중 / 제출완료 / 마감) |
| P3 | `/inbox/:rfpId` | **RFP 상세 + 제안 작성** — 상단: 구매사 메타·등급·RFP. 하단: 등급별 정형 폼(영세/중소 6필드, 일반 +카드사 9개). 법정 카드수수료는 자동 표시. **사업자번호 미입력 RFP 는 상단 배너로 안내, 등급 미입력 시 일반 폴백(9개 카드사 입력 모드).** |
| P4 | `/inbox/:rfpId/submitted` | 제출 완료·결과 대기 |
| P5 | `/settings/profile` | PG 회사 정보 (도메인 검증·로고) |
| P6 | `/settings/members` | 같은 워크스페이스 멤버 |

---

## 6. 핵심 사용자 시나리오 (v0 검증)

### 시나리오 A — 구매사 RFP 발송 (정식)
1. `/rfp/new` 진입
2. 사업자번호 `123-45-67890` 입력 → NTS 조회로 `taxType`·`status` 자동 채움
3. 등급 선택 (5단계 라디오): "중소2" 확정 → `gradeSource='user_confirmed'`
4. 제목 `2026 결제 인프라 제안`, 자유 메모·RFP PDF 첨부
5. PG 워크스페이스 검색·선택 (Popover + 검색 입력): `토스페이먼츠`, `KG이니시스`, `NICE페이먼츠`
6. 마감 D+7 → 발송
7. 선택한 3개 PG 워크스페이스의 멤버들에게 메일 발송 + RFP 상태 → `진행중`

### 시나리오 A' — 구매사 RFP 발송 (사업자번호 미입력)
1. `/rfp/new` 진입 (워크스페이스 bizProfile 없음 또는 RFP별 스킵)
2. 사업자번호 스킵, 등급 스킵
3. 제목·자유 메모·RFP PDF 첨부
4. PG 워크스페이스 검색·선택 + 마감 → 발송
5. RFP 는 `bizProfile=undefined` 스냅샷으로 저장. PG 수신 시 "사업자번호 미입력" 배너 노출
6. **용도**: 법인 미설립 사전 제안 / 마감 압박 시 보완 입력 (발송 후 보완은 v1)

### 시나리오 B — PG 제안 응답
1. 토스 영업담당 메일함: `노온 → 토스페이먼츠 RFP #abc123` 수신
2. [수락·제안 작성] → 토큰 검증 → 기 가입자는 `/login`(next 보존) 후 인박스로, 미가입자는 `/signup/pg` funnel로 분기
3. 가입 시 워크스페이스 이름 입력 (이미 토스페이먼츠 ws 존재 시 그 ws에 합류 신청 / 신규 ws 생성 선택)
4. `/inbox/abc123` 자동 이동
5. 구매사 메타 확인 → 분기:
   - 등급 있음(예: 중소2) → 카드 1.25% 자동·수정 불가
   - **등급 미입력 RFP → "등급 미정 — 일반 가정으로 제안" 안내 + 9개 카드사 직접 입력 모드 활성**
   - **사업자번호 미입력 RFP → 상단 헤어라인 배너 "사업자번호 미입력 — 사전 제안 또는 보완 예정"**
6. 정형 폼: 정산 D+1 / 보증금 0 / 셋업비 0 / 월최저 0 / 계좌 1.5% / 간편결제 1.8%
7. 제안서 PDF + 메모 → [제출] → 구매사 알림

### 시나리오 C — 구매사 비교·계약
1. `/rfp/abc123` → 받은 Bid 3개 비교표
2. 6컬럼 정렬 (정산↑) + 각 행 PDF 라이브 프리뷰
3. (옵션) `[ 보드 ]` 토글 → 칸반 뷰. 카드 드래그 또는 ⋯ 메뉴로 토스를 `협상중` → `결정`으로 이동. 카드 클릭으로 상세 모달 열어 협상 메모·스크린샷 누적.
4. 토스 Bid 선택 → [수주 처리]
5. 토스에 "수주 확정" 메일, 미선택 2곳에 "이번엔 다른 PG 선택" 메일
6. RFP 상태 → `계약완료`, Contract 레코드 생성. 보드 재진입 시 awarded 카드는 `결정` 컬럼으로 자동 잠금.

---

## 7. 디테일 정책 (default — 사용자 리뷰에서 조정)

| 항목 | v0 기본 정책 |
|---|---|
| **토큰 유효기간** | RFP 마감일까지. 마감 후 자동 만료. 다회 접근 가능. |
| **토큰 1회용 여부** | 토큰은 첫 인증 1회만 통과(`acceptedByUserId` 세팅 = 감사용). RFP 접근권은 **초대된 PG 워크스페이스에 소속된 모든 멤버**에게 부여 — 같은 도메인 동료도 같은 RFP를 보고 제안 작성·수정·철회 가능. 동료가 이미 클레임한 token 링크를 다른 멤버가 누르면 자동으로 인박스로 redirect. |
| **RFP 수정** | 발송 후 메모·첨부 수정 가능, PG 에 "RFP 변경됨" 알림. 마감일 연장 가능. PG 워크스페이스 추가만 가능 (제거 불가). |
| **사업자번호 보완** | 발송 전(draft) 까지는 RFP 작성 화면에서 사업자번호·등급 추가 가능. 발송 후 보완은 v1 — 현재는 새 RFP 작성. |
| **RFP 취소** | 가능. 발송된 PG 에 취소 알림. 받은 Bid 는 보관. |
| **재발송** | 동일 PG 워크스페이스에 재발송 불가 (수정·연장으로 처리. `(rfp_id, pg_ws_id)` unique 인덱스로 DB 레벨 차단). |
| **Bid 수정** | 제출 후 마감 전까지 1회 철회·재제출 가능. 구매사 알림. |
| **알림 채널** | 이메일 + 인앱 (탑바 종 알림). v0 SMS·슬랙 미지원. |
| **계약서 서명** | v0 미지원 — 단순 "수주 마킹". 실 계약은 오프라인. |
| **수익 모델** | v0 미정. 데이터 모델은 향후 PG 구독·성사 수수료 모두 수용 가능하게 설계. |
| **권한** | 워크스페이스 관리자(첫 가입자) / 멤버. v0 두 단계만. |
| **Bid 칸반 stage** | buyer 워크스페이스 내부 라벨링 (진행전/협상중/결정). 자동 전이·알림 없음. RFP award 흐름과 독립이며, awarded 후에는 `결정` 컬럼으로 강제 잠금. |
| **Bid 메모/히스토리** | buyer 수동 메모 + 이미지/PDF 첨부만. Bid 변경 자동 diff·stage 전이 자동 로그·시스템 이벤트 기록은 §9 v0 범위 외. |

---

## 8. 기존 4개 프로젝트 문서와의 관계

본 spec 승인 후 다음과 같이 분배 반영:

| 파일 | 변경 |
|---|---|
| `SCREEN_DESIGN.md` | **§0 도메인 컨텍스트(PG 특화)** 추가, §3 화면 명세를 본 §5 IA 로 교체. 기존 결재선·캘린더·템플릿은 v0 범위 외로 마킹. §11.5 인증/가입은 유지하되 워크스페이스 선택 단계(C2)에 buyer/pg 분기 추가. |
| `DESIGN.md` | Korean Editorial Modernism 디자인 시스템 그대로 유지. PG 도메인 특수 컴포넌트(BizLookupField, GradeBadge, CardFeeMatrix, BidComparisonTable, A4PdfPreview) 만 §5 컴포넌트 사양에 추가. |
| `SPEC.md` | §5 도메인 타입을 본 §4 로 교체. §3 디렉토리 구조에 `app/(app)/rfp/`·`app/(app)/inbox/` 추가, 기존 `quote/`·`account/`·`approval/` 는 archive. lib/types 에 `bizProfile.ts`, `rfp.ts`, `bid.ts`, `invitation.ts` 추가. |
| `IMPLEMENTATION.md` | M0~M1.5 유지, M2 이후 마일스톤을 본 spec 의 화면 IA 로 재정렬. 새 마일스톤: M2(구매사 RFP 작성), M3(PG 수신·응답), M4(비교 화면), M5(수주 처리). |

---

## 9. v0 범위 외 (의도적 제외)

- 결재선 (양측 모두 미적용)
- 정산·매출 추적
- 계약서 전자서명
- 결제 연동 (수수료 정산·구독)
- SMS·슬랙·카카오워크 알림
- 모바일 앱
- 영문/일문 i18n
- PG 의 응답 자동 채움 (이전 제안 복제 등)
- 구매사의 입찰 자동 연장·재공고
- 마켓플레이스 발견성·평가·리뷰
- Bid 변경 자동 diff 타임라인 (PG가 가격 재제출 시 자동 기록)
- 칸반 stage 전이 자동 로그·자동 알림

---

## 10. 다음 단계

본 spec 승인 시:
1. 본 spec 을 4개 프로젝트 md 파일에 분배 반영 (§8)
2. 구현 계획 작성: 마일스톤 M2~M5 의 PR 단위·태스크·검증 체크리스트
3. M0 부트스트랩 → M1 AppShell → M1.5 인증 → M2(RFP 작성) → M3(PG 수신/응답) → M4(비교) → M5(수주) 순으로 빌드

---

## 11. 변경 이력

- 2026-05-05 v0.1 — 일반 B2B 제안 시스템 초안.
- 2026-05-05 v0.2 — 인증/가입 §11 추가.
- 2026-05-05 v0.3 — **PG 특화로 피벗**. 15개 정책 확정. 본 spec 으로 분리. v0 범위 압축.
- 2026-05-07 v0.4 — **사업자번호·등급 옵셔널화**. 정책 #3·#4·#6 완화, BizProfile 슬림화 + 모든 식별 필드 옵셔널, 시나리오 A' (사전 제안/보완 예정) 추가, P3 미입력 배너·일반 폴백 명시.
- 2026-05-20 v0.5 — **이메일 allowlist → 워크스페이스 선택 모델**. 정책 #7·#11 재정의, §4 타입(`allowedPgWorkspaceIds`/`pgWsId` notNull, `Workspace.domain` 제거), §6 시나리오 A·A'·B에 워크스페이스 검색 UI + 명시적 가입 funnel 반영. `outbox_entries`·`notifications` 스키마 정규화는 `NOTIFICATION.md §B` 참조.
