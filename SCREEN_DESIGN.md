# Supporter B PG RFP 화면 설계

## Context

본 문서는 PG(결제대행사) 비공개 1:N RFP 플랫폼 **Supporter B** 의 화면 설계 명세이다.

본 문서 **§0 PG v0 화면 IA** 가 v0 제품 정의이자 구현 대상의 최상위 기준이다 (레거시 `PG_RFP_SPEC.md` 는 제거됨 — 제품 규칙은 아래 "확정 결정" 블록 + 코드·테스트가 캐노니컬).

> **용어 주의**: 이 문서는 내부 개념어로 **`RFP`/`Bid`** 를 쓰지만, **사용자에게 보이는 실제 화면 라벨은 '견적' 언어**(견적 요청·견적·선정 등)다. 화면 문구는 `UX_WRITING.md` §8 도메인 용어집을 따른다 (예: 이 문서의 "받은 RFP" 화면 = 실제 라벨 "받은 견적 요청", "계약완료" 탭 = "선정 완료"). 랜딩/마케팅만 '경쟁 입찰' 프레이밍 유지.

**왜 만드는가**
- 구매사가 이미 아는 PG 영업담당에게만 RFP를 보내고, PG가 서로의 존재를 모르는 private 1:N 입찰을 만든다.
- 사업자번호 enrichment, 카드 우대수수료 등급, 6개 정형 수치를 한 화면에서 비교해 결제 인프라 선택 시간을 줄인다.
- 초대 이메일의 고유 URL이 첫 진입 경로이므로 인증·가입·워크스페이스 라우팅이 RFP 흐름과 끊기지 않아야 한다.

**확정 결정 (v0 제품 정의 — 본 절이 캐노니컬 기준)**
- 메인 IA: 홈 / RFP / 받은 RFP / 설정
- RFP 작성 워크플로우: **(선택)** 사업자번호 조회 → **(선택)** 등급 확인 → 자유 메모·첨부 → PG 워크스페이스 검색·선택 → 발송 (사업자번호·등급 모두 옵셔널)
- PG 응답 워크플로우: 초대 URL → 가입/로그인 → 워크스페이스 이름 입력(신규) 또는 기존 합류 → 정형 Bid 제출
- **오픈 발견 + 봉인 입찰**: 발견(discovery)은 기본 공개(구매사 opt-out, `board_visible`) — 발송된 모든 RFP가 PG 게시판/홈에 **구매사명·제목·홈페이지만** 노출(수수료·현재 거래조건·거래액·bizNo·메모·첨부 비노출). 비초대 PG는 쌍당 1회 콜드 피치(`rfp_pg_requests`) → 구매사 수락 시 allowlist+invitation, 거절은 영구. **입찰 자체는 여전히 봉인** — PG는 서로/경쟁사 수를 보지 못한다(`Bid.competitorCount` 부재 유지).
- v0 결재선 없음. 승인 UI를 만들지 않는다.

---

## 0. PG v0 화면 IA (구현 대상)

### 0.1 Route Map

> **호스트 라우팅 (prod)**: 단일 앱이 두 호스트를 서비스한다 — `supporter-b.com` (buyer), `partner.supporter-b.com` (PG). 아래 라우트 트리는 동일하며, `(app)/layout.tsx`가 요청 호스트를 확인해 세션 타입 불일치 시 올바른 호스트로 리다이렉트한다. 로컬 개발은 단일 호스트(라우팅 비활성).

```
Public
├─ /login
├─ /signup                       (Rs1 — 가입 유형 선택)
├─ /signup/buyer                 (Bs1 — 구매사 이메일)
├─ /signup/buyer/verify          (Bs2)
├─ /signup/buyer/profile         (Bs3)
├─ /signup/buyer/workspace       (Bs4)
├─ /signup/pg                    (Gs1 — PG사 이메일)
├─ /signup/pg/workspace          (Gs2 — 직접 가입만: wsName+bizNo)
├─ /signup/pg/profile            (Gs3)
├─ /signup/pg/verify             (Gs4)
├─ /password/forgot
├─ /password/reset
├─ /auth/verify
├─ /auth/email-change
├─ /invite                       (토큰 없는 진입 안내)
├─ /invite/rfp/:token
├─ /invite/workspace/:token
├─ /pending-approval
└─ /suspended

Authenticated AppShell
├─ /home
├─ /rfp
│  ├─ /rfp/new
│  └─ /rfp/:id                     (비교·선정 인라인 — 별도 award 라우트 없음)
├─ /inbox
│  ├─ /inbox/:rfpId
│  └─ /inbox/:rfpId/submitted
├─ /opportunities                (pg — 오픈 RFP 게시판)
├─ /notifications
├─ /messages
├─ /workspace/new
└─ /settings
   ├─ /settings/profile
   ├─ /settings/members
   ├─ /settings/notifications
   └─ /settings/audit-log         (admin 전용 — 워크스페이스 활동 기록)
├─ /quote-templates               (pg only — 견적 템플릿)

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
| B2 | `/rfp` | RFP 목록. 진행중/마감/계약완료 탭 (작성중 단계는 제거 — draft RFP는 `?status=draft` URL/표로만 접근). **온보딩 샘플**: 신규·기존 구매사는 `isSample=true` 샘플 견적 요청 1건을 목록 최상단에서 볼 수 있다(`샘플` Chip 표시). 목록 행에서 직접 삭제 가능(삭제 영속 — 재시드 안 함). | `RfpList`, `DataTable`, `Tag`, `SampleRfpBanner` |
| B3 | `/rfp/new` | 사업자 조회 (선택), 등급 확인 (선택), RFP 첨부, PG 워크스페이스 검색·선택, 발송 | `BizLookupField`, `GradeConfirmPanel`, `RfpCreateForm` (인라인 Popover+cmdk PG 검색), `RfpAttachmentDropzone` |
| B4 | `/rfp/:id` | RFP 상세 + 받은 견적 비교·선정. **포커스 스포트라이트**(탭으로 PG 1개 깊게 + 탭 hover peek) + **개선 요약 hero**(현재 조건 → 제안값) + **값 단위 hover 비교**(지표로 전 PG 줄세움 팝오버). 부차 정보는 아코디언(내가 요청한 조건 / 전체 결제수단 요율 / PG 메모·제안서 PDF / 내 메모 / PG 초대·게시판 관리). 표·보드·칸반 제거. **우측 채팅 레일**(헤더 '메시지' 토글, lg+): 탭 [상대방 채팅(FocusComparison 포커스 PG 추종, 전송에 RFP 태그 기본값) \| 팀 채팅(워크스페이스 내부 스레드)]. lg 미만은 `/messages?c=` 폴백. **온보딩 샘플**: `isSample=true` RFP 상세는 받은 견적 3건(데모 PG 워크스페이스)을 보기·비교 전용 샌드박스로 제공한다 — 선정·채팅 비활성, 상단 `SampleRfpBanner`로 삭제 안내(`deleteSampleRfpAction`, 삭제 영속). | `RfpDetailContent`, `FocusComparison`, `ImprovementSummary`, `MetricComparePopover`, `AwardConfirmDialog`, `AwardResult`, `BidNotesPanel`, `BidPdfPane`, `ChatRail`, `ChatRailToggle`, `SampleRfpBanner` |
| B5 | (B4에 통합) | 선정은 B4 포커스 뷰의 CTA → **인라인 `AwardConfirmDialog`**(결과·마감 경고 + 확정) → 확정 후 **`AwardResult` 전체 화면 오버레이**(1회성 축하 결과 — 히어로+혜택 요약+메시지 딥링크). 계약 레코드 생성·선택/미선택 PG 통보는 `awardRfpAction` 불변. 별도 `/rfp/:id/award` 라우트 없음 | `AwardConfirmDialog`, `AwardResult`, `awardRfpAction`, `useCelebrationConfetti` |
| B6 | `/settings/profile` | 구매사 사업자 프로필과 등급 갱신 상태 | `WorkspaceProfileForm` |
| B7 | `/settings/members` | buyer 워크스페이스 멤버 관리 | `MemberTable` |

### 0.3 PG Workspace Screens

| # | Route | Purpose | Primary Components |
|---|---|---|---|
| P1 | `/home` | 신규 RFP, 임박 마감, 제출 완료, 수주율 | `KpiStrip`, `DeadlineWidget`, `RfpProgressWidget` |
| P2 | `/inbox` | 받은 RFP 함. 신규/제출완료/마감 탭 (작성중 단계 제거 — 미제출 응답은 신규로 표시). **온보딩 샘플**: 신규·기존 PG는 데모 구매사가 보낸 `isSample=true` 샘플 견적 요청 1건을 인박스에서 본다(`샘플` Chip). | `InboxList`, `DataTable`, `Tag` |
| P3 | `/inbox/:rfpId` | 구매사 메타·등급(있으면)·RFP 확인 + 정형 Bid 작성. 사업자번호 미입력 시 안내 배너. 등급 미입력 시 일반 폴백(9개 카드사 입력). 저장된 견적 템플릿(요율표) 불러오기 + 현재 입력 저장. **우측 채팅 레일**(B4 와 동일, 상대 = 구매사 고정) — 견적 작성 중 질의응답·내부 메모. **온보딩 샘플**: `isSample=true` RFP 는 인터랙티브 샌드박스 — PG 가 실제 4단계 위저드로 견적을 제출하면 잠시 뒤 선정을 시뮬레이트하고 전체화면 축하(`SamplePgAwardCelebration`)를 띄운다(`simulateSampleAwardAction`). 채팅 레일 비활성, 상단 `SamplePgRfpBanner`로 삭제 안내(`deleteSamplePgRfpAction`, 삭제 영속). | `RfpBriefPanel`, `BidWizard`, `StatutoryCardFeeNotice`, `ChatRail`, `ChatRailToggle`, `SamplePgRfpBanner`, `SamplePgAwardCelebration` |
| P4 | `/inbox/:rfpId/submitted` | 제출 완료, 결과 대기, 수정/철회 정책 안내 | `SubmittedState` |
| P7 | `/opportunities` | 오픈 RFP 게시판 — 초대받지 않은 PG가 발견·콜드 피치. 공개는 구매사명·제목·홈페이지만(수수료 등 비노출). PG 홈 탐색 섹션의 "전체 보기" 대상 | `OpportunityList`, `OpportunityRequestDialog` |
| P5 | `/settings/profile` | PG 회사 정보 (워크스페이스 이름·연락처) | `WorkspaceProfileForm` |
| P6 | `/settings/members` | 같은 워크스페이스 멤버 관리 (도메인 자동 합류 없음 — 초대만) | `MemberTable` |
| P8 | `/quote-templates` | PG 워크스페이스 공유 견적 템플릿(요율표) 관리 — 정산조건+결제수단별 수수료율 프리셋 CRUD. 견적 작성(P3)에서 불러와 한 번에 채움 (최대 20개). 구간 수수료(카드·네이버페이·카카오페이·토스페이) 직접 편집 지원. nav top 레벨 (G→Q). | `QuoteTemplateList`, `QuoteTemplateDrawer` |

### 0.3a 공용 화면 (buyer · pg 공통)

| # | Route | Purpose | Primary Components |
|---|---|---|---|
| S2 | `/settings/audit-log` | **활동 기록** (admin 전용) — 워크스페이스 감사 로그 최신순 목록. 행위자 이름 · '견적' 언어 행위 라벨 · RFP 코드 링크(buyer는 `/rfp/`, pg는 `/inbox/`) · 시각. 커서 기반 '더 보기'(50건). member 에겐 안내 문구만. 기록은 서비스 레이어가 각 작업 트랜잭션 안에서 `audit_logs` 에 남긴다(rfp.create/send_invitations/award/cancel/close/requote/board_visibility, bid.submit/withdraw, workspace.create/member_invite/invite_accept/member_role_change/member_remove; auth.* 는 워크스페이스 무관이라 목록 비노출) | `AuditLogPanel`, `listAuditLogsAction` |
| S1 | `/messages` | 워크스페이스 페어(구매사↔PG) **라이브 채팅**. 2-컬럼: 좌측 대화 목록(미읽음 점) + 우측 스레드(말풍선·날짜 구분·읽음 영수증·프레즌스·타이핑). RFP는 메시지 태그로 표시. 리치 작성 드로어(저장 템플릿/첨부/이메일·인앱 알림 토글). `MessageComposeButton`으로 RFP 상세·입찰표에서 진입(ComingSoon 제거). 구매사↔PG만(PG 상호 비공개 유지), 이메일 조회로 콜드 컨택 가능. **스레드 시각 규칙**: 중앙 날짜 구분선(라인 없음)·타임스탬프는 버블 옆 단일 출처·셀프 버블 `primary-container`. `ThreadView`/`ThreadPane`은 `variant='rail'`로 상세 화면 채팅 레일에 재사용(갤러리는 오버레이) | `MessageInbox`, `ConversationList`, `ThreadView`, `MessageComposeButton`, `NewConversationSheet`, `useChatChannel` |

> 실시간 전송은 Centrifugo(자체호스팅 WS) — 미설정 환경에선 정적 로드로 graceful degrade. 이메일 알림은 presence 억제 + 윈도우 digest로 폭주 방지. `/notifications`·`/workspace/new` 도 buyer·pg 공통.

> 칸반 뷰 컬럼: 구매사 `진행중 / 계약완료 / 마감`(3, 표 탭과 동일 — 발송 전 draft RFP는 보드에 노출 안 함), PG `신규 / 제출완료 / 낙찰 / 실패`(4 — 표 탭 `마감`을 보드에서 `낙찰`/`실패`로 분리; 미제출 응답은 `신규`). 작성중 단계 제거로 보드 드래그-발송/취소·드래그-작성 전이도 사라졌다(발송은 RFP 상세의 `초대 발송`, 제출은 inbox 폼).
>
> 칸반 보드 UX(2026-06-12): 종결 컬럼(구매사 `계약완료`/`마감`, PG `낙찰`/`실패`)은 최근 10장만 노출 + `전체 N건 보기`로 표 뷰 status 필터 딥링크. 보드 뷰에서는 status 필터 칩을 숨긴다(컬럼과 중복 — 보드 전환 시 잔류 `?status=`도 제거). 드래그 중 무효 드롭 컬럼은 dim 처리, 드래그 카드는 DragOverlay 로 표시. 드래그-선정(`진행중`→`계약완료`)은 RFP 상세로 즉시 이동.

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
  └─ 미가입자 → /signup/pg funnel
        └─ Gs4(verify): 이메일 인증 → 계정 생성 + 기존 ws 합류
              └─ /inbox/:rfpId → Bid 제출
```

```
Award (B4에 인라인 통합 — 별도 라우트 없음)
/rfp/:id  FocusComparison
  ├─ 탭으로 PG 전환 (hover peek)
  ├─ ImprovementSummary hero (현재 조건 → 제안값 + 개선폭)
  ├─ 값 hover → MetricComparePopover (지표로 전 PG 줄세움 · 클릭 전환)
  ├─ 아코디언: 전체 결제수단 요율 / PG 메모·제안서 PDF / 내 메모
  └─ CTA [이 견적 선정하기] → AwardConfirmDialog (인라인 확정)
        ├─ awardRfpAction → Contract 생성
        ├─ selected/rejected notifications outbox
        └─ AwardResult 전체 화면 오버레이 (1회 축하 결과)
              ├─ 히어로 (선정 PG·완료) + ImprovementSummary 혜택 요약
              ├─ useCelebrationConfetti (canvas-confetti, DESIGN.md §9 예외)
              ├─ CTA [PG와 메시지 시작 →] → getOrCreateConversationAction → /messages?c=…
              └─ 보조 CTA [견적 목록으로] → /rfp
```

```
채팅 레일 + 팀 채팅 (확정 결정, 2026-06-10)
/rfp/:id · /inbox/:rfpId 우측 고정 레일 (sticky, w-96, lg+ 전용 — lg 미만은 /messages?c= 폴백)
  ├─ 탭 [상대방 채팅]: 기존 buyer↔PG 페어 대화 임베드 (ThreadPane variant='rail')
  │     ├─ 상대 출처 = chat-rail zustand 스토어 — 구매사: FocusComparison 이 포커스 PG publish(탭 추종),
  │     │   PG: fixedCounterparty(구매사) 를 마운트 시 시드
  │     ├─ wsId→conversationId 는 **읽기 전용** lookupConversationAction 으로 해소 — 열람·포커스만으로는
  │     │   어떤 행도 생성하지 않는다(빈 대화가 상대 인박스에 뜨면 관심 신호 누출 — sealed-bid).
  │     │   대화가 없으면 새 대화 컴포저를 띄우고 **첫 메시지 전송 시점에만** 생성
  │     └─ 컴포저 전송에 해당 RFP 태그 기본 적용 (ThreadView defaultRfpId)
  └─ 탭 [팀 채팅]: RFP 단위 워크스페이스 내부 스레드 — v1 확정 결정:
        ├─ 스코프 = (rfpId, workspaceId), rfp_team_messages append-only
        ├─ 멘션/알림/읽음/첨부 없음 (의도적 경량 — 후속 과제)
        ├─ 구매사 팀 ↔ PG 팀 스레드 상호 완전 비공개 (sealed-bid 불변식)
        ├─ ACL = 워크스페이스 멤버 ∧ RFP 접근권 (buyer 소유 or invitation canAccess)
        └─ 라이브 채널 team:rfp:<rfpId>:<wsId> (subscribe-proxy generic deny 유지)
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
- **E · PG RFP 초대 진입**: `/invite/rfp/:token` → 기존 PG 유저 로그인 → `/inbox/:rfpId` (기존 워크스페이스 전제)
- **E2 · PG 워크스페이스 초대 진입(신규 유저)**: `/invite/workspace/:token` → Gs1(email 고정) → Gs3(profile) → Gs4(verify, 3단계) → `/home` (기존 ws에 member 합류, 새 워크스페이스 미생성)
- **E3 · PG 워크스페이스 초대 진입(기존 유저)**: `/invite/workspace/:token` → (authed) → acceptWorkspaceInviteAction → `/home`
- **F · PG 직접 가입**: `/signup` → PG 카드 선택 → Gs1~Gs2~Gs3~Gs4(4단계) → `/inbox` (새 워크스페이스 생성, 관리자 심사)
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

직접 가입(4단계)과 워크스페이스 초대 가입(3단계)은 **동일한 라우트를 재사용**하지만 draft의 `wsInviteToken` 존재 여부로 분기한다.

| # | 라우트 | 직접 가입 스텝 | 초대 가입 스텝 | 핵심 |
|---|---|---|---|---|
| Gs1 | `/signup/pg` | `01 / 04 — EMAIL` | `01 / 03 — EMAIL` | 직접 가입: 이메일 자유 입력 + 약관. 초대 가입: 이메일 **prefill + readOnly** + "○○ 워크스페이스에 초대받았습니다" 안내 |
| Gs2 | `/signup/pg/workspace` | `02 / 04 — WORKSPACE` | *(건너뜀)* | 직접 가입만: wsName + bizNo 입력. 초대 가입 시 `/signup/pg/profile`로 redirect |
| Gs3 | `/signup/pg/profile` | `03 / 04 — PROFILE` | `02 / 03 — PROFILE` | 이름 + 휴대전화 OTP |
| Gs4 | `/signup/pg/verify` | `04 / 04 — VERIFY` | `03 / 03 — VERIFY` | 이메일 인증(6자리 코드 또는 링크). 직접 가입 → `signupCompleteAction`(새 워크스페이스) → `/inbox`. 초대 가입 → `signupViaWorkspaceInviteAction`(기존 ws 합류) → `/home` |

**확정 결정 (2026-05-31)**:
- 워크스페이스 초대 신규 유저는 **기존(이미 승인된) 워크스페이스에 member로 합류** — `createWorkspaceInTx` 호출 없음, 운영자 심사 없음
- 고아 워크스페이스 생성 방지: `signupViaWorkspaceInviteAction`이 단일 액션에서 user 생성 + 초대 수락 + 멤버십 추가 + `lastActiveWorkspaceId` 설정을 원자적으로 처리
- 초대 이메일 불일치 시 `INVITE_EMAIL_MISMATCH` 반환 (대소문자 무시)
- 초대 토큰 `role`(member/admin)이 `workspace_members.role`에 그대로 반영

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
- [인증 메일 받기] 제출 시: `checkEmailAvailableAction` 으로 이메일 중복 확인 → 이미 가입된 이메일이면 "이미 가입된 이메일입니다. 로그인하시겠어요?" 인라인 오류 + `/login?email=...` 링크 표시 (버튼 비활성 `LOADING…` 후 복귀)
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
- `01 / 04 — EMAIL` (직접 가입) 또는 `01 / 03 — EMAIL` (초대 가입)
- 헤드라인: `PG사 계정을 만듭니다`
- 이메일 입력 + 약관 동의 (Bs1과 동일 패턴 — EMAIL_TAKEN 인라인 오류 + 로그인 CTA 포함)
- 보조 안내: "초대 이메일을 받으셨나요? — 메일의 링크를 클릭하면 이 단계가 자동으로 건너뛰어집니다."
- 푸터: `이미 계정이 있으세요? 로그인 →`

#### Gs2 PG사 — 워크스페이스 생성 정보 `/signup/pg/workspace` (직접 가입 전용)
- `02 / 04 — WORKSPACE` (직접 가입 전용; 초대 가입은 이 단계를 건너뜀)
- 헤드라인: `워크스페이스를 만듭니다`
- 입력 필드: 워크스페이스 이름 + 사업자등록번호(10자리)
- 제출 → draft에 wsName/bizNo 저장 → `/signup/pg/profile`
- 초대 경로 진입 시 자동으로 `/signup/pg/profile`로 redirect

#### Gs3 PG사 — 프로필 `/signup/pg/profile`
- `02 / 03 — PROFILE` (초대 가입) 또는 `03 / 04 — PROFILE` (직접 가입)
- Bs3과 동일 필드/패턴

#### Gs4 PG사 — 인증 대기 `/signup/pg/verify`
- `03 / 03 — VERIFY` (초대 가입) 또는 `04 / 04 — VERIFY` (직접 가입)
- Bs2와 동일 패턴
- 직접 가입 → `signupCompleteAction`(새 워크스페이스 생성) → `/inbox`
- 초대 가입 → `signupViaWorkspaceInviteAction`(기존 ws member 합류) → `/home`

#### 인증 처리 스플래시 `/auth/verify?token=...`
- 모노 `LOADING…` 한 줄
- 결과 분기:
  - 성공 + `workspaceType='buyer'` → `/signup/buyer/verify` (Bs4) 자동 이동 (draft에 emailVerified=true 기록 → Bs4가 감지해 완료 처리)
  - 성공 + `workspaceType='pg'` → `/signup/pg/verify` (Gs4) 자동 이동 (draft에 emailVerified=true 기록 → Gs4가 감지해 완료 처리)
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

**시나리오 E2 — PG 워크스페이스 초대 진입(신규 유저)**
1. `/invite/workspace/:token` 진입 — `SignupDraft` 선 채움 (workspaceType='pg', email, wsInviteToken, inviteWorkspaceName)
2. Rs1 건너뜀 → Gs1 이메일(email prefill + readOnly, 3단계 스텝)
3. Gs3 프로필(이름 + 비밀번호) → Gs4 인증 메일 대기
4. 이메일 인증 → `signupViaWorkspaceInviteAction` → `/home` (기존 ws에 member 합류)

**시나리오 F — PG 직접 가입**
1. `/signup` → Rs1 → "PG사 영업담당" 카드 → Gs1 이메일(4단계 스텝)
2. Gs2 워크스페이스 정보 → Gs3 프로필 → Gs4 인증 메일 대기 → `signupCompleteAction` → `/inbox`

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
