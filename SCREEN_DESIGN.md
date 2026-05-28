# Supporter B PG RFP 화면 설계

## Context

본 문서는 PG(결제대행사) 비공개 1:N RFP 플랫폼 **Supporter B** 의 화면 설계 명세이다.

본 문서 **§0 PG v0 화면 IA** 가 v0 제품 정의이자 구현 대상의 최상위 기준이다 (레거시 `PG_RFP_SPEC.md` 는 제거됨 — 제품 규칙은 아래 "확정 결정" 블록 + 코드·테스트가 캐노니컬).

**왜 만드는가**
- 구매사가 이미 아는 PG 영업담당에게만 RFP를 보내고, PG가 서로의 존재를 모르는 private 1:N 입찰을 만든다.
- 사업자번호 enrichment, 카드 우대수수료 등급, 6개 정형 수치를 한 화면에서 비교해 결제 인프라 선택 시간을 줄인다.
- 초대 이메일의 고유 URL이 첫 진입 경로이므로 인증·가입·워크스페이스 라우팅이 RFP 흐름과 끊기지 않아야 한다.

**확정 결정 (v0 제품 정의 — 본 절이 캐노니컬 기준)**
- 메인 IA: 홈 / RFP / 받은 RFP / 설정
- RFP 작성 워크플로우: **(선택)** 사업자번호 조회 → **(선택)** 등급 확인 → 자유 메모·첨부 → PG 워크스페이스 검색·선택 → 발송 (사업자번호·등급 모두 옵셔널)
- PG 응답 워크플로우: 초대 URL → 가입/로그인 → 워크스페이스 이름 입력(신규) 또는 기존 합류 → 정형 Bid 제출
- v0 결재선 없음. 승인 UI를 만들지 않는다.

---

## 0. PG v0 화면 IA (구현 대상)

### 0.1 Route Map

```
Public
├─ /login
├─ /signup                       (Rs1 — 가입 유형 선택)
├─ /signup/buyer                 (Bs1 — 구매사 이메일)
├─ /signup/buyer/verify          (Bs2)
├─ /signup/buyer/profile         (Bs3)
├─ /signup/buyer/workspace       (Bs4)
├─ /signup/pg                    (Gs1 — PG사 이메일)
├─ /signup/pg/verify             (Gs2)
├─ /signup/pg/biz                (Gs — 사업자번호 조회)
├─ /signup/pg/profile            (Gs3)
├─ /signup/pg/workspace          (Gs4)
├─ /password/forgot
├─ /password/reset
├─ /auth/verify
├─ /auth/email-change
├─ /invite                       (토큰 없는 진입 안내)
├─ /invite/rfp/:token
├─ /invite/workspace/:token
├─ /share/rfp/:token
├─ /share/workspace/:token
├─ /pending-approval
└─ /suspended

Authenticated AppShell
├─ /home
├─ /rfp
│  ├─ /rfp/new
│  ├─ /rfp/:id
│  └─ /rfp/:id/award
├─ /inbox
│  ├─ /inbox/:rfpId
│  └─ /inbox/:rfpId/submitted
├─ /notifications
├─ /workspace/new
└─ /settings
   ├─ /settings/profile
   ├─ /settings/members
   └─ /settings/notifications

Admin console (별도 top-level 트리, role-guard in admin/(protected)/layout.tsx)
├─ /admin/login
└─ /admin                        (protected — 대시보드 index)
   ├─ /admin/buyers   · /admin/buyers/:id
   ├─ /admin/sellers  · /admin/sellers/:id
   ├─ /admin/rfps     · /admin/rfps/:id
   ├─ /admin/review   · /admin/review/:id
   └─ /admin/audit-log
```

### 0.2 Buyer Workspace Screens

| # | Route | Purpose | Primary Components |
|---|---|---|---|
| B1 | `/home` | 진행 중 RFP, 임박 마감, 받은 Bid, 최근 활동 | `KpiStrip`, `DeadlineWidget`, `RfpProgressWidget`, `NotificationWidget` |
| B2 | `/rfp` | RFP 목록. 작성중/진행중/마감/계약완료 탭 | `RfpList`, `DataTable`, `Tag` |
| B3 | `/rfp/new` | 사업자 조회 (선택), 등급 확인 (선택), RFP 첨부, PG 워크스페이스 검색·선택, 발송 | `BizLookupField`, `GradeConfirmPanel`, `RfpCreateForm` (인라인 Popover+cmdk PG 검색), `RfpAttachmentDropzone` |
| B4 | `/rfp/:id` | RFP 상세 + 받은 Bid 비교 + PDF 프리뷰. 표↔보드 토글로 칸반(진행전/협상중/결정) 전환, 카드 모달에 메모/첨부 히스토리 누적 | `InvitationStatusPanel`, `BidComparisonView`, `BidComparisonTable`, `BidViewToggle`, `BidBoard`, `BidBoardCard`, `BidDetailModal`, `ProposalPdfPreview` |
| B5 | `/rfp/:id/award` | Bid 선택, 계약 레코드 생성, 선택/미선택 PG 통보 | `AwardFlow`, `DecisionTimeline` |
| B6 | `/settings/profile` | 구매사 사업자 프로필과 등급 갱신 상태 | `WorkspaceProfileForm` |
| B7 | `/settings/members` | buyer 워크스페이스 멤버 관리 | `MemberTable` |

### 0.3 PG Workspace Screens

| # | Route | Purpose | Primary Components |
|---|---|---|---|
| P1 | `/home` | 신규 RFP, 임박 마감, 제출 완료, 수주율 | `KpiStrip`, `DeadlineWidget`, `RfpProgressWidget` |
| P2 | `/inbox` | 받은 RFP 함. 신규/작성중/제출완료/마감 탭 | `InboxList`, `DataTable`, `Tag` |
| P3 | `/inbox/:rfpId` | 구매사 메타·등급(있으면)·RFP 확인 + 정형 Bid 작성. 사업자번호 미입력 시 안내 배너. 등급 미입력 시 일반 폴백(9개 카드사 입력) | `RfpBriefPanel`, `BidForm`, `StatutoryCardFeeNotice` |
| P4 | `/inbox/:rfpId/submitted` | 제출 완료, 결과 대기, 수정/철회 정책 안내 | `SubmittedState` |
| P5 | `/settings/profile` | PG 회사 정보 (워크스페이스 이름·연락처) | `WorkspaceProfileForm` |
| P6 | `/settings/members` | 같은 워크스페이스 멤버 관리 (도메인 자동 합류 없음 — 초대만) | `MemberTable` |

> 칸반 뷰 컬럼: 구매사 `작성중 / 진행중 / 계약완료 / 마감`(4, 표 탭과 동일), PG `신규 / 작성중 / 제출완료 / 낙찰 / 실패`(5 — 표 탭 `마감`을 보드에서 `낙찰`/`실패`로 분리).

### 0.4 Core Flow Diagrams

```
Buyer RFP
/rfp/new
  ├─ (선택) bizNo 입력 → NTS lookup → taxType/status 표시
  ├─ (선택) grade 5단계 라디오 선택 → gradeSource='user_confirmed'
  ├─ memo + RFP PDF 첨부
  ├─ PG 워크스페이스 검색·선택 (Popover + cmdk Command)
  └─ send → Invitation(per pgWsId) + outbox email(per ws admin)
        └─ bizNo·grade 모두 미입력 시 bizProfile=undefined 스냅샷
```

```
PG Entry
email unique URL
  ├─ /invite/rfp/:token 검증
  ├─ 기 가입자 → /login(next 보존) 후 /inbox/:rfpId
  └─ 미가입자 → /signup/pg/verify funnel
        └─ Gs4: 워크스페이스 이름 입력 → 신규 생성 또는 기존 ws 합류 신청
              └─ /inbox/:rfpId → Bid 제출
```

```
Award
/rfp/:id
  ├─ [ 표 ] BidComparisonTable 정렬
  ├─ [ 보드 ] BidBoard (kanban: 진행전/협상중/결정)
  │     ├─ 카드 DnD 또는 ⋯ 메뉴로 stage 이동
  │     └─ 카드 클릭 → BidDetailModal (PDF + 6수치 + 메모/첨부 히스토리)
  ├─ ProposalPdfPreview 확인
  ├─ /rfp/:id/award
  ├─ Contract 생성
  └─ selected/rejected notifications outbox
```

### 0.5 v0 Screen Non-Goals

- 결재선, 결재함, 승인 모달
- 거래처 관리, 전체 담당자, 제안 캘린더, 제안 템플릿
- 상품/카탈로그 설정
- 고객 포털, 모바일 전용 작성 화면

---

## 1. 인증 / 가입 (Public 영역)

구매사(셀러)와 PG사 영업담당은 **처음부터 별도 경로**로 가입한다. 역할 선택 후 각자에게 맞는 컨텍스트와 필드로 진행하며, 단일 P6 워크스페이스 선택 화면은 제거됐다.

> **화면 ID 규칙**: B1~B7 = 구매사 앱 화면, P1~P6 = PG 앱 화면. 가입 전용 ID는 `s` 접미사 사용 — Rs1(역할선택), Bs1~Bs4(구매사 가입), Gs1~Gs4(PG 가입).

### 1.1 진입 경로

- **D · 구매사 신규 가입**: `/signup` → 구매사 카드 선택 → Bs1~Bs4 → `/rfp` (관리자)
- **E · PG 초대 진입**: `/invite/rfp/:token` → (Gs1 건너뜀) → Gs2~Gs4 → `/inbox/:rfpId` (멤버)
- **F · PG 직접 가입**: `/signup` → PG 카드 선택 → Gs1~Gs4 → `/inbox` (멤버)
- **G · 비밀번호 분실**: 로그인 화면에서 재설정 요청 → 메일 → 새 비밀번호

### 1.2 화면 목록

#### 공용 / 인프라

| # | 라우트 | 제목 | 핵심 |
|---|---|---|---|
| — | `/` (비인증) | redirect | → `/login?next=...` |
| — | `/login` | 로그인 | 이메일 + 비밀번호 |
| — | `/auth/verify?token=...` | 인증 처리(스플래시) | 토큰 검증 → workspaceType 분기 후 각 profile로 |
| — | `/password/forgot` | 비밀번호 찾기 | 이메일 → 재설정 링크 |
| — | `/password/reset?token=...` | 비밀번호 재설정 | 새 비밀번호 → 자동 로그인 |
| — | `/invite?token=...` | 초대 수락 | 워크스페이스 멤버 초대 (별도 플로우) |
| — | `/auth/email-change?token=...` | 이메일 변경 확인 | 기존 사용자 이메일 변경 |
| — | `/logout` | 로그아웃 | POST: 세션 클리어 → `/login` |

#### 역할 선택

| # | 라우트 | 제목 | 핵심 |
|---|---|---|---|
| Rs1 | `/signup` | 가입 유형 선택 | 두 카드: 구매사 / PG사. 역할 확정 후 각 플로우로 분기 |

#### 구매사(셀러) 가입 — Bs 시리즈

| # | 라우트 | 스텝 | 핵심 |
|---|---|---|---|
| Bs1 | `/signup/buyer` | `01 / 04 — EMAIL` | 이메일 + 약관. 구매사 컨텍스트 카피 |
| Bs2 | `/signup/buyer/verify` | `01 / 04 — VERIFY` | 인증 대기 + 60초 재발송 |
| Bs3 | `/signup/buyer/profile` | `02 / 04 — PROFILE` | 이름·비밀번호·휴대전화(선택) |
| Bs4 | `/signup/buyer/workspace` | `04 / 04 — WORKSPACE` | 워크스페이스 이름·사업자명·산업 → [만들기] → `/rfp` |

#### PG사 가입 — Gs 시리즈

| # | 라우트 | 스텝 | 핵심 |
|---|---|---|---|
| Gs1 | `/signup/pg` | `01 / 04 — EMAIL` | 이메일 + 약관. PG 컨텍스트. 초대 없이 직접 접근 시 보조 안내 |
| Gs2 | `/signup/pg/verify` | `01 / 03 — VERIFY`* | 인증 대기. 초대 진입 시 이메일 자동 채움 |
| Gs3 | `/signup/pg/profile` | `02 / 03 — PROFILE`* | 이름·비밀번호·휴대전화(선택) |
| Gs4 | `/signup/pg/workspace` | `03 / 03 — WORKSPACE`* | 워크스페이스 이름 입력. 동일명 존재 시 합류 신청 / 신규 생성 분기 → `/inbox` |

> \* 초대 토큰 진입 시 Gs1(이메일 입력) 건너뜀 → 스텝 카운트 03/03. 직접 가입 시 04/04.

### 1.3 화면 명세

#### 로그인 `/login`
- 좌상단 워드마크 `B  Support B` + serial `EDITION 01`
- 중앙 카드 max-w 380, 헤어라인 외곽
- 필드: 이메일(`autocomplete=email`) / 비밀번호(`autocomplete=current-password`, 보기 토글)
- "로그인 유지" 체크박스 (30일 세션)
- 1차 [로그인] full-width
- 보조 링크: `비밀번호를 잊으셨나요?` → `/password/forgot`
- 푸터: `처음 오셨나요? 회원가입 →` → Rs1
- 5회 실패 → 캡차, 10회 → 15분 락
- `next` 쿼리 보존

#### Rs1 가입 유형 선택 `/signup`
- 워드마크 + serial
- 헤드라인: `누구로 시작하시나요?`
- 좌/우 두 카드 (카드 클릭 → 각 플로우 첫 페이지로, `SignupDraft.workspaceType` 설정):
  - **좌: 구매사** — "결제대행사에 제안을 요청합니다" → Bs1
  - **우: PG사 영업담당** — "초대받은 RFP에 제안을 제출합니다" → Gs1
- 푸터: `이미 계정이 있으세요? 로그인 →`
- 기 세팅된 `SignupDraft`(초대 토큰 진입 시) 존재하면 Rs1 건너뜀

#### Bs1 구매사 — 이메일 `/signup/buyer`
- `01 / 04 — EMAIL`
- 헤드라인: `구매사 계정을 만듭니다`
- 이메일 입력, 실시간 형식 검증
- 약관/개인정보(필수 2종) + 마케팅(선택), 전체 동의 토글
- 1차 [인증 메일 받기]
- 푸터: `이미 계정이 있으세요? 로그인 →`

#### Bs2 구매사 — 인증 대기 `/signup/buyer/verify`
- `01 / 04 — VERIFY`
- 헤드라인: "{이메일}로 인증 메일을 보냈습니다."
- 안내: "메일의 [인증하기] 버튼을 눌러주세요. **5분 내 만료**됩니다."
- 보조: `재발송 (00:60)` 카운트다운 / `다른 이메일로 변경`
- 봉투 라인 SVG (1.4 stroke)

#### Bs3 구매사 — 프로필 `/signup/buyer/profile`
- `03 / 04 — PROFILE`
- 필드: 이름 / 비밀번호 / 비밀번호 확인 / 휴대전화(선택, `010-####-####`)
- 비밀번호 강도 4칸 헤어라인 (1=terracotta / 2=amber / 3=lavender / 4=moss)
- 정책 캡션 mono uppercase: `MIN 10 · A-Z · 0-9 · !@#`
- 1차 [다음]

#### Bs4 구매사 — 워크스페이스 생성 `/signup/buyer/workspace`
- `04 / 04 — WORKSPACE`
- 헤드라인: `구매사 워크스페이스를 만듭니다`
- 필드: 워크스페이스 이름 / 사업자명(선택) / 산업 드롭다운
- 제안 번호 규칙 안내: `Q-{YY}{MM}-{####}` (변경 불가, 고정값)
- 1차 [만들기] → `Workspace.type='buyer'` 생성 → `/rfp` (관리자)

#### Gs1 PG사 — 이메일 `/signup/pg`
- `01 / 04 — EMAIL`
- 헤드라인: `PG사 계정을 만듭니다`
- 이메일 입력 + 약관 동의 (Bs1과 동일 패턴)
- 보조 안내: "초대 이메일을 받으셨나요? — 메일의 링크를 클릭하면 이 단계가 자동으로 건너뛰어집니다."
- 푸터: `이미 계정이 있으세요? 로그인 →`

#### Gs2 PG사 — 인증 대기 `/signup/pg/verify`
- `01 / 03 — VERIFY` (초대 진입) 또는 `02 / 04 — VERIFY` (직접 가입)
- Bs2와 동일 패턴
- 초대 토큰 진입 시: 이메일 필드 자동 채움 + 인증 메일 즉시 발송

#### Gs3 PG사 — 프로필 `/signup/pg/profile`
- `02 / 03 — PROFILE` 또는 `03 / 04 — PROFILE`
- Bs3과 동일 필드/패턴

#### Gs4 PG사 — 워크스페이스 입력 `/signup/pg/workspace`
- `03 / 03 — WORKSPACE` 또는 `04 / 04 — WORKSPACE`
- 헤드라인: `워크스페이스를 선택하세요`
- 입력 필드: 회사명 (예: "서포터 B 페이") — 직접 입력
- 동작 분기:
  - 입력 이름과 동일한 `Workspace.type='pg'`가 이미 존재 → "이미 등록된 워크스페이스가 있습니다. 합류 신청을 보내시겠어요?" → [합류 신청]
  - 신규 → [워크스페이스 만들기] → `Workspace.type='pg'` 신규 생성 + 본인이 첫 admin → `/inbox` (초대 있으면 `/inbox/:rfpId`)
- 도메인 자동 라우팅 없음 — 이름 입력만으로 합류/생성을 결정.

#### 인증 처리 스플래시 `/auth/verify?token=...`
- 모노 `LOADING…` 한 줄
- 결과 분기:
  - 성공 + `workspaceType='buyer'` → Bs3 자동 이동
  - 성공 + `workspaceType='pg'` → Gs3 자동 이동
  - 만료 → "링크가 만료되었습니다." + [재발송] 버튼 (각 verify 페이지로)
  - 무효 → "잘못된 링크입니다." + 로그인 링크
  - 이미 사용됨 → 로그인 안내

#### 비밀번호 찾기 `/password/forgot`
- 이메일 입력 → 1차 [재설정 링크 받기]
- 발송 후 인증 대기 패턴 (60초 재발송)
- 미가입 이메일도 동일 안내 (정보 노출 회피)

#### 비밀번호 재설정 `/password/reset?token=...`
- 새 비밀번호 + 확인 + 강도 인디케이터
- 토큰 만료 시: "링크가 만료되었습니다." + 재요청 버튼
- 완료 → 자동 로그인 → `/home`

#### 초대 수락 `/invite?token=...`
- 헤드라인: "{초대자}님이 **{워크스페이스명}**에 초대했습니다."
- 워크스페이스 카드: 약자 아바타 · 이름 · 멤버 수 · 산업
- 분기:
  - 미가입 이메일 → [가입하고 합류] → Bs3 또는 Gs3 (워크스페이스 타입에 따라)로 이동, 이메일 자동 채움
  - 가입된 이메일 → [로그인 후 합류] → `/login?next=/invite?token=...`
- 보조: `거절하기`

#### 이메일 변경 확인 `/auth/email-change?token=...`
- 토큰 검증 → "이메일이 {new}로 변경되었습니다." 안내 + 자동 재로그인 요청
- 만료/무효 분기 동일

#### 로그아웃 `/logout`
- POST 핸들러: 세션 쿠키 삭제 → `/login` redirect
- GET 진입 시 `/login` 으로 (CSRF 회피)

### 1.4 시나리오 (Verification)

**시나리오 D — 구매사 신규 가입(셀프서비스)**
1. `/login` → `회원가입` → Rs1 역할 선택 → "구매사" 카드
2. Bs1 이메일 + 약관 동의 → [인증 메일 받기]
3. Bs2 대기 → 이메일 토큰 URL → `/auth/verify` 스플래시 → Bs3 자동 이동
4. 프로필 입력 → Bs4 워크스페이스 이름·산업 → [만들기] → `/rfp` (관리자)

**시나리오 E — PG 초대 진입**
1. `/invite/rfp/:token` 진입 — `SignupDraft` 선 채움 (workspaceType='pg', email, rfpInviteToken)
2. Rs1 건너뜀 → Gs2 인증 대기 (이메일 자동 채움, 메일 즉시 발송)
3. 이메일 토큰 → Gs3 프로필 → Gs4 워크스페이스 자동 합류 확인 → [합류하기] → `/inbox/:rfpId`

**시나리오 F — PG 직접 가입**
1. `/signup` → Rs1 → "PG사 영업담당" 카드 → Gs1 이메일
2. Gs2 → Gs3 → Gs4 → [합류하기] → `/inbox`

**시나리오 G — 비밀번호 분실**
1. `/login` → `비밀번호를 잊으셨나요?` → `/password/forgot`
2. 이메일 토큰 → `/password/reset` → 새 비밀번호 → 자동 로그인 → `/home`

### 1.5 `/invite/rfp/:token` → PG 플로우 핸드오프

PG 영업담당의 1차 진입 경로. 토큰 검증 후 인증 상태에 따라 분기:

- **Case A** — 이미 인증됨 + 이메일 일치: token claim → `/inbox/:rfpId`
- **Case B** — 이미 인증됨 + 이메일 불일치: "다른 계정으로 로그인이 필요합니다" + [로그아웃 후 재시작]
- **Case C** — 미인증: `SignupDraft` 선 채움 (`workspaceType='pg'`, `email`, `rfpInviteToken`) → Gs2로 redirect (Rs1·Gs1 건너뜀, 이메일 자동 채움)

### 1.6 본 절 범위 외
- SSO (Google/네이버/카카오) — 후속
- SAML/SCIM (엔터프라이즈) — 별도 스펙
- 2FA (TOTP/SMS) — 후속
- 디바이스 신뢰 / 의심 로그인 알림 — 후속
- 회사 도메인 자동 합류 — v1 옵션 기능, 본 v0 범위 외
- 감사 로그 — 백엔드 영역

> 시각 디자인 규칙은 [DESIGN.md](./DESIGN.md) 참조. 도메인 타입·검증·라우팅 가드는 코드가 캐노니컬 — `lib/` Server Actions + zod 스키마, 인증 가드는 `app/(app)/layout.tsx` 의 서버 redirect 참조.
