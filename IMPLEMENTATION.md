# bidit — 구현 계획

> 짝 문서: [SCREEN_DESIGN.md](./SCREEN_DESIGN.md) (화면·IA) · [DESIGN.md](./DESIGN.md) (디자인 시스템) · [SPEC.md](./SPEC.md) (기술 스펙)
> 본 문서: 마일스톤, 부트스트랩 절차, 핵심 파일, 검증 체크리스트

**Status (2026-05-08)**: M0~M7 완료, M8 부분 완료 (인프라 가동 — Auth.js v5 + Drizzle + Postgres + Resend + Sentry, `lib/mock/` 제거됨; 잔여는 BACKEND_MIGRATION.md 참조).

---

## 1. 마일스톤

각 마일스톤은 별개 PR. 한 번에 하나씩, 종료 시 §4 검증을 통과해야 다음으로 넘어간다.

| M | 산출물 | 검증 |
|---|---|---|
| **M0** | Next.js 16 + TS + Tailwind v4 + ESLint + 폰트 + 토큰 부트스트랩 | `pnpm dev` 정상, `/` 페이지에 Pretendard 적용 |
| **M1** | AppShell + 공통 컴포넌트 12종 (primitives) | 모든 primitive가 실 페이지에서 동작 |
| **M1.5** | Public 영역 — 역할 선택(Rs1), 구매사 가입(Bs1~Bs4), PG사 가입(Gs1~Gs4) + AuthShell + middleware + mock 인증 | 시나리오 D·E·F·G 클릭스루, 60초 재발송 카운트다운, 비밀번호 강도 인디케이터, PG 초대 핸드오프 |
| **M1.6** | 서버 계약 골격: in-memory repositories, token hash, 상태 정책, notification outbox adapter | 상태 전이/토큰/권한/outbox Vitest 통과, DB 없이 API 계약 테스트 가능 |
| **M2** | 구매사 RFP 작성 (`/rfp/new`) + 사업자번호 enrichment + PG 이메일 allowlist | 시나리오 A 1~6단계 클릭스루 |
| **M3** | PG 수신함/응답 (`/inbox`, `/inbox/:rfpId`) + 등급별 정형 6필드/카드사 9필드 | 시나리오 B 클릭스루, 일반등급 조건부 필드 노출 |
| **M4** | 구매사 비교 화면 (`/rfp/:id`) + 6컬럼 비교표 + PDF 프리뷰 | 3개 Bid 비교/정렬/프리뷰 정상 |
| **M5** | 수주 처리 (`/rfp/:id/award`) + 계약 레코드/알림 상태 반영 ([NOTIFICATION.md](./NOTIFICATION.md)) | 시나리오 C 클릭스루, RFP `awarded` 전이 확인 |
| **M6** | 워크스페이스 운영 최소 설정 (프로필/멤버) + 알림 상태 마감 ([NOTIFICATION.md](./NOTIFICATION.md)) | buyer/pg 프로필·멤버 화면, outbox 재시도, 알림 Drawer 검증 |
| **M7** | v0 하드닝: 단축키, 빈 상태, 페이지 stagger 모션, 접근성·반응형 보강 | 시나리오 A·B·C 클릭스루 + §4 전체 체크리스트 통과 |
| **M8** | 백엔드 마이그레이션: mock/Zustand 캐시 → Postgres + Drizzle + Auth.js v5 + 서버 액션. 14-step 컷오버 ([BACKEND_MIGRATION.md](./BACKEND_MIGRATION.md)) | docker compose + db:migrate + db:seed 그린, A/B/C E2E를 실 DB로 통과, mock/store 컷오버 게이트 4종 모두 0 |

**시각적 임팩트 우선순위**: M2(RFP 작성) → M3(PG 응답) → M4(비교 화면). 구매사-공급사 왕복 흐름이 데모에서 끊기지 않도록 M2~M4 를 먼저 마치는 것을 권장.

**라이브러리 적용 기준**
- M1: shadcn + Radix 기반 primitives 동작 계층 확정
- M3: `@tanstack/react-table` 기반 `DataTable`/목록 테이블 적용
- M4~M5: `@tanstack/react-table` 기반 Bid 비교표와 PDF 프리뷰 완성, `cmdk` 기반 전역 팔레트는 M7 하드닝에서 완성

---

## 2. M0 — 부트스트랩 (완료)

M0은 2026-04에 완료됐다. 부트스트랩 산출물은 `package.json`, `next.config.ts`, `app/globals.css`, `styles/tokens.css`, `public/fonts/` 에서 직접 확인 가능하다. 절차 재현이 필요하면 `git log -- package.json` 의 초기 커밋들을 참조.

---

## 3. 핵심 파일 (구현 시 가장 중요한 7개)

| # | 경로 | 역할 |
|---|---|---|
| 1 | `styles/tokens.css` + `tailwind.config.ts` | 디자인 시스템 진입점. DESIGN.md 의 단방향 동기화 대상 |
| 2 | `components/shell/AppShell.tsx` | 모든 화면의 외곽. CSS Grid 4영역 |
| 3 | `components/primitives/Tag.tsx` | 브래킷 상태 태그. 모든 목록·상세에서 재사용 |
| 4 | `components/primitives/DataTable.tsx` | 헤어라인 테이블. 목록 6종에서 재사용 |
| 5 | `components/rfp/RfpCreateForm.tsx` | 사업자 enrichment + allowlist 입력 중심 화면 |
| 6 | `components/inbox/BidForm.tsx` | PG 정형 제안 입력(등급별 분기) 핵심 |
| 7 | `lib/mock/rfp.ts` | RFP/Invitation/Bid 시드 단일 출처 |
| 8 | `lib/stores/bid-board.ts` | B4 칸반 stage(buyerStage) + BidNote 단일 출처. mock 단계 localStorage persist; M8에서 server action으로 컷오버 |

이 7개의 품질이 나머지 80%의 인상을 결정한다. 마일스톤 안에서도 이 파일들에 가장 많은 시간을 쓴다.

---

## 4. 검증 체크리스트

각 마일스톤 종료 시 아래를 모두 통과해야 PR 머지.

### 4.1 빌드/타입
- [ ] `pnpm build` 성공
- [ ] `tsc --noEmit` 0 에러
- [ ] `pnpm lint` 0 에러
- [ ] `pnpm test` 0 실패 (Vitest unit/component)
- [ ] `pnpm e2e` 0 실패 (Playwright, milestone 해당 시나리오)

### 4.1.1 자동화 테스트 범위
- [ ] `STATUTORY_CARD_FEE` — 영세/중소1~3 고정, 일반등급·등급 미입력(NULL)은 카드사별 입력 허용
- [ ] RFP 상태 전이 — `draft -> sent -> closed|cancelled|awarded`, 역방향/중복 전이 차단
- [ ] Invitation 토큰 — 해시 저장, 만료, atomic 1회 claim. 첫 클레임자만 `acceptedByUserId` 세팅(감사). 'used' token 을 같은 ws 동료가 클릭 시 인박스로 redirect
- [ ] Invitation 접근권 — 초대된 PG 워크스페이스의 모든 멤버가 `/inbox/:rfpId` 접근 가능. `acceptedByUserId` 는 첫 클레임자 감사용
- [ ] PG 워크스페이스 — 명시적 생성(이름 입력), 멤버 초대(`workspace_invitations`), buyer/pg route guard
- [ ] Notification outbox — Resend 실패 retry, 성공 시 `sent`, 중복 발송 방지
- [ ] Auth forms — 이메일/비밀번호/약관/토큰 만료 검증

### 4.2 클릭스루 시나리오 (PG_RFP_SPEC §6 — M5 이후 적용)
- [ ] **A** 구매사 RFP 발송: `/rfp/new` → 사업자 조회/등급 확인 → PG 워크스페이스 검색·선택 → 발송
- [ ] **A'** 사업자번호 미입력 RFP 발송: 사업자번호·등급 모두 스킵 → PG 이메일 입력 → 발송 (사전 제안 케이스)
- [ ] **B** PG 제안 응답: `/invite/rfp/:token` → 가입/로그인 → `/inbox/:rfpId` 제출. 사업자번호 미입력 RFP는 배너, 등급 미입력은 9개 카드사 입력 모드 진입
- [ ] **C** 구매사 비교·수주: `/rfp/:id` 비교표 확인 → 수주 처리 → 상태 `계약완료`

### 4.3 반응형
- [ ] 1280px — 풀 그리드
- [ ] 1024px — Subnav collapse
- [ ] 768px — 읽기 위주만 동작, 작성/편집은 안내

### 4.4 시각 회귀 (DESIGN.md 시각 원칙)
- [ ] 톤: 따뜻한 종이톤(`--color-paper`)이 메인 배경
- [ ] 타이포 위계: H1 36px / 800, KPI 84px / 300 (가는 거대 숫자) 정상
- [ ] 헤어라인 1px만 사용, 그림자는 PDF 미리보기 등 1~2곳만
- [ ] 모든 수치 mono + tabular-nums
- [ ] 상태 태그 브래킷 `[ ]` 표기
- [ ] 섹션 시리얼 마크(`01 / 14`) 노출

### 4.5 단축키 (M7)
- [ ] ⌘K — 글로벌 검색 (Command Palette)
- [ ] ⌘N — 신규 제안
- [ ] ⌘S — 임시 저장 (작성/편집)
- [ ] J / K — 행 이동
- [ ] Enter — 상세 진입
- [ ] E — 행 편집
- [ ] Esc — 모달/드로어 닫기

### 4.6 빈 상태
- [ ] 모든 목록 페이지에 SCREEN_DESIGN 명세된 카피로 노출
- [ ] CTA 버튼 1개 이상

### 4.7 비교/PDF 프리뷰 (M4)
- [ ] 6개 정형 수치 컬럼 정렬/비교 정상
- [ ] 일반등급 또는 등급 미입력 RFP일 때 카드사 9개 수수료 컬럼 노출
- [ ] 선택한 Bid의 제안서 PDF 프리뷰 즉시 전환
- [ ] 카드 우대수수료(영세/중소1~3) 값 수정 UI가 노출되지 않음
- [ ] `[ 표 ] [ 보드 ]` 토글로 BidComparisonTable ↔ BidBoard 전환, 토글 후 데이터 보존
- [ ] 보드 카드 DnD가 키보드(Tab → Space → ↑/↓ → Space)로도 작동
- [ ] 카드 ⋯ 메뉴로 진행전/협상중/결정 stage 전환 가능
- [ ] 카드 클릭 시 BidDetailModal 열림 — PDF iframe + 6수치 grid + 히스토리 노출
- [ ] 모달 메모 폼: textarea 2000자, image/pdf 첨부 chip, `[기록]` 후 정순 시리얼 번호 + 시간 역순
- [ ] awarded 카드는 `결정` 컬럼 강제 + DnD/⋯ stage 전환 잠금

---

## 5. 작업 흐름 가이드

### 5.1 마일스톤 진입 시
1. SCREEN_DESIGN.md 의 해당 §를 다시 읽는다.
2. DESIGN.md 의 관련 컴포넌트 시각 원칙을 확인한다.
3. SPEC.md 의 디렉토리 구조에 명시된 파일 경로로 빈 컴포넌트를 먼저 만든다.
4. `lib/mock/*` 시드 데이터를 채운다 (실제 콘텐츠로 시각 결정).
5. 컴포넌트 구현 → 실 페이지에 배선 후 시각 확인.

### 5.2 PR 단위
- 마일스톤당 1 PR
- 커밋 메시지: `M2: home dashboard greeting & KPI`, `M2: home calendar widget` 식
- PR 본문에 §4 체크리스트 복사 + 스크린샷 (최소 1280px / 1024px 2장)

### 5.3 데모 순서
1. 로그인·가입 (M1.5) — 첫 진입, 시스템 외곽 노출
2. 서버 계약 골격 (M1.6) — token hash, 상태 정책, in-memory outbox 검증
3. 구매사 RFP 작성 (M2) — 사업자 enrichment + allowlist 입력
4. PG 수신/응답 (M3) — 초대 토큰 진입부터 제안 제출까지
5. 구매사 비교 화면 (M4) — 6컬럼 비교 + PDF 프리뷰
6. 수주 처리 (M5) — 계약 상태 전이 확인
7. 설정/알림 (M6) — 워크스페이스 프로필·멤버와 알림 재시도 확인

---

## 6. v0 NOT in scope

아래 항목은 설계 참고로 남길 수 있지만 M0~M7 구현 범위에는 포함하지 않는다.

- 결재선/승인 워크플로우 — PG_RFP_SPEC 정책 #15 기준 v0는 단일 결정자 모델.
- 상품/카탈로그 설정 — PG RFP 비교에는 필요하지 않으며 일반 B2B 제안 시스템 잔재.
- 거래처 관리/캘린더/템플릿 — PG_RFP_SPEC §5 IA에 없는 일반 제안 도메인 화면.
- 정산·매출 추적 — 계약 이후 운영 분석 영역으로 v0 클릭스루를 막지 않는다.
- SMS/Slack/KakaoWork/Push 알림 — 이메일 + 인앱만 v0 채널.
- 계약서 전자서명/결제 연동 — 수주 마킹 이후 오프라인 계약으로 처리.
- 실제 DB/ORM 선택 — M1.6은 in-memory repository 계약으로 테스트하고, 영속 DB 도입은 **M8(백엔드 마이그레이션)** 으로 분리 — [BACKEND_MIGRATION.md](./BACKEND_MIGRATION.md) 참조.
- Recharts 기반 분석 차트, 시나리오 토글, 수수료 워터폴 — v0는 6개 정형 수치 비교표와 PDF 프리뷰로 의사결정 검증.

---

## 7. 변경 이력

- 2026-05-05 v0.1 — 초안. 마일스톤 M0~M7, 부트스트랩 절차, 검증 체크리스트 정리.
- 2026-05-05 v0.2 — M1.5 (인증/가입 11종 화면) 신규 추가. §8 토큰 정책·시나리오 D·E·F 추가.
- 2026-05-05 v0.3 — 권장 조합 동기화: shadcn/ui+Radix, TanStack Table, cmdk 설치/적용 기준 반영.
- 2026-05-05 v0.4 — PG_RFP_SPEC 기준 M2~M5 재정렬(구매사 RFP 작성→PG 응답→비교→수주), 클릭스루/검증 기준 동기화.
- 2026-05-05 v0.5 — M6/M7을 v0 운영·하드닝으로 정리하고 결재선·카탈로그·거래처 관리 등을 v0 범위 외로 명시.
- 2026-05-06 v0.6 — M8(백엔드 마이그레이션) 추가. mock/Zustand 캐시를 Postgres + Drizzle + Auth.js v5 + 서버 액션으로 컷오버. 상세 14-step + Subagent develop → Step-별 commit 워크플로우는 [BACKEND_MIGRATION.md](./BACKEND_MIGRATION.md).

---

## 8. 인증/가입 (M1.5) 정책 및 시나리오

화면 명세는 [SCREEN_DESIGN.md §1](./SCREEN_DESIGN.md), 시각 규칙은 [DESIGN.md §5.11](./DESIGN.md), 라우팅·타입·검증 스키마는 [SPEC.md §7](./SPEC.md).

### 8.1 토큰/세션/Rate-limit 정책

| 항목 | 정책 |
|---|---|
| 가입 인증 토큰 | **5분** 만료, 1회용. 60초 재발송 쿨다운, IP+이메일 시간당 5회 |
| 비밀번호 재설정 토큰 | **30분** 만료, 1회용, 60초 쿨다운 |
| 이메일 변경 토큰 | **24시간** 만료, 1회용 |
| 초대 토큰 | **7일** 만료, 1회용 (수락/거절). 관리자 회수·재발송 가능 |
| 세션 쿠키 | `httpOnly`, `Secure`, `SameSite=Lax`, 14일 (rememberMe 30일) |
| 비밀번호 저장 | argon2id (백엔드 영역). **평문 절대 저장 X** (sessionStorage 포함) |
| 로그인 Rate-limit | 5회 실패 → 캡차, 10회 → 15분 락 (IP+email 단위) |
| 토큰 형식 | URL-safe base64, ≥32 byte random, DB에는 SHA-256 해시만 저장 |
| 이메일 정규화 | `.toLowerCase().trim()`, 부분주소(+) 보존 |

### 8.2 시나리오 (M1.5 검증)

**D · 구매사 신규 가입 (셀프서비스)**
1. `/login` → `회원가입` → Rs1 역할 선택 → "구매사" 카드
2. Bs1 이메일 + 약관 → [인증 메일 받기] → Bs2 대기
3. (mock) 토큰 URL → `/auth/verify` 스플래시 → Bs3 자동 이동
4. 프로필 입력 → Bs4 워크스페이스 이름·산업 → [만들기] → `/rfp` (관리자)

**E · PG 초대 진입**
1. (mock) `/invite/rfp/:token` 진입 — `SignupDraft` 선 채움 (workspaceType='pg', email, rfpInviteToken)
2. Rs1 건너뜀 → Gs2 (이메일 자동 채움, 인증 메일 즉시 발송)
3. (mock) 토큰 → Gs3 프로필 → Gs4 워크스페이스 자동 합류 → [합류하기] → `/inbox/:rfpId` (멤버)

**F · PG 직접 가입**
1. `/signup` → Rs1 → "PG사 영업담당" 카드 → Gs1 이메일
2. Gs2 → Gs3 → Gs4 → [합류하기] → `/inbox` (멤버)

**G · 비밀번호 분실**
1. `/login` → `비밀번호를 잊으셨나요?` → `/password/forgot`
2. (mock) 토큰 → `/password/reset` → 새 비밀번호 → 자동 로그인 → `/home`

### 8.3 M1.5 검증 체크리스트

#### 빌드/타입
- [ ] `pnpm build` 성공, 타입 0 에러

#### 라우팅 가드
- [ ] 비인증 사용자가 `/home` 진입 → `/login?next=/home` redirect
- [ ] 인증 사용자가 `/login` 진입 → `/home` redirect
- [ ] 인증 사용자가 `/invite/rfp/:token` 진입 → `/home` redirect 없이 token claim 처리
- [ ] `/logout` POST → 세션 삭제 → `/login`

#### 시나리오
- [ ] 시나리오 D 클릭스루 (Rs1 → Bs1 → Bs2 → Bs3 → Bs4 → /rfp)
- [ ] 시나리오 E 클릭스루 (`/invite/rfp/:token` → Gs2 → Gs3 → Gs4 → /inbox/:rfpId)
- [ ] 시나리오 F 클릭스루 (Rs1 → Gs1 → Gs2 → Gs3 → Gs4 → /inbox)
- [ ] 시나리오 G 클릭스루 (/password/forgot → /password/reset → /home)
- [ ] 역할 선택 랜딩(Rs1) — 두 카드 클릭 시 각 경로로 이동
- [ ] PG 초대 토큰 진입 — 이메일 자동 채움 + Rs1/Gs1 건너뜀 + Gs2 진입
- [ ] SignupDraft.workspaceType — Rs1 선택 후 Bs4/Gs4까지 보존
- [ ] 구매사 완료 후 `/rfp` 이동 확인
- [ ] PG 완료 후 `/inbox` 이동 (초대 있으면 `/inbox/:rfpId`)
- [ ] Stepper 단계 수: 구매사 04/04, PG 직접 04/04, PG 초대 03/03

#### 폼 검증 (zod)
- [ ] 잘못된 이메일 형식 → 인라인 에러
- [ ] 비밀번호 정책 위반 (10자 미만, 영문 없음, 숫자 없음, 특수문자 없음) → 인라인 에러
- [ ] 비밀번호 확인 불일치 → 인라인 에러
- [ ] 약관 미동의 시 [인증 메일 받기] 비활성화

#### UX
- [ ] 60초 재발송 카운트다운 정상 작동 (`tabular-nums` 정렬)
- [ ] 비밀번호 보기 토글 작동
- [ ] 비밀번호 강도 4단계 인디케이터 (terracotta → amber → lavender → moss) 정상 색상 전환
- [ ] 진행 시리얼 마크 `01 / 03 — EMAIL` / `02 / 03 — PROFILE` / `03 / 03 — WORKSPACE` 표시
- [ ] 로그인 5회 실패 시 캡차 노출 (mock)

#### 시각 (DESIGN.md §5.11)
- [ ] AuthShell 좌상단 워드마크 + 우상단 serial `EDITION 01 · v0`
- [ ] 입력 필드 border-bottom only (카드 박스 X)
- [ ] 봉투/체크 라인 SVG (1.4 stroke), 컬러 일러스트 X
- [ ] 1차 CTA 버튼 full-width, 검정 채움

#### 토큰 만료
- [ ] 만료된 인증 토큰으로 P4 진입 → "링크가 만료되었습니다." + 재발송
- [ ] 이미 사용된 토큰 → 로그인 안내
- [ ] 무효 토큰 → "잘못된 링크입니다."
