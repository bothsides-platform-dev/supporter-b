# Admin Console Design Spec
**Date:** 2026-05-26  
**Status:** Draft — pending user approval  
**Scope:** 전체 Admin (W1–W7 MVP 기준)

---

## 1. Context

현재 bidit 플랫폼은 회원가입 즉시 워크스페이스가 활성화되어 사업자 검증 없이 서비스를 이용할 수 있다. 운영자가 구매사·판매사의 입점 적합성을 검토하고, RFP 회신율·견적 품질·전환 현황을 한곳에서 관제하는 내부 운영 콘솔이 없어 스프레드시트 등에 의존해야 한다.

이 스펙은 아래를 달성하기 위한 Admin 콘솔을 정의한다:
- 구매사·판매사 입점 신청을 심사하고 승인 전까지 서비스 접근을 차단(Gate)
- 구매사·판매사별 거래 현황과 회신 성과를 운영자가 즉시 파악
- 회신율 저조·마감 임박·서류 미비 케이스를 자동으로 드러내는 핫리스트
- 모든 운영자 변경 이력을 감사 로그로 기록

---

## 2. Key Decisions

| 항목 | 결정 |
|---|---|
| Admin 인증 | `.env` `ADMIN_ID` / `ADMIN_PASSWORD` → `iron-session` httpOnly 쿠키 |
| Admin 라우팅 | 동일 Next.js 앱 내 `app/(admin)/` 라우트 그룹 |
| 가입 게이트 | `workspace.status = pending` → 어드민 승인 전 `(app)` 접근 차단 |
| PG 회원가입 | 사업자 정보 단계(`/signup/pg/biz`) 추가 |
| 디자인 시스템 | 기존 Linear 디자인 시스템 동일 적용, 라이트/다크 토글 |
| 구현 전략 | DB 스키마 전체 먼저, UI는 P0 → P1 → P2 순 |

---

## 3. Architecture

### 3.1 라우트 구조

```
app/
├── (public)/
│   ├── signup/pg/biz/page.tsx      ← 신규: PG 사업자 정보 단계
│   ├── pending-approval/page.tsx   ← 신규: 심사 중 안내 (pending 워크스페이스)
│   └── suspended/page.tsx          ← 신규: 계정 정지 안내 (suspended 워크스페이스)
├── (app)/
│   └── layout.tsx                  ← workspace.status 체크 추가
└── (admin)/                        ← 신규 라우트 그룹
    ├── login/page.tsx
    ├── page.tsx                    (대시보드)
    ├── review/
    │   ├── page.tsx
    │   └── [id]/page.tsx
    ├── buyers/
    │   ├── page.tsx
    │   └── [id]/page.tsx
    ├── sellers/
    │   ├── page.tsx
    │   └── [id]/page.tsx
    ├── rfps/
    │   ├── page.tsx
    │   └── [id]/page.tsx
    ├── quotes/page.tsx             (P1)
    └── audit-log/page.tsx
```

### 3.2 인증 흐름

```
POST /admin/api/login
  → env.ADMIN_ID / ADMIN_PASSWORD 비교
  → 일치 시 iron-session 쿠키 발급 { adminId, iat }
  → /admin 리다이렉트

proxy.ts 확장
  → /admin/* 요청: admin iron-session 쿠키 검증
  → 미인증 → /admin/login
  → /admin/login, /admin/api/login 은 통과
```

### 3.3 `(app)/layout.tsx` 게이트 추가

기존 세션 검증 이후 아래 두 체크 추가:

```
workspace.status === 'pending'   → redirect('/pending-approval')
workspace.status === 'suspended' → redirect('/suspended')
```

`/pending-approval` — `(public)` 라우트. 로그인 세션은 유지, 앱 접근만 차단.

---

## 4. DB Schema Changes

### 4.1 기존 테이블 변경

**`workspaces`** — 컬럼 추가:
```sql
status        text  NOT NULL DEFAULT 'pending'  -- pending | active | suspended
status_reason text                               -- 정지/반려 사유
reviewed_at   timestamptz                        -- 승인/반려 처리 시각
```

**`biz_profiles`** — 변경 없음 (buyer 전용 유지)

### 4.2 신규 테이블

**`pg_profiles`** — PG 워크스페이스 사업자 프로필 (buyer의 biz_profiles에 대응)
```sql
id             uuid PK
workspace_id   uuid UNIQUE FK → workspaces.id
biz_no         text
service_scope  jsonb   -- {payment_methods, industries, volume_range, integration_types}
sla_days       integer
sales_contact  jsonb   -- {name, email, phone}
backup_contact jsonb
license_doc_id uuid FK → attachments.id  -- nullable
created_at     timestamptz
updated_at     timestamptz
```

**`verification_applications`** — 입점 심사 단위 (접근 제어는 workspace.status, 심사 내용은 여기)
```sql
id            uuid PK
workspace_id  uuid FK → workspaces.id
org_type      text  -- buyer | pg
status        text  -- submitted | review_pending | needs_more_info | approved | rejected
reviewed_by   text  -- 어드민 식별자 (env 기반, FK 없음)
reason        text  -- 반려/보완 사유 (해당 상태 시 필수)
submitted_at  timestamptz
reviewed_at   timestamptz
```

**`admin_notes`** — 운영자 내부 메모
```sql
id           uuid PK
entity_type  text  -- workspace | rfp | bid | user
entity_id    uuid
body         text
created_by   text  -- 어드민 식별자
created_at   timestamptz
```

**`risk_flags`** — 위험 플래그
```sql
id           uuid PK
entity_type  text
entity_id    uuid
flag_type    text  -- biz_verify_failed | doc_missing | low_response_rate |
                   -- deadline_approaching | quote_invalid | no_followup
severity     text  -- critical | warning | info
resolved_at  timestamptz
resolved_by  text
created_at   timestamptz
```

**`admin_audit_logs`** — 모든 관리자 변경 이력
```sql
id           uuid PK
actor        text          -- 어드민 식별자
action       text          -- workspace.approve | workspace.suspend | workspace.reject |
                           -- bid.hide | rfp.extend | rfp.cancel | note.create | reminder.send
entity_type  text
entity_id    uuid
payload_json jsonb         -- {before, after, reason}
occurred_at  timestamptz
```

---

## 5. 서버 액션 패턴

`lib/server/actions/admin/` 에 위치. 모든 뮤테이션은 동일 트랜잭션 내 감사 로그 삽입 필수.

```typescript
// 예시: lib/server/actions/admin/approveWorkspaceAction.ts
export async function approveWorkspaceAction(workspaceId: string) {
  const session = await requireAdminSession()

  await db.transaction(async (tx) => {
    await tx.update(workspaces)
      .set({ status: 'active', reviewedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))

    await tx.update(verificationApplications)
      .set({ status: 'approved', reviewedBy: session.adminId, reviewedAt: new Date() })
      .where(eq(verificationApplications.workspaceId, workspaceId))

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.approve',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { after: { status: 'active' } },
      occurredAt: new Date(),
    })
  })

  revalidatePath('/admin/review')
}
```

주요 어드민 서버 액션 목록:
- `approveWorkspaceAction(workspaceId)`
- `rejectWorkspaceAction(workspaceId, reason)` — reason 필수
- `requestMoreInfoAction(workspaceId, reason)`
- `suspendWorkspaceAction(workspaceId, reason)`
- `unsuspendWorkspaceAction(workspaceId)`
- `hideQuoteAction(bidId, reason)`
- `extendRfpDeadlineAction(rfpId, days)` — 기본 7일
- `sendReminderAction(rfpId, targetPgWsIds[])` — 미회신 판매사
- `createAdminNoteAction(entityType, entityId, body)`
- `resolveRiskFlagAction(flagId)`

---

## 6. PG 회원가입 변경

기존 4단계(이메일 → 인증 → 프로필 → 워크스페이스) 에 `/signup/pg/biz` 단계 추가:

```
이메일 → 인증 → 프로필 → 워크스페이스 → [신규] 사업자 정보 → 완료
```

**신규 단계 수집 항목:**
- 사업자등록번호 (선택)
- 서비스 가능 결제수단 (체크박스 멀티셀렉트)
- 취급 가능 업종 (체크박스)
- 월 거래액 구간 (드롭다운)
- 영업 담당자 이름·이메일·전화
- 라이선스 서류 업로드 (선택)

`signupCompleteAction` 내부에서:
1. `workspace.status = 'pending'` 으로 워크스페이스 생성 (**buyer·PG 모두 해당**)
2. `pg_profiles` 행 생성 (PG만)
3. `verification_applications` 행 생성 (status: 'submitted', buyer·PG 모두)

> **Note:** 기존 워크스페이스(이미 가입된 사용자)는 마이그레이션 시 `status = 'active'` 로 일괄 세팅. 신규 가입부터만 `pending` 적용.

---

## 7. 화면 목록 및 우선순위

| 우선순위 | 화면 | URL |
|---|---|---|
| P0 | 어드민 로그인 | /admin/login |
| P0 | 대시보드 | /admin |
| P0 | 입점 심사 목록 | /admin/review |
| P0 | 심사 상세 (구매사/판매사) | /admin/review/[id] |
| P0 | 구매사 목록 | /admin/buyers |
| P0 | 구매사 상세 | /admin/buyers/[id] |
| P0 | 판매사 목록 | /admin/sellers |
| P0 | 판매사 상세 | /admin/sellers/[id] |
| P0 | RFP 목록 | /admin/rfps |
| P0 | RFP 상세 | /admin/rfps/[id] |
| P0 | 감사 로그 | /admin/audit-log |
| P0 | 승인 대기 안내 (사용자 측) | /pending-approval |
| P0 | 계정 정지 안내 (사용자 측) | /suspended |
| P1 | 견적 검증 큐 | /admin/quotes |

### 대시보드 레이아웃

**지표 카드 6개 (3×2 그리드):**
입점 심사 대기 / 진행 중 RFP / 평균 회신율 / 견적 품질 / 전환 / 예상 절감

**핫리스트 테이블:**
심사 SLA 초과 | 회신율 저조 RFP | 마감 임박 RFP | 견적 검증 실패 — 각 행에 즉시 액션 링크

### 심사 상세 레이아웃

상단: 회사명 + 신청 유형 배지 + 경과 시간 + [승인 / 보완 요청 / 반려] 버튼 3개  
좌측(2/3): 사업자 정보 카드 + PG 서비스 범위 카드(판매사만) + 제출 서류 카드  
우측(1/3): 운영 메모 + 심사 이력 타임라인

---

## 8. 보안 정책

- 사업자번호·연락처는 목록에서 마스킹, 상세에서 전체 표시
- 서류 열람 시 `admin_audit_logs`에 `document.viewed` 이벤트 기록
- 승인·반려·정지 액션은 모두 사유 입력 필수 (reason NOT NULL 강제)
- Admin 쿠키는 `httpOnly: true`, `secure: true` (프로덕션), `sameSite: 'lax'`
- `.env`에 `ADMIN_ID`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` (iron-session 서명용)

---

## 9. 오픈 이슈 (구현 전 결정 필요)

1. 심사 SLA 기준: 24시간 vs 48시간
2. 판매사 라이선스 서류 필수 여부 (초기: 선택으로 진행 권장)
3. `pending-approval` 페이지에서 사용자가 추가 서류를 직접 업로드할 수 있는지
4. 리마인더 이메일 발송 시 기존 `outbox_entries` 패턴 재사용 여부 (권장)
5. 서비스 공식명: BIDIT vs Supporter B (어드민 화면 브랜드)

---

## 10. 검증 방법

1. PG 회원가입 → `/signup/pg/biz` 단계 → 완료 후 `/pending-approval` 리다이렉트 확인
2. `/admin/login` → 올바른 env 자격증명 → `/admin` 진입, 잘못된 자격증명 → 에러
3. `/admin/review` 에서 신청 선택 → 승인 → `workspace.status = 'active'` 변경 확인
4. 승인 후 해당 사용자 `/home` 접근 가능 확인 (더 이상 `/pending-approval` 아님)
5. 정지 액션 → 해당 사용자 즉시 `/suspended` 리다이렉트 확인
6. 모든 뮤테이션 후 `admin_audit_logs` 행 생성 확인
7. `pnpm tsc --noEmit` + `pnpm test` 통과 확인
