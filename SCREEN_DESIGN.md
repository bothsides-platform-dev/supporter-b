# 서포트비 PG RFP 화면 설계

## Context

본 문서는 PG(결제대행사) 비공개 1:N RFP 플랫폼 **서포트비** 의 화면 설계 명세이다.

본 문서 **§0 PG v0 화면 IA** 가 v0 제품 정의이자 구현 대상의 최상위 기준이다 (레거시 `PG_RFP_SPEC.md` 는 제거됨 — 제품 규칙은 아래 "확정 결정" 블록 + 코드·테스트가 캐노니컬).

> **용어 주의**: 이 문서는 내부 개념어로 **`RFP`/`Bid`** 를 쓰지만, **사용자에게 보이는 실제 화면 라벨은 '견적' 언어**(견적 요청·견적·선정 등)다. 화면 문구는 `UX_WRITING.md` §8 도메인 용어집을 따른다 (예: 이 문서의 "받은 RFP" 화면 = 실제 라벨 "받은 견적 요청", "계약완료" 탭 = "선정 완료"). 랜딩/마케팅만 '경쟁 입찰' 프레이밍 유지.

**왜 만드는가**
- 구매사가 이미 아는 PG 영업담당에게만 RFP를 보내고, PG가 서로의 존재를 모르는 private 1:N 입찰을 만든다.
- 사업자번호 enrichment, 카드 우대수수료 등급, 6개 정형 수치를 한 화면에서 비교해 결제 인프라 선택 시간을 줄인다.
- 초대 이메일의 고유 URL이 첫 진입 경로이므로 인증·가입·워크스페이스 라우팅이 RFP 흐름과 끊기지 않아야 한다.

**확정 결정 (v0 제품 정의 — 본 절이 캐노니컬 기준)**
- **선정 후 공통 장기합의서 (확정 결정 2026-09-20)**: 신규 발송은 PG의 PDF 업로드·자유 조항 편집 대신 공통 장기계약 부속합의서를 쓴다. PG가 양측 상호·사업자번호·주소·대표자를 채우고, 선정 견적에서 고정한 최종 수수료와 관리자 PG별 표준 수수료·할인 폭을 확인한 뒤 양측에 직접 서명을 요청한다. 구매사 승인 단계는 없다. 2년 약정·독점 이용·위반 시 할인액 반환 문안은 공통 고정이다. 아래 기존 PDF·템플릿 표면의 기술 설명은 전환 전 계약의 레거시 명세이며, 신규 계약의 화면은 P10/B8을 따른다. 배포·복구 규칙은 `docs/LONG_TERM_AGREEMENT_ROLLOUT.md`에 있다.
- 메인 IA: 홈 / RFP / 받은 RFP / 설정
- **맞춤 PG 상담 (확정 결정 2026-09-19)**: 사업자 정보 확인 → 견적 내용·업종 입력 → 작성 영역의 최소 5초 추천 준비 화면(사업자 정보 확인 → 업종별 상담 조건 확인 → 추천 PG사 준비) → 관리자 기준에 따른 PG 추천 → **한 곳에 상담 요청** → PG 검토·견적 또는 거절 → 구매사의 견적 확인·**최종 선정** → 기존 계약서 준비. 첫 PG 선택은 선정이 아니며 계약을 만들지 않는다. 기존에 발송한 1:N 견적과 랜딩·튜토리얼 샘플은 종전 흐름을 유지한다.
- **추천 준비 화면 (2026-09-20)**: 실제 구매사 최종 확인 단계에서 앱 셸·단계 안내를 유지하고 작성 영역에 최소 5초 연출을 표시한다. 제목 위 아이콘과 퍼센트는 없고, 세 단계는 실제 응답과 경과 시간을 함께 확인해 대기·펄스 점·완료 체크로 전환한다. 마지막 단계는 PG 브랜드 로고가 가로로 지나가며 `상담 조건 검토 중`을 표시한다(로고 순서는 장식이며 실제 후보·PG의 심사 참여를 뜻하지 않는다). 느린 응답은 완료로 표시하지 않고, 오류는 즉시 재시도·이전 단계 복귀를 제공한다. 완료 후 후보 선택·마감일·요청 요약을 함께 표시하며 PG 선택 전에는 상담 요청 버튼을 비활성화한다. 업종 변경·재시도는 상태와 시계를 초기화하고 이전 응답을 무시한다. 모션 감소 설정에서는 점과 로고를 정지한다. 랜딩·튜토리얼 샘플 흐름은 적용 대상이 아니다.
- **추천 운영 기준**: `pg_matching_policies`가 업종별 White(일반)/Gray(추가 검토)/Black(접수 불가)와 PG 순서·추천 사유·영세 예상 수수료·조건을 소유한다. 기본은 미설정이며 미설정/접수 불가 업종은 자동 추천·접수를 막고 문의 경로를 제공한다. 같은 PG를 여러 업종에 등록할 수 있다. 키움·헥토·2차 PG의 수용 정책을 이름으로 추정하지 않는다. 관리자 콘솔은 별도 레포 `/pg-recommendations`다.
- **거절·철회 후 다음 추천**: 진행 중인 상담은 한 곳뿐이며 과거 상담 PG는 재추천하지 않는다. 다음 요청 시 최신 정책과 활성 PG 여부를 다시 확인하고 새 마감일을 저장한다. 후보가 없거나 업종이 삭제되면 운영팀 문의로 이어진다. 거절 사유와 PG명·제안 조건 스냅샷은 구매사 상담 이력에 남는다. PG에게는 자기 검토 결과만 제공한다.
- **수수료 안내**: 고정 0.8~0.9%를 모든 PG에 보장하지 않는다. 운영자가 확인해 등록한 예상 범위와 적용 조건만 표시하고 미등록 요율은 견적에서 안내한다. 영세 기준은 연 매출 3억 원 이하이며 신규 사업자는 반기별 선정 결과에 따라 우대 적용·차액 환급 대상이 된다. 정확히 6개월 후 자동 전환을 약속하지 않는다.
- **RFP 작성 2단계 발송 필수 필드 — `견적 유형`·`주요 판매 상품`·`전년도 연간 PG 총 거래액`**: 작성 위저드 2단계의 세 필드는 **발송 시 필수**다(제목·홈페이지와 함께). 작성 도중(draft)에는 비워둬도 되지만 발송하려면 채워야 한다 — 견적 유형은 신규/갱신 중 하나, 주요 판매 상품은 비어 있지 않은 문자열, 연간 거래액은 0보다 큰 정수여야 한다. **단, 견적 유형이 `신규 계약`(contractType==='new')이면 전년도 연간 PG 총 거래액은 필수에서 빠진다** — 첫 PG 계약이라 이전 거래액이 존재할 수 없기 때문. 판정은 SSOT 헬퍼 `isAnnualPgVolumeSatisfied(annualPgVolume, contractType)` 로 통일(`isAnnualPgVolumeValid` 를 감싸 `new` 만 면제). 신규 계약에서는 이 필드를 포함한 PG 이력 값(현재 카드 수수료·현재 월 정산한도·현재 보증보험·현재 정산주기)이 2단계 입력·4단계 검토 화면 양쪽에서 숨겨지고, `createRfpAction` 이 서버에서도 `current_terms` JSONB 에 새지 않도록 제거한다(배송·서비스 기간·현재 운영 솔루션은 PG 무관이라 보존). 판정 로직은 클라이언트 위저드와 서버 `createRfpAction` superRefine 이 **단일 출처(`lib/rfp/required-fields.ts`)** 를 공유해 드리프트를 막고, draft 는 허용하되 발송(send)에서만 강제한다(서버가 trust boundary). 필드에는 `RequiredMark` 칩(empty/filled/error 3상태)이 붙는다.
- PG 응답 워크플로우: 초대 URL → 가입/로그인 → 요청 조건 확인 → 입점 검토 → 정형 견적 제출 또는 사유와 함께 상담 거절. 기존 견적은 종전 제출 흐름을 유지한다.
- **오픈 발견 + 봉인 입찰 (기존 견적)**: 신규 맞춤 상담은 공개 게시판 비노출을 서버에서 강제하고 기존 PG 추가 초대·참여 수락 경로를 차단한다. 기존 견적의 발견(discovery)은 기본 공개(구매사 opt-out, `board_visible`) — 발송된 모든 RFP가 PG 게시판/홈에 **비경쟁 정보 화이트리스트만** 노출한다(수수료·현재 거래조건·거래액·bizNo·메모·첨부 비노출). 공개 필드 목록은 여기 복제하지 않는다 — 타입 정의는 `OpportunityListing`(`lib/types/pg-request.ts`), 산문 설명은 CLAUDE.md, 키 집합은 리포지토리 테스트가 정확히 고정한다. **`board_visible` 은 RFP 작성 시(3단계 최종 확인, `RfpStep4Review` 체크박스)에만 설정 가능하며 이후 변경 불가** — 딜룸 헤더와 PG 관리 탭에 읽기전용 칩(`RfpBoardVisibilityStatus`)으로 표시된다. 비초대 PG는 쌍당 1회 콜드 피치(`rfp_pg_requests`) → 구매사 수락 시 allowlist+invitation, 거절은 영구. **입찰 자체는 여전히 봉인** — PG는 서로/경쟁사 수를 보지 못한다(`Bid.competitorCount` 부재 유지).
- **초대 PG 대상 필드 단위 opt-out — `현재 카드 수수료`**: 초대받아 전체 브리프를 보는 PG라도 구매사는 **현재 카드 수수료** 한 필드를 가릴 수 있다(기본 공개). 저장소는 `current_terms` JSONB 문서 + `hidden_from_pg` 경로 배열이 유일하다 — 구 `current_fee_visible_to_pg` boolean 컬럼은 v0.2.26.2 에서 DROP 됐고, 앱 계층의 `currentFeeVisibleToPg` 는 `hiddenFromPg` 에서 파생된다. 끄면 값 자체를 `loadPgRfpDetail`에서 서버 제거(`PG_STRIP` fail-closed) — PG는 RSC payload/네트워크에서 읽지 못한다(`RfpBriefPanel` 렌더 게이트는 시각적 폴백). 구매사 본인 비교 baseline은 항상 유지. 토글은 RFP 작성 위저드 2단계(현재 카드 수수료 아래).
- v0 결재선 없음. 승인 UI를 만들지 않는다.
- **워크스페이스 이름 변경은 운영자 심사 후 반영한다 (확정 결정, v0.6.1.0)**: 구매사·PG사 관리자 모두 설정에서 새 이름을 요청할 수 있지만 `workspaces.name`은 즉시 바뀌지 않는다. 워크스페이스당 대기 요청은 하나이며, 운영자 콘솔의 승인 트랜잭션만 이름을 갱신한다. 거절 시 현재 이름을 유지하고 프로필에서 거절 사유와 재요청 경로를 보여준다. 요청자·기존 이름·요청 이름·검토자·결과는 요청 행과 감사 로그에 남긴다. 표시명/법인명 분리는 하지 않고 `workspaces.name` 단일 필드를 유지한다.
- **운영계정은 선택한 워크스페이스의 설정을 관리자처럼 운영한다 (확정 결정, v0.10.0.0)**: 워크스페이스 멤버십 없이도 이름 변경을 요청하고, 멤버 초대·재발송·취소·역할 변경·내보내기와 활동 기록 조회를 할 수 있다. 마지막 승인 관리자는 운영계정도 강등하거나 내보낼 수 없고, 모든 작업은 활동 기록에 `운영자`로 남는다. 다른 탭에서 워크스페이스를 전환해 이전 화면과 현재 세션의 대상이 달라지면 변경하지 않고 새로고침을 안내한다.

---

**B4/P3 첨부 탭**: 구매사와 PG 딜룸은 같은 `AttachmentPreviewList`를 쓴다. 이미지와 PDF 첫 페이지를 썸네일로 표시하고 클릭하면 크게 미리 본다. PDF 썸네일은 화면에 가까워진 파일부터 최대 2개씩 내려받으며, 바이트는 기존 첨부 ACL을 통과한 동일 출처 경로에서만 읽는다. 일반 파일 열기는 기존 presigned URL을 유지한다. 첨부가 없으면 빈 탭에 상태 안내를 표시한다.

## 0. PG v0 화면 IA (구현 대상)

### 0.1 Route Map

> **호스트 라우팅 (prod)**: 단일 앱이 두 호스트를 서비스한다 — `support-b.com` (buyer), `partner.support-b.com` (PG). 아래 라우트 트리는 동일하며, `(app)/layout.tsx`가 요청 호스트를 확인해 세션 타입 불일치 시 올바른 호스트로 리다이렉트한다. 로컬 개발은 단일 호스트(라우팅 비활성).

```
Public
├─ /login
├─ /login/ops                    (숨김 — 운영자 Google 로그인. NEXT_PUBLIC_MASTER_OAUTH_ENABLED off 시 404)
├─ /signup                       (Rs1 — 호스트 기반 redirect: partner → /signup/pg, 그 외 → /signup/buyer)
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
├─ /invite/rfp/:token
├─ /invite/workspace/:token
├─ /pending-approval
└─ /suspended

Authenticated AppShell
├─ /home
├─ /rfp
│  └─ /rfp/:id                     (딜룸 — 목록 행 클릭 시 `@modal` 인터셉트 블러 모달, 새로고침·딥링크는 정식 페이지(둘 다 DealRoomFull) · 비교·선정 인라인, 별도 award 라우트 없음)
├─ /rfp-create                   (RFP 작성 위저드 — `/rfp` 하위가 아니라 최상위 라우트. 옛 `/rfp/new` 는 `next.config.ts` 리다이렉트로 남아 있다)
├─ /inbox
│  └─ /inbox/:rfpId                (딜룸 — `@modal` 인터셉트 모달 + 정식 페이지, 제출 후 결과 대기도 인플레이스 흡수 · 기본 탭은 요청 조건, 알림 딥링크 `?tab=contract|write` — `lib/rfp/pg-deal-room-link.ts`)
├─ /opportunities                (pg — 오픈 RFP 게시판)
├─ /tutorial                     (buyer+pg — 온보딩 튜토리얼. 홈 환영 모달/재유도 배너의 진입점. buyer는 BuyerTutorialFlow가 실제 여정(작성→도착연출→비교·선정→완료) 제공, pg는 PgTutorialFlow가 실제 여정(초대 수신→요청 조건 확인→견적 작성·제출→완료) 제공. 오픈 샌드박스: 전부 프리필 + 코치마크가 실제 버튼 클릭을 안내(차단 없음 — 자유 입력·탐색 허용, 이탈은 확인 다이얼로그). 코스 이탈 시(이전/스텝 점프·안내 무시 클릭) 코치마크가 현재 화면 기준 스텝으로 ~0.5s 안에 자동 점프·복귀. 완료 시 /home 리다이렉트)
├─ /notifications
├─ /messages
├─ /workspace/new
├─ /contracts                     (buyer+pg — 계약 보관함)
├─ /quote-templates               (pg only — 견적 템플릿)
├─ /contract-templates            (pg only — 공통 합의서 전환 안내; 신규 템플릿 표면 비노출)
└─ /settings
   ├─ /settings/profile
   ├─ /settings/members
   ├─ /settings/notifications
   └─ /settings/audit-log         (admin·운영계정 — 워크스페이스 활동 기록)

Admin console (별도 저장소 `admin-supporter-b`, role-guard in admin/(protected)/layout.tsx)
├─ /admin/login
└─ /admin                        (protected — 대시보드 index)
   ├─ /admin/buyers   · /admin/buyers/:id
   ├─ /admin/sellers  · /admin/sellers/:id
   ├─ /admin/rfps     · /admin/rfps/:id
   ├─ /admin/review   · /admin/review/:id
   └─ /admin/audit-log
```

별도 `admin-supporter-b` 콘솔의 `/pg-recommendations`는 업종 이름·표시 순서·PG 연결을 편집한다. PG 한 곳을 여러 업종에 연결할 수 있으며, 변경은 구매사 작성 화면의 추천에 반영된다.

별도 관리자 `/agreement-rates`는 PG별 표준 수수료 기준 편집 화면이다. 앱의 `GET /api/signing/agreements/:id/document`는 권한 검증된 실제 PDF 미리보기·보낸 문서 조회 전용이다.

### 0.2 Buyer Workspace Screens

| # | Route | Purpose | Primary Components |
|---|---|---|---|
| B8 | `/rfp/:id?tab=contract` | 발송 전에는 PG 준비 안내·2년/독점/반환 조건·수수료 표만 표시한다. 회사 정보 초안과 편집 버튼은 없다. 발송 후에는 보낸 합의서 전체 보기, 양측 서명 상태, 기존 취소·재발송·완료 문서 기능을 표시한다. 서명은 요청 이메일에서 수행하며 완료본은 C1에 보관한다. | `AgreementPanel`, `SigningTab` |
| B1 | `/home` | 진행 중 RFP, 임박 마감, 받은 Bid, 최근 활동. `sent`라도 유효 마감 시각이 지나면 진행중·마감임박 집계에서 제외한다. 이미 도착한 견적은 마감 후에도 선정할 수 있으므로 검토대기에는 남긴다. | `KpiStrip`, `DeadlineWidget`, `RfpProgressWidget`, `NotificationWidget` |
| B2 | `/rfp` | 견적 요청 표 목록. 상태(진행중/마감)·마감일·가맹점 등급 필터를 제공하며 `view` 쿼리나 과거 뷰 쿠키와 무관하게 항상 표로 표시한다. `sent`라도 유효 마감 시각이 지나면 마감 필터에 속하고 `마감`으로 표시한다. PG 수 대신 최신 상담 검토 상태 또는 견적 도착 상태와 다음 행동을 보여준다. 좁은 화면은 같은 표의 행을 2열 요약 카드로 배치하며 제목 링크로 키보드 접근과 새 탭 열기를 지원한다. 작성중 단계는 제거 — draft RFP는 `?status=draft` URL로만 접근한다. | `RfpListTable`, `BoardFilterBar`, `Chip` |
| B3 | `/rfp-create` | 3단계: 사업자 확인 → 견적 내용(계약 유형·사업 정보·결제 조건·마무리 질문) → PG 선택·최종 확인. 갱신 계약에서만 이전 PG 거래 조건을 입력한다. 실제 구매사 작성의 마지막 화면에서는 마감일과 요청 내용을 확인한 뒤 관리자 정책의 후보 중 PG사 한 곳에 상담을 요청한다. PG사는 기본 선택되지 않고, 접수 불가·미설정 업종은 상담을 요청할 수 없다. 업종은 견적 내용 단계에서 구매사가 직접 선택한다. 랜딩·튜토리얼의 기존 1:N 샘플에서는 업종별 승인 PG를 먼저 추천하고 다른 승인 PG도 선택할 수 있으며, 추천만으로 자동 선택되지는 않는다. 업종·PG 연결은 별도 admin 콘솔의 `/pg-recommendations`에서 편집하며 PG 한 곳을 여러 업종에 연결할 수 있다. **첨부 삭제는 5초 동안 되돌릴 수 있어요**: 여러 파일을 연달아 삭제하면 하나의 토스트로 모이고, `되돌리기`를 누르면 원래 순서대로 복원됩니다. **마운트 시 draft 재조정**: 화면 진입 시 localStorage draft를 자동 정리 — (1) 현재 서버 PG 목록에 없는 PG 워크스페이스 제거, (2) 삭제된 업종 선택 초기화, (3) 만료된 마감일 초기화, (4) 24h 이후 서버에서 sweep된 첨부파일 제거. PG·마감일·첨부파일 정리는 info toast로 안내한다(`verifyDraftFilesAction` — DB unclaimed 검증). **이 정리는 데모·샘플 호스트에서는 아예 돌지 않는다 (v0.8.1.0)** — 랜딩 데모(`WizardPageHost`, `guest`)와 buyer 튜토리얼(`BuyerTutorialFlow`, `onSampleSubmit`)이 fixture PG 목록으로 같은 위저드를 마운트하는데, React는 자식 effect를 부모보다 먼저 돌리므로 호스트의 draft 격리 스냅샷이 떠지기 전에 이 정리가 방문자의 **실제** 초안에서 PG 선택을 지워버린다. 랜딩에는 `ToasterProvider`도 없어 위 안내 토스트마저 삼켜져 방문자는 잃은 줄도 모른다. **PG 선택(3단계 최종 확인 화면)**: PG 하나가 토글 버튼 하나이며 선택 상태를 세 곳에서 동시에 알린다 — 앞머리 체크 상자(미선택에도 빈 박스가 남아 칩 폭이 흔들리지 않는다) · `aria-pressed` · 라벨 옆 `N/M 선택` 카운터(`data-testid="pg-select-count"`, 0에서도 감추지 않는다 — 기준선에 표시가 없으면 무엇과 견줄지 알 수 없다). 카운터의 분자와 `전체 선택`/`전체 해제` 판정은 **초안과 화면 목록의 교집합**으로 센다: 테스트 PG 숨김(CLAUDE.md, v0.4.53.0) 이후 초안이 목록의 상위집합일 수 있어, 초안 개수를 그대로 쓰면 `3/2`가 뜨고 개수만 비교하면 멤버십이 어긋난 채 '전체 해제'가 그려진다. 목록이 비면 `전체 선택`은 disabled — 라벨은 선택인데 동작은 초안 비우기가 되기 때문. | `BizLookupField`, `GradeConfirmPanel`, `RfpStep3PgSelect`, `RfpStep4Review`, `RfpAttachmentDropzone`, `RfpCreateWizard` |
| B4 | `/rfp/:id` | RFP 상세 + 받은 견적 비교·선정. **진입**: 목록(B1) 행 클릭 시 블러 모달 딜룸(`@modal` 인터셉트), 새로고침·딥링크는 정식 페이지 — 둘 다 `DealRoomFull`/`DealRoomShell` 공유. 좌측 76px 아이콘 **작업** 레일(`DealRoomActionRail`) + 중앙 **콘텐츠** 탭(`DealRoomCenter`) — 요청 조건·첨부·PG 관리는 상단 탭만 소유하고, 레일에는 선정·재요청·선정 없이 종료·취소 같은 작업만 둔다(종료·취소는 하단 분리). `선정 없이 종료`는 기존 closed 전이이며, 확인창에서 이후 받은 견적 선정·새 견적 접수·요청 재개가 모두 불가함을 알린다. 기존 1:N 견적에 견적이 없으면 선정·재요청을 감추고 빈 상태가 초대 PG 수·마감 D-day·`초대 현황 보기` 단일 CTA를 보여준다. 맞춤 상담은 견적이 없어도 상담 상태·이력을 보여주며 마감·취소 후에도 결과를 확인할 수 있다. **포커스 스포트라이트**(탭으로 PG 1개 깊게 + 탭 hover peek) + **개선 요약 hero**(현재 조건 → 제안값) + **값 단위 hover 비교**(지표로 전 PG 줄세움 팝오버). 부차 정보는 아코디언(내가 요청한 조건 / 전체 결제수단 요율 / PG 메모·제안서 PDF / PG 초대·게시판 관리). `요청 조건`에는 작성 때 확정한 계약 유형·배송 및 서비스 기간·기본/커스텀 요청 결제수단을 명시한다. **PG 관리에서 발송 전 대기 중인 PG 선택은 X 버튼으로 취소할 수 있고, 이미 발송된 초대는 취소할 수 없다** — 취소한 PG는 다시 추가할 수 있다. 게시판 공개 여부는 아코디언 내 `RfpBoardVisibilityStatus` 읽기전용 칩(변경 불가 — 작성 시 확정)으로 표시되며, 동일 칩이 상세 화면 헤더에도 노출된다. 견적별 '내 메모'는 제거 — 팀 메모는 딜룸 '팀 채팅'으로 일원화(첨부 지원). 표·보드·칸반 제거. **딜룸 채팅**(`DealRoomChat`→`ChatPanel`; lg+ 우측 aside, lg 미만 `DealRoomChatFab` 하단 시트): 탭 [상대방 채팅(FocusComparison 이 `useDealRoom().setCounterparty` 로 포커스 PG 추종, 전송에 RFP 태그 기본값) \| 팀 채팅(워크스페이스 내부 스레드, PDF·이미지 첨부)]. **선정 종료 후(결과 통합형)**: RFP `awarded` 시 `견적 비교` 탭 최상단 결과 패널 `DealResultHeader`(award, `"<PG>를 선정했어요"`, subtitle `"담당처와 연락을 이어나가보세요."`, tertiary)가 선정 PG 담당자 `ContactBlock`(아바타·이름·상대칩·이메일/전화 + `CopyButton` 복사)을 감싼다 — 딜룸 상단 별도 배너가 아니라 비교 탭 안에 함께 노출된다. **전자서명 '계약' 탭**(`SigningTab`, 선정 이후): `signing` 이 있으면 탭 배열 **맨 앞**에 `계약 · <상태>` 탭이 생기고 딜룸을 열 때 **기본 활성**이 된다. 상태는 색상 점이 아니라 `buildSigningSummary`의 텍스트로 표시하고, 콘텐츠 이동과 중복되는 `계약` 액션은 작업 레일에 두지 않는다. 탭 본문은 상단 한 줄 컨텍스트(`AwardContextLine` — 선정 PG·담당자·메시지) + 카드 3구역(상태 헤더 · 세로 서명 타임라인 · 액션 바) 고정 구조로(상태 헤더는 아이콘·제목·설명만 — 상태 칩은 탭 이름과 겹치므로 두지 않는다), 8개 상태(`awaiting_pg_template`/`sent`/`in_progress`/`completed`/`declined`/`expired`/`canceled`/`send_failed`)가 같은 골격을 공유한다. 진행바는 타임라인에 흡수됐다. 견적 비교 탭에는 결과 패널 아래 38px 요약 스트립(`SigningSummaryStrip`)만 남아 클릭 시 계약 탭으로 이동한다. 계약이 없으면 탭·스트립 모두 없다. | `DealRoomModal`, `DealRoomFull`, `DealRoomShell`, `BuyerDealRoomBody`, `DealRoomActionRail`, `DealRoomCenter`, `FocusComparison`, `ImprovementSummary`, `MetricComparePopover`, `AwardConfirmDialog`, `AwardResult`, `BidPdfPane`, `SigningTab`, `SigningTimeline`, `SigningSummaryStrip`, `AwardContextLine`, `DealRoomChat`, `DealRoomChatFab`, `ChatPanel`, `DealRoomContext`, `TeamThreadView`, `MessageAttachmentGrid`, `RfpBoardVisibilityStatus`, `DealResultHeader`, `ContactBlock`, `CopyButton` |
| B5 | (B4에 통합) | 선정은 B4 포커스 뷰의 CTA → **인라인 `AwardConfirmDialog`**(결과·마감 경고 + 확정). 공통 장기합의서가 켜져 있으면 선정 확정 전에 2년 약정·독점 이용·실제 할인액 반환·약정 시작점을 안내하고, `공통 합의서 문안 보기`에서 실제 발송과 같은 `buildAgreementDocument`의 고정 문안을 펼쳐 본다. 회사 정보와 실제 수수료 표는 발송할 합의서에서 확인하며 별도 구매사 승인 단계는 추가하지 않는다. 확정 후 **`AwardResult` 전체 화면 오버레이**(1회성 축하 결과 — 히어로+혜택 요약+메시지 딥링크). 계약 레코드 생성·선택/미선택 PG 통보는 `awardRfpAction` 불변. 별도 `/rfp/:id/award` 라우트 없음 | `AwardConfirmDialog`, `AgreementConditions`, `AwardResult`, `awardRfpAction`, `useCelebrationConfetti` |
| B6 | `/settings/profile` | 구매사 사업자 프로필과 등급 갱신 상태. **사용자 섹션**: 프로필 사진 업로드·삭제(`UserAvatarForm`) + **휴대폰 인증**(`UserPhoneForm`, v0.4.46.0 — 계약 서명 본인인증이 010 번호를 요구하고 가입 외엔 넣을 경로가 없었다. 미등록이면 왜 필요한지 함께 안내. **010 게이트는 SMS 이전이다 (v0.5.1.0)** — OTP 왕복 자체는 `01[0-9]` 를 통과시켜(`isCompletePhone`·`normalizePhone`) 011 번호가 실제 문자와 인증번호 입력을 다 거친 뒤 저장에서야 거절됐다. 이 화면은 `requireMobile010` 로 그 전에 막고 이유를 말한다. 안내는 번호를 **다 친 뒤에만** 뜬다. 가입은 010 제약이 없어 기본값은 꺼짐). **워크스페이스 섹션(로고·사업자번호)은 승인된 admin·운영계정이 편집하고, 이름은 같은 권한으로 변경 요청** — 이름은 즉시 저장하지 않고 운영자 승인 후 반영한다. `canEditWorkspace`(`isApprovedAdmin` + 마스터 계정은 `isMasterEmail` 로 면제) 한 술어를 세 폼에 그대로 넘긴다. 권한이 없으면 폼 대신 관리자 요청 안내만 뜬다 | `UserAvatarForm`, `UserPhoneForm`, `WorkspaceLogoForm`, `WorkspaceNameForm`, `WorkspaceBizNoForm` |
| B7 | `/settings/members` | buyer 워크스페이스 멤버 관리. 승인된 admin과 운영계정이 초대·재발송·취소·역할 변경·내보내기를 할 수 있다. 마지막 승인 admin은 강등·내보내기에서 보호된다. | `MembersPanel`, `InviteMemberForm` |

**B4·B5 좁은 화면 보완:** 견적 개선 요약은 현재값과 제안값을 2열로 쌓아 표시한다. 선정 확인창은 PG 이름과 함께 선택한 견적의 현재 등급 카드 수수료·정산주기·월 정산한도·보증보험·가입비를 다시 보여준 뒤 공통 합의서 조건을 안내한다. 다른 결제수단과 등급별 요율은 견적 비교에서 확인한다.

### 0.3 PG Workspace Screens

| # | Route | Purpose | Primary Components |
|---|---|---|---|
| P10 | `/inbox/:rfpId?tab=contract` | `합의서 작성하기` → 거의 전체화면 편집창. 데스크톱은 양측 회사 정보/서명 담당자/수수료와 실제 PDF의 2열, 모바일은 정보 입력·미리보기 탭이다. 본문·약정기간·수수료는 편집할 수 없다. 임시 저장은 미완성 허용, 미리보기는 회사 정보 완성·요율 검증 필요. 미리보기 후 `양측에 서명 요청하기` 확인창에서 수신 이메일을 확인한다. 변경하면 기존 미리보기를 무효화한다. 저장 충돌 시 입력을 보존하고 확인 후 최신 저장본을 불러온다. 미저장 이탈 확인·로딩·실패 재시도·발송 결과 확인을 제공한다. | `AgreementPanel`, `AgreementFees`, `Dialog`, `ConfirmDialog` |
| P1 | `/home` | 신규 RFP, 임박 마감, 제출 완료, 수주율 | `KpiStrip`, `DeadlineWidget`, `RfpProgressWidget` |
| P2 | `/inbox` | 받은 견적 요청 표 목록. 상태(신규/견적 보냄/마감)·마감일·가맹점 등급 필터를 제공하며 `view` 쿼리나 과거 뷰 쿠키와 무관하게 항상 표로 표시한다. 작성중 단계는 제거 — 미제출 응답은 신규로 표시하되 접수 마감이 지나면 미선정으로 바꾸지 않고 마감으로 표시하며 작성·재요청 행동을 숨긴다. 재요청은 공용 RFP 마감이 아니라 해당 PG에게 지정된 응답 마감을 따르며 목록·칸반의 표시와 정렬에도 그 날짜를 쓴다. | `InboxList`, `BoardFilterBar`, `Chip` |
| P3 | `/inbox/:rfpId` | 구매사 메타·등급(있으면)·RFP 확인 + 정형 Bid 작성(딜룸 — B4 와 동일 `@modal` 인터셉트/정식 페이지 구조, `PgDealRoomBody`). **PG 딜룸의 중복 작업 레일은 제거하고 상단 탭으로 이동을 통합한다. 탭 순서는 `요청 조건` → 견적 상태 탭 → `첨부`이고 딜룸을 열면 `요청 조건`이 기본 활성이다** — 견적 상태 탭 이름은 접수 전 `견적 작성`, 제출 뒤 `보낸 견적`, 마감·취소·선정 뒤 `견적 결과`로 바뀌어 현재 할 수 있는 일을 설명한다. 조건을 먼저 읽고 견적을 쓰는 흐름이며, 선정 후 계약 탭이 생겨도 `요청 조건`이 맨 앞·기본이고 계약 탭은 그 다음이다(계약이 맨 앞·기본인 구매사 B4 와 다르다). 예외는 알림·메일 딥링크뿐이다 — 계약 알림·메일(선정 후 발송 대기·7일 재넛지·서명 상태 변경)은 `?tab=contract`, 재요청 알림·메일은 `?tab=write` 로 그 탭을 바로 연다(링크 단일 출처 `lib/rfp/pg-deal-room-link.ts`, 미선정 PG 가 계약 딥링크를 들고 와도 계약 탭은 생기지 않는다). 철회는 이미 보낸 견적이 있고 선정 전일 때 견적 상태 탭 본문에만 표시하며 기존 확인 다이얼로그를 거친다. 공용 마감 또는 해당 PG의 재요청 마감이 지나거나 선정이 끝나면 그 탭엔 상태 안내와 이미 보낸 견적만 남는다. 딜룸을 열린 채로 두어도 유효 마감 시각에 작성기를 닫는다. `RfpBriefPanel`은 구매사명·아바타·사업자번호·등급을 한 영역에 묶고, 결제수단 태그와 세부 요청을 사업 운영 정보보다 먼저 보여준다. 운영 정보는 라벨 옆 왼쪽 정렬 값을 두고 좁은 화면에서는 세로로 쌓는다. 딜룸 요청 조건의 첨부는 개수와 탭 이동 버튼만 표시하고 실제 미리보기는 첨부 탭에 모은다(튜토리얼 단독 패널은 기존 미리보기 유지). 내부 UUID 대신 견적 요청 번호를 표시하고, 현재 운영 솔루션(자체 개발·기타 상세 포함)과 기본/커스텀 요청 결제수단을 모두 보여준다. 사업자번호가 없으면 경고 칩과 일반 등급 가정 안내를 표시하고, 등급이 없으면 구매사 정보에 `미정` 칩을 표시한다. 마감일이 지나면 `마감`을 한 번만 표시하며, `closed`/`cancelled`/기한이 지난 `sent`에서는 상태 칩과 `견적 결과` 탭의 안내가 실제 상태를 반영하고 `BidWizard`를 렌더하지 않는다. **초안 자동 복원**: 작성 중이던 내용이 있으면 화면 열 때 묻지 않고 그대로 복원되고 토스트로 알린다(빈 초안은 복원 안 함 — `isPristineDraft` 판별). 사이드바의 `초기화` 버튼으로 확인 후 전체 리셋(정산조건·수수료·견적서까지). **견적 템플릿 불러오기**(1단계 상시 노출): 저장된 템플릿이 0개여도 빈 상태 안내 + `/quote-templates` 링크를 보여준다. 템플릿을 고르면 적용 토스트 노출. **딜룸 채팅**(B4 와 동일, 상대 = 구매사 고정 — `DealRoomChat` 이 `fixedCounterparty` 시드) — 견적 작성 중 질의응답·내부 메모. **선정 종료 후(결과 통합형)**: 견적 상태 탭의 제출 상태가 결과로 승격된다 — 본인 선정 시 `DealResultHeader`(award, `"이 견적이 선정됐어요"`) + 구매사 `ContactBlock`; 타사 선정 시 `DealResultHeader`(neutral, `"이번엔 선정되지 않았어요"`, 연락처 없음). 헤더 칩은 `선정됨`/`선정 마감`(`pgRequestChip`). 두 경우 모두 `보낸 내용 보기`(SubmittedSummary) 유지. **전자서명 '계약' 탭**(`SigningTab`, 본인 선정 시만): B4 와 동일한 구조·컴포넌트를 공유하되 위치는 `요청 조건` 바로 다음이고 기본 활성이 아니다(PG 딜룸은 항상 `요청 조건`으로 열린다 — 계약 진행 상태는 탭 이름 `계약 · <상태>`와 견적 상태 탭의 요약 스트립이 알린다). 카드 전체가 역할로 갈리는 것은 `awaiting_pg_template` 한 상태뿐 — PG 화면은 `계약서를 올리고 보내요` + `계약서 올리기` 단일 액션이고(누르면 스노우싸인 임베드가 딜룸 위를 덮는 거의 전체화면 모달 `SigningSendModal` 로 열린다 — 백드롭·Escape·닫기 세 경로 모두 '계약서 작성을 그만둘까요?' 확인을 거친다. 작업물이 스노우싸인 안에만 있어 언마운트가 곧 소실이기 때문이고, iframe 진행 상태를 읽을 수 없어 확인은 무조건 뜬다), 구매사 화면은 `PG사가 계약서를 준비하고 있어요` 대기 안내다. PG 대기 상태에는 보조 액션 `보낸 계약서 찾기`(`SigningRecoveryDialog`)가 함께 붙는다 — 발송은 됐는데 완료 신호가 유실돼 화면이 대기에 갇혔을 때, 이 딜로 보낸 계약서 후보를 받아 **사람이 골라** 잇는다(스캔/후보/실패/막힘 4단계 상태 기계, 자동 채택 없음). 두 액션 모두 동료가 발송 리스를 쥐고 있으면 토스트 대신 **확인 다이얼로그**로 이어받기를 제안하고(임베드는 `ConfirmDialog`, 스캔은 같은 다이얼로그의 `held` 단계), 이어받으면 밀려난 동료 화면은 인앱 알림을 받아 즉시 닫힌다. 쥔 사람이 본인이면 이어받기 대신 '다른 탭에서 작성 중' 안내만 띄운다. 선정 마일스톤 라벨만은 `send_failed`·발송 전 취소된 `canceled`에서도 역할별로 문구가 갈린다(구매사 '견적을 선정했어요' / PG '이 견적이 선정됐어요'). 미선정 PG 는 서명 상태를 절대 못 본다(봉인 경계 — 서버 로더가 `awardedToMe` 일 때만 조회). | `DealRoomModal`, `DealRoomFull`, `DealRoomShell`, `PgDealRoomBody`, `DealRoomCenter`, `RfpBriefPanel`, `BidWizard`, `SigningTab`, `SigningSendModal`, `SigningSendEmbed`, `SigningRecoveryDialog`, `SigningSummaryStrip`, `AwardContextLine`, `DealRoomChat`, `DealRoomChatFab`, `ChatPanel`, `DealRoomContext`, `DealResultHeader`, `ContactBlock`, `CopyButton` |
| P4 | (P3에 통합) | 제출 완료·결과 대기·수정/철회 안내는 `/inbox/:rfpId` 딜룸에서 인플레이스로 보여준다. 맞춤 상담의 철회 확인창은 해당 상담에 재제출할 수 없음을 알리고, 진행 중인 요청이면 구매사의 다음 PG 상담 가능성과 수정 목적의 견적 재요청 경로를 함께 안내한다. 기존 1:N 견적에는 맞춤 상담의 영구 종료 안내를 붙이지 않으며 선정 후 철회는 비활성화한다. | `PgDealRoomBody`, `BidWizard` |
| P7 | `/opportunities` | 오픈 RFP 게시판 — 초대받지 않은 PG가 발견·콜드 피치. 공개는 비경쟁 화이트리스트(`OpportunityListing`)뿐, 수수료·현재 조건 등은 비노출. PG 홈 탐색 섹션의 "전체 보기" 대상 | `OpportunityList`, `OpportunityRequestDialog` |
| P5 | `/settings/profile` | PG 회사 정보 (워크스페이스 이름·연락처). **사용자 섹션**: 프로필 사진 업로드·삭제(`UserAvatarForm`) + **휴대폰 인증**(`UserPhoneForm` — B6 와 같은 컴포넌트. PG 담당자도 서명 당사자라 번호가 없으면 발송이 막힌다). **워크스페이스 로고는 승인된 admin·운영계정이 편집하고, 이름은 같은 권한으로 변경 요청**(B6 와 동일한 운영자 심사·`canEditWorkspace` 술어 — 사업자번호 폼은 buyer 전용이라 PG 화면에 없음) | `UserAvatarForm`, `UserPhoneForm`, `WorkspaceLogoForm`, `WorkspaceNameForm` |
| P6 | `/settings/members` | 같은 워크스페이스 멤버 관리(도메인 자동 합류 없음 — 초대만). 권한과 마지막 승인 admin 보호는 B7과 같다. | `MembersPanel`, `InviteMemberForm` |
| P8 | `/quote-templates` | PG 워크스페이스 공유 견적 템플릿(요율표) 관리 — 정산조건+가입비+결제수단별 수수료율 프리셋 CRUD. 견적 작성(P3)에서 불러와 한 번에 채움 (상한은 `MAX_QUOTE_TEMPLATES` — `lib/quote/limits.ts` 단일 출처. 서비스 강제·목록 하단 Note·`LIMIT_REACHED` 문구가 모두 여기서 파생하므로 숫자를 여기에 복제하지 않는다). 구간 수수료(카드·네이버페이·카카오페이·토스페이·애플페이·삼성페이) 직접 편집 지원. nav top 레벨 (G→Q). **리스트 페이지 문법**: `PageHeader` 스트립(제목 + 개수 칩 + 부제 + 우측 액션) + `flex-1 overflow-auto px-6 py-4` 본문. 부제가 현재 단계를 안내하므로 별도 스텝 표시는 없다. 폼 열은 `max-w-[880px]`, 산문(`Note`·도움말)은 `max-w-[640px]`. (이 문법은 예전 `/signing-templates` 화면과 공유하다 그 화면이 v0.4.37.0 에서 폐지됐고, 이후 P9 번호는 `/contract-templates` 가 재사용한다 — 아랫줄 P9 는 폐지된 옛 화면과 무관한 신규 화면이다.) 목록이 비면 헤더 액션을 감추고 `EmptyState` 가 CTA(`새 템플릿 만들기`)를 소유한다. 저장 상한은 목록 하단 `Note`. 편집은 `Sheet`(base-ui Dialog — 스크림·Esc·포커스 트랩·닫기 버튼), 푸터는 취소 → 저장 순. **복제·삭제는 성공·실패 모두 토스트, 저장은 성공 토스트 + 실패는 드로어 본문 인라인**(저장 실패 시 드로어가 열린 채 남으므로 인라인이 보이는 표면이다). 문구 SSOT 는 `lib/quote/error-messages.ts`. | `QuoteTemplateList`, `QuoteTemplateDrawer`, `PageHeader`, `EmptyState`, `Note`, `Sheet`, `ConfirmDialog`, `Chip` |
| P9 | `/contract-templates` | **전환 전 명세 — 공통 합의서 전환으로 현재 진입 불가.** **kill switch `CONTRACT_TEMPLATES_ENABLED`(`lib/features/contract-templates.ts`), 현재 꺼짐 (v0.4.49.0 숨김 → v0.4.56.0 재활성화)** — 끄면 사이드바·⌘K·`G`→`C` 진입점이 사라지고 이 경로는 준비중 안내(`ContractTemplatesUnavailable`)만 렌더하며(리다이렉트 아님 — 북마크로 들어온 PG 가 조용히 튕기지 않도록) 견적 작성 4단계 피커와 딜룸 `연결된 템플릿으로 보내기` 지름길도 함께 숨는다. 계약서 템플릿 관리 — PG 전용, 목록 + PDF 에디터로 신규 템플릿 등록. 견적 템플릿에 연결해 두면 선정 후 딜룸 `계약` 탭에서 스노우싸인 임베드를 열지 않고 그 자리에서 바로 계약서를 보낼 수 있다(`SigningTab` `연결된 템플릿으로 보내기`). 목록 문법은 P8 `/quote-templates` 와 동일(`PageHeader` + `EmptyState`), 등록은 `ContractTemplateEditor`(PDF 업로드 + 서명칸 배치)가 리스트를 통째로 대체하되 **에디터도 `PageHeader` 셸을 유지한다** — 취소·저장이 헤더에 고정돼 문서가 길어져도 저장이 항상 보이고, 작업물(올린 PDF·배치 필드)이 있는 취소는 `ConfirmDialog` 확인을 거친다 (v0.4.42.1). 업로드는 대시 보더 드롭존(네이티브 파일 인풋은 숨김) + 본문 전체 드래그&드롭(업로드 후 드롭 = 문서 교체 — 같은 PDF 재업로드는 배치 필드 유지, 다른 문서면 초기화), 서명 필드 도구는 구매사/PG사 파티별 그룹, 선택 필드는 primary 테두리 강조, 저장 조건(PDF·이름·양측 서명 필드)은 충족 여부가 계속 보이는 체크리스트로 편다. 입력 한도(템플릿 이름·PDF 크기)는 `lib/signing/template-limits.ts` 단일 출처 — 클라이언트 캡과 서버 zod 스키마가 같은 값을 보므로 숫자를 여기에 복제하지 않는다. **기존 템플릿 확인·수정 (v0.4.43.0)**: 행의 `수정` 버튼이 detail 액션(이름·서명칸 되읽기) + PDF 프록시 fetch 를 **병렬 프리페치**하고 둘 다 성공했을 때만 같은 에디터를 `initial` 채워진 채 연다(실패는 목록 위 토스트 — 반쯤 열린 에디터 표면 없음). 프리페치 중에는 다른 진입점(다른 행 수정·새 템플릿 만들기·삭제)을 잠그되 **방금 누른 버튼 자신은 활성 유지 + `aria-busy` + ref 재진입 가드**(disabled 는 포커스를 떨궈 스크린리더가 침묵에 방치된다, v0.4.45.0) — sr-only `role=status` 가 진행을 공지한다. 수정 저장은 SnowSign 에 수정 API 가 없어 **재생성 후 링크 행 교체**(bids 연결 보존)이고, 업로드는 저장 버튼 시점에 처음 나간다(deferred — 배치 작업 시간이 세션 TTL 에 안 잘림). 같은 바이트로의 저장 재시도는 업로드 세션을 재사용한다(조직 공유 3슬롯 보호). **수정이 저장되면 이 템플릿을 골라 둔 기존 견적의 발송에도 새 판이 쓰인다**(연결은 행 단위 — 그것이 수정의 목적). 삭제는 `ConfirmDialog` 확인 후 실행 — 이 템플릿을 골라 둔 견적의 연결이 함께 끊어지므로 즉시 삭제보다 확인 한 단계를 둔다(내용 수정은 이제 `수정` 으로 가능). **UX 구조 하드닝 (v0.4.45.0)**: ① 라우트에 `loading.tsx`(`ContractTemplatesPageSkeleton` — 헤더 스트립+행 3개 미러) ② 업로드는 XHR 로 바이트 진행률 표시(생성=상태 라인 `PDF를 올리는 중이에요… N%`, 수정 저장=버튼 `저장 중… N%`), 네트워크 단절은 파싱 실패와 다른 문구 ③ 드롭존이 dragover 활성 상태로 반응하고 제한(PDF 1개·최대 용량 — `template-limits` 파생)을 사전 고지 ④ 배치 필드가 있는 채 **다른 문서**로 교체하면 업로드·파싱 전에 `ConfirmDialog`(닫기=완전 무변화, 같은 파일 재선택은 무마찰) ⑤ 서명 필드 툴바가 sticky(멀티페이지엔 `필드를 추가할 페이지` Select — currentPage 의 키보드 진입점, hover 와 동기) + 미충족 저장 조건 요약 한 줄(`save-requirements`, 저장 버튼 `aria-describedby`) ⑥ 배치 필드 키보드 접근: 포커스 가능(role=group·접근성 이름 `…필드, N페이지`), 포커스=선택, 화살표 4px/Shift 16px 넛지, Delete 삭제, XIcon 24px 삭제 버튼. 이탈 확인창의 왼쪽 버튼은 `계속 작성하기`/`계속 수정하기`(잔류 라벨 — v0.4.44.0 `닫기` 기본값의 명시 예외). **서식 종류가 둘이 됐다 (v0.4.57.0)**: 목록 행에 종류 칩(`PDF`/`조항형`)이 붙고, 만들기 진입점이 `조항으로 작성`·`PDF 올리기` 둘로 갈린다. **이 갈래 때문에 빈 상태 문법이 P8 과 갈라진다 (v0.5.1.0)** — P8 은 `EmptyState` 가 CTA **하나**를 소유하지만 P9 는 **둘 다** 소유한다. 종류 선택은 행동이 아니라 갈래라, 빈 화면에 하나만 두면 나머지 종류가 **첫 화면에서 도달 불가**가 된다(헤더 액션은 빈 목록에서 감춰지므로 — 실제로 조항형이 그렇게 가려져 있었고, 신규 PG 는 전원 PDF 경로로 밀렸다). "한 화면에 primary 하나"는 그대로다: `filled` 은 `조항으로 작성` 뿐이고 `PDF 올리기` 는 `outlined` 다. 조항형 행의 `수정` 은 PDF 프록시를 부르지 않고 곧바로 `ClauseTemplateEditor` 를 연다(pdfjs 에디터로는 절대 열리지 않는다 — 실제 게이트는 서버의 `getDocumentDownloadUrl` 이 composed 에 `TEMPLATE_NOT_FOUND` 를 내는 것이고, 목록 분기와 타입 불가능성은 그 위의 편의층이다). | `ContractTemplateList`, `ContractTemplateEditor`, `ClauseTemplateEditor`, `ContractTemplatesPageSkeleton`, `PageHeader`, `EmptyState`, `Note`, `ConfirmDialog`, `Select` |
| P9-1 | `/contract-templates` (조항형 에디터) | **전환 전 명세 — 공통 합의서 전환으로 현재 진입 불가.** **조항 기반 계약서 작성** — `ClauseTemplateEditor` 가 리스트를 대체하며 P9 와 같은 `PageHeader` 셸(취소·저장 고정)을 유지한다. 좌측은 문서 구조(제목 → 전문 → 조항 목록 → 말미문언), 우측은 **실제 렌더된 PDF 미리보기**(`<iframe>`, 700ms 디바운스로 `POST /api/signing/templates/preview`, 이전 object URL 은 교체 시 revoke). 새로 만들면 기본 조항 18개가 시드된다. 조항 조작은 추가·삭제·**위/아래 버튼 재정렬**(드래그 아님 — 1차원·소수 항목이라 드래그가 필수가 아니고 위/아래는 키보드·스크린리더에 그냥 접근 가능하다). 제N조 번호는 저장하지 않고 렌더 시 자동 부여되므로, 기본 문안은 **숫자 상호참조를 쓰지 않는다**(조항을 끼우면 참조가 조용히 어긋난다 — 참조 토큰은 후속 과제). 본문의 `{{토큰}}` 은 등록 목록에서 고르며 미등록 토큰은 저장이 거부된다. 화면이 반드시 고지하는 것 둘: ① 미리보기의 자리표시자(`〔정산주기〕`)는 실제 값과 길이가 달라 **줄 수·쪽 나눔이 달라질 수 있다** ② 기본 문안은 **법률 자문이 아니다**. | `ClauseTemplateEditor`, `PageHeader`, `Note`, `ConfirmDialog` |

### 0.3a 공용 화면 (buyer · pg 공통)

| # | Route | Purpose | Primary Components |
|---|---|---|---|
| C1 | `/contracts` | **계약 보관함** (buyer+pg 공용, nav top `G`→`A`) — 완료된 계약을 모아 보는 **유일한 횡단 화면**이다(그 전에는 딜룸에 들어가야만 계약이 보였다). 두 출처가 한 목록에 선다: 전자서명이 완료되면 완료본·감사추적인증서 사본이 R2 에 **자동 보관**되고(`ensureFinalized` 훅 + cron 백필), 플랫폼 밖에서 맺은 계약서는 PDF 로 **직접 업로드**한다(2-phase presign, 30MB, 워크스페이스당 200건 캡). 행은 2행이다 — 윗줄에 제목 + 출처 칩(`전자서명 완료`=tertiary / `직접 업로드`=surface) + 상태 칩, 아랫줄에 상대방 · 체결일(`.md-numeric`) · 견적번호. **견적번호는 딜이 살아 있을 때만 링크다** — RFP 삭제로 signing 행이 죽으면(FK SET NULL) 스냅샷은 남지만 딜은 없어 링크가 404 로 간다. 다운로드는 `/api/contract-archives/{id}/download?doc=document|audit` 302 presigned GET(TTL 15분, `private, no-store`) — 딜룸의 온디맨드 프록시와 달리 **우리 R2 사본**이라 공급자와의 관계가 끝나도 살아 있다. **보존 원칙**: 자동 보관본은 지울 수 없고(서버가 SSOT, UI 는 버튼 자체를 렌더하지 않음) 직접 업로드만 삭제 가능하다. `pending` 은 warning 칩 `보관 준비 중`(다운로드 링크 없음 — 바이트가 아직 R2 에 없다), `failed` 는 error 칩. **목록은 서버 페이지네이션이다 (v0.18.0.0)** — `coalesce(contracted_at, created_at)`+`id` 키셋 커서로 **50건씩** 끊고 하단 `더 보기` 가 다음 페이지를 이어 붙인다(이미 실린 id 는 건너뛴다). 페이지 크기는 서버가 정하고 커서·검색어는 액션의 zod 게이트를 지난다. 전체 건수를 한 번에 알 수 없으므로 헤더 카운트는 없앴다. 그 전까지 목록은 무제한이었다 — 업로드 200건 캡은 `source='upload'` 만 세고 서명 출처 행(완료 계약당 2행)에는 캡이 없기 때문(TODOS.md 계약 보관함 P3 — 해결). **검색도 서버로 옮겼다** — 입력을 250ms 디바운스해 `listContractArchivesAction({ query })` 로 보내고 SQL `ILIKE` 가 현재 페이지가 아니라 **보관함 전체**를 훑는다(LIKE 메타문자 이스케이프, 100자 상한). 대상은 제목·상대방 두 칼럼이며, 그 대가로 견적번호 검색과 `es-hangul` 초성 검색은 빠졌다(둘 다 클라이언트 필터 `lib/contract-archive/search.ts` 의 기능이었고 그 모듈은 이제 화면에서 쓰이지 않는다). 로드 실패는 빈 상태로 위장하지 않고 재시도 경로를 준다. 목록 문법은 P8 `/quote-templates` 와 동일. | `ContractArchiveList`, `ContractArchiveUploadDialog`, `PageHeader`, `EmptyState`, `ConfirmDialog`, `Chip`, `Dialog` |
| S2 | `/settings/audit-log` | **활동 기록** (admin·운영계정) — 워크스페이스 감사 로그 최신순 목록. 운영계정은 워크스페이스 멤버십이 없어도 현재 선택한 워크스페이스의 기록을 볼 수 있고 행에 `운영자` 배지가 붙는다. 신규 이름·멤버 관리 기록은 작업 당시의 운영계정 권한을 `actorWasMaster`로 저장하며, 값이 없는 레거시 기록만 조회 당시 allowlist로 판정한다. 행위자 이름 · '견적' 언어 행위 라벨 · RFP 코드 링크(buyer는 `/rfp/`, pg는 `/inbox/`) · 시각. 커서 기반 '더 보기'(50건). 일반 member 에겐 안내 문구만. 기록은 서비스 레이어가 각 작업 트랜잭션 안에서 `audit_logs` 에 남긴다(rfp.create/send_invitations/award/cancel/close/requote/board_visibility, bid.submit/withdraw, workspace.create/member_invite/member_invite_resend/member_invite_cancel/invite_accept/member_role_change/member_remove; auth.* 는 워크스페이스 무관이라 목록 비노출) | `AuditLogPanel`, `listAuditLogsAction` |
| S1 | `/messages` | 워크스페이스 페어(구매사↔PG) **라이브 채팅**. 2-컬럼: 좌측 대화 목록(미읽음 점) + 우측 스레드(말풍선·날짜 구분·읽음 영수증·프레즌스·타이핑). RFP는 메시지 태그로 표시(스레드 말풍선에 RFP 칩 — 로더가 `rfpById` 제공). **대화 정보의 견적 요청 카드는 역할에 맞는 상세 화면으로 바로 이동한다**(구매사 `/rfp/:id`, PG `/inbox/:rfpId`). **통합 메시지함**: 좌측 목록은 상대방 대화(쌍 단위·RFP 무관)와 RFP 팀 채팅(`rfp_team_messages`, 워크스페이스 내부)을 `[전체 \| 상대방 \| 팀]` 필터로 한데 보여준다. 팀 스레드도 읽음상태(`rfp_team_message_reads`)·안읽음·인앱/이메일 알림까지 상대방 채팅과 동등(풀 패리티), `?t=<rfpId>` 딥링크로 연다(딜룸 '팀 채팅' 탭의 "메시지함에서 열기" + 홈 위젯 행에서 진입). 좁은 화면에서는 팀 스레드 상단의 견적 번호도 같은 상세 화면으로 이동한다. 리치 작성 드로어(저장 템플릿/첨부/이메일·인앱 알림 토글). `MessageComposeButton`으로 RFP 상세·입찰표에서 진입(ComingSoon 제거). 구매사↔PG만(PG 상호 비공개 유지), 이메일 조회로 콜드 컨택 가능. **스레드 시각 규칙**: 중앙 날짜 구분선(라인 없음)·타임스탬프는 버블 옆 단일 출처·셀프 버블 `primary-container`. `ThreadView`/`ThreadPane`은 `variant='rail'`로 상세 화면 채팅 레일에 재사용(갤러리는 오버레이). 전송 직후 낙관적 말풍선을 목록에 즉시 표시하며, 실패 시 입력 내용과 첨부를 복원한다. | `MessageInbox`, `ConversationList`, `ThreadView`, `TeamThreadView`, `TeamThreadPane`, `MessageComposeButton`, `NewConversationSheet`, `useChatChannel`, `listInboxForViewer`, `markTeamThreadReadAction` |

**설정 화면 표시 규칙(B6·B7·P5·P6·S2):** 세 화면의 제목 크기와 간격을 통일하고, 프로필 본문은 최대 960px·멤버와 활동 기록은 최대 1120px로 읽기 폭을 제한한다. 프로필은 라벨·값·수정 행동을 왼쪽 흐름으로 배치하고 사용자 사진과 워크스페이스 로고를 구분한다. 휴대폰 미등록은 인증 필요 칩과 기본 행동으로 알리되 오류로 취급하지 않으며, 워크스페이스 이름의 운영자 승인 안내는 편집 전에도 보인다. 멤버는 역할을 항상 표시하고 관리 메뉴는 분리하며, 최근 접속·서버에 저장된 초대 날짜를 명시하고 좁은 화면에서는 내용을 줄바꿈한다(새로 초대한 행은 재진입 전까지 `방금 초대`로 표시). 활동 기록은 긴 내용을 자르지 않고, 저장된 메타데이터가 있는 사건에 한해 안전한 요약을 더한다(개인정보·원시 메타데이터 비노출). 더 보기 실패 시 기존 목록을 유지하고 일시 오류에는 재시도, 워크스페이스 전환에는 새로고침을 제공하며 권한 상실은 안내만 한다. 기간·활동 종류 필터는 이번 화면 범위에 포함하지 않는다.

> 실시간 전송은 Centrifugo(자체호스팅 WS) — 미설정 환경에선 정적 로드로 graceful degrade. 이메일 알림은 presence 억제 + 윈도우 digest로 폭주 방지. `/notifications`·`/workspace/new` 도 buyer·pg 공통.
>
> 라이브 인앱 알림 toast(`useNotifications`): 접속 중 새 알림이 SSE 로 도착하면 제목을 우하단 toast 로 발화한다(미읽음 배지는 그대로 증가). 폭주 방지로 `TOAST_COALESCE_MS`(4s) 윈도우 안에는 1회만 발화하고, 사용자가 이미 `/notifications` 목록을 보고 있으면 중복 신호이므로 생략한다. **메시지 토스트는 대화로 바로 이어진다 (v0.11.3.0)** — `chat.message`의 정확한 `/messages?c=<conversationId>`와 `team_chat.message`·`team_chat.mention`의 정확한 `/messages?t=<rfpId>`에만 키보드로 누를 수 있는 `대화 보기` 액션을 붙인다. 일반 알림·식별자 없는 레거시 `/messages`·외부 URL·깨진 URL·추가 쿼리가 붙은 비표준 링크에는 액션을 만들지 않으며, 4초 안의 후속 알림은 먼저 표시된 토스트의 이동 대상도 바꾸지 않는다. **채팅 스레드를 보고 있어도 toast는 유지한다** — SSE 알림은 실시간 메시지 publish 성공보다 먼저 발생하고 publish는 best-effort라, 열린 화면만으로 말풍선 도착을 증명할 수 없다. 재구독 race 로 같은 id가 다시 와도 prepend 전 신규 판정으로 중복 toast 를 막는다(history hydrate 는 `setAll` 경로라 toast 안 됨). toast 폭은 `min(92vw,24rem)` 로 클램프 + 제목 `line-clamp-2`.

### 맞춤 상담 화면 변경 (2026-09-19)

| 경로 | 변경 |
|---|---|
| `/rfp-create` | 최종 단계 상단의 `RfpMatchingSelection`: 실제 조회 진행률, 접수 분류, 한 곳 선택, 조건부 예상 수수료, 재시도·문의 |
| `/rfp/:id` | `BuyerMatchingStatus`: 상담 요청 완료·검토·견적 도착, 거절 사유·이력, 다음 후보 선택·새 마감일. 견적 도착 후 기존 비교·선정. 무응답·조건 불만족 시 `다른 PG 상담을 문의해요`가 견적번호·현재 PG·상담 상태를 담은 운영팀 이메일 작성을 연다. 전송은 사용자가 이메일 앱에서 완료하며 문의만으로 상담을 끝내거나 PG를 전환하지 않는다. 미응답 상태로 견적 마감에 도달하면 열린 화면에서도 대기 안내 대신 접수 종료와 문의 경로를 보여준다. 이미 도착한 견적은 마감 후에도 선정할 수 있고, 선정·종료·취소 뒤에는 전환 문의를 감춘다. |
| `/inbox/:rfpId` | `PgReviewPanel`: 검토 시작·사유 입력·거절. 종결 상담의 견적 제출 차단. 자기 이력만 표시 |
| 별도 관리자 `/pg-recommendations` | 업종별 접수 분류·PG 순서·사유·예상 요율·적용 조건 저장 |

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
  ├─ 아코디언: 전체 결제수단 요율 / PG 메모·제안서 PDF (견적별 '내 메모'는 제거 — 팀 채팅으로 일원화)
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
딜룸 채팅 + 팀 채팅 (확정 결정 2026-06-10; 레일 → 딜룸 모달 개편 2026-06-14)
/rfp/:id · /inbox/:rfpId 딜룸 채팅 (DealRoomShell 우측 aside, w-96, lg+ — lg 미만은 DealRoomChatFab 하단 시트)
  견적/RFP 클릭 → @modal 인터셉트 블러 모달(DealRoomModal), 새로고침·딥링크는 정식 페이지(DealRoomFull)
  ├─ 탭 [상대방 채팅]: 기존 buyer↔PG 페어 대화 임베드 (ChatPanel → ThreadPane variant='rail')
  │     ├─ 상대 출처 = DealRoomContext (딜룸 스코프, DealRoomShell 에 key={code} 마운트 — 전역 스토어 아님) — 구매사: FocusComparison 이 useDealRoom().setCounterparty 로 포커스 PG publish(탭 추종),
  │     │   PG: DealRoomChat 이 fixedCounterparty(구매사) 를 마운트 시 시드
  │     ├─ wsId→conversationId 는 **읽기 전용** lookupConversationAction 으로 해소 — 열람·포커스만으로는
  │     │   어떤 행도 생성하지 않는다(빈 대화가 상대 인박스에 뜨면 관심 신호 누출 — sealed-bid).
  │     │   대화가 없으면 새 대화 컴포저를 띄우고 **첫 메시지 전송 시점에만** 생성
  │     ├─ 컴포저 전송에 해당 RFP 태그 기본 적용 (ThreadView defaultRfpId)
  │     └─ **선정 종료 시 미선정 PG 대화 닫힘**(2026-06-23): RFP 가 `awarded` 면 미선정 PG 와의 상대방
  │         채팅 컴포저를 비활성화하고 `ClosedConversationNotice`("견적 선정이 끝나 이 대화는 종료됐어요.")를
  │         띄운다. 구매사는 미선정 PG로 포커스 전환 시(`buyerClosedCounterpartyIds`, 승자 제외·멀티라운드 1회 집계),
  │         PG는 본인 미선정 시(loader `awardedToMe=false`, 승자 신원 비노출·본인 여부만 파생). 선정 PG·팀 채팅은
  │         계속 열림. 범위(의도): 이 견적 딜룸 컨텍스트에 한정(대화방 row 는 페어 단위 공유라 다른 RFP 대화 무영향),
  │         `awarded` 만 대상(`cancelled`/`closed` 제외), **UI 한정**(서버 sendMessage 게이트 없음 — `/messages` 크로스-RFP 뷰는 계속 열림)
  └─ 탭 [팀 채팅]: RFP 단위 워크스페이스 내부 스레드 — v1 확정 결정:
        ├─ 스코프 = (rfpId, workspaceId), rfp_team_messages append-only
        ├─ 멘션/알림/읽음 없음 (의도적 경량). **첨부(PDF·이미지) 지원** — 견적별 '내 메모'를 흡수(2026-06-14):
        │     업로드 ownerKind='team_message'(ownerId=rfpId) → 전송 시 메시지로 재부모, attachments.rfp_team_message_id 5번째 arc
        │     읽기 ACL = 같은 워크스페이스 멤버만(sealed-bid: 상대 측 첨부 비공개)
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

구매사(셀러)와 PG사 영업담당은 **처음부터 별도 경로**로 가입한다. `/signup` 진입 시 역할 선택 화면 없이 **요청 호스트**가 자동으로 분기한다(`support-b.com` → /signup/buyer, `partner.support-b.com` → /signup/pg). 각자에게 맞는 컨텍스트와 필드로 진행하며, 단일 P6 워크스페이스 선택 화면은 제거됐다.

> **화면 ID 규칙**: B1~B7 = 구매사 앱 화면, P1~P6 = PG 앱 화면. 가입 전용 ID는 `s` 접미사 사용 — Rs1(호스트 redirect, 화면 없음), Bs1~Bs4(구매사 가입), Gs1~Gs4(PG 가입).

### 1.1 진입 경로

- **D · 구매사 신규 가입**: `/signup` → (호스트가 buyer이면 자동) Bs1~Bs4 → `/rfp` (관리자)
- **E · PG RFP 초대 진입**: `/invite/rfp/:token` → 기존 PG 유저 로그인 → `/inbox/:rfpId` (기존 워크스페이스 전제)
- **E2 · PG 워크스페이스 초대 진입(신규 유저)**: `/invite/workspace/:token` → Gs1(email 고정) → Gs3(profile) → Gs4(verify, 3단계) → `/home` (기존 ws에 member 합류, 새 워크스페이스 미생성)
- **E3 · PG 워크스페이스 초대 진입(기존 유저)**: `/invite/workspace/:token` → (authed) → acceptWorkspaceInviteAction → `/home`
- **F · PG 직접 가입**: `/signup` → (partner 호스트이면 자동) Gs1~Gs2~Gs3~Gs4(4단계) → `/inbox` (새 워크스페이스 생성, 관리자 심사)
- **G · 비밀번호 분실**: 로그인 화면에서 재설정 요청 → 메일 → 새 비밀번호

### 1.2 화면 목록

#### 공용 / 인프라

| # | 라우트 | 제목 | 핵심 |
|---|---|---|---|
| — | `/` (비인증) | redirect | → `/login?next=...` |
| — | `/login` | 로그인 | 이메일 + 비밀번호 |
| — | `/login/ops` | 운영자 로그인(숨김) | Google OAuth 전용. MASTER_ACCOUNT_EMAILS allowlist default-deny. 킬스위치 off 시 404 |
| — | `/auth/verify?token=...` | 인증 처리(스플래시) | 토큰 검증 → workspaceType 분기 후 각 profile로 |
| — | `/password/forgot` | 비밀번호 찾기 | 이메일 → 재설정 링크 |
| — | `/password/reset?token=...` | 비밀번호 재설정 | 새 비밀번호 → 자동 로그인 |
| — | `/invite/workspace/:token` | 워크스페이스 초대 수락 | 신규 유저는 가입 플로우로, 기존 유저는 즉시 합류 (§1.4 시나리오 E2·E3) |
| — | `/auth/email-change?token=...` | 이메일 변경 확인 | 기존 사용자 이메일 변경 |
| — | `/logout` | 로그아웃 | POST: 세션 클리어 → `/login` |

#### 가입 진입점 (역할 선택 없음)

| # | 라우트 | 제목 | 핵심 |
|---|---|---|---|
| Rs1 | `/signup` | 호스트 기반 redirect | 화면 없음. 요청 호스트로 자동 분기 — partner → /signup/pg, 그 외 → /signup/buyer. `?next=` 전달 |

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
- 좌상단 워드마크 `B  서포트비` + serial `EDITION 01`
- 중앙 카드 max-w 380, 헤어라인 외곽
- 필드: 이메일(`autocomplete=email`) / 비밀번호(`autocomplete=current-password`, 보기 토글)
- "로그인 유지" 체크박스 (30일 세션)
- 1차 [로그인] full-width
- 보조 링크: `비밀번호를 잊으셨나요?` → `/password/forgot`
- 푸터: `처음 오셨나요? 회원가입 →` → Rs1 (호스트가 자동 분기)
- 5회 실패 → 캡차, 10회 → 15분 락
- `next` 쿼리 보존

#### Rs1 가입 진입점 `/signup` (화면 없음 — 서버사이드 redirect)
- 사용자에게 보이는 화면 없음. 서버 컴포넌트가 요청 `Host` 헤더를 읽어 즉시 redirect.
- `partner.support-b.com` → `/signup/pg` (Gs1)
- 그 외 (`support-b.com`, 단일호스트 로컬, 미상) → `/signup/buyer` (Bs1)
- `?next=` 쿼리스트링은 목적지로 그대로 전달, step-1 페이지(Bs1/Gs1)가 흡수함
- 구현: `lib/site-routing.ts` → `signupTargetForHost(host, appOrigins())`
- 기 세팅된 `SignupDraft`(초대 토큰 진입 시) 존재하면 Rs1 건너뜀 (기존과 동일)

#### Bs1 구매사 — 이메일 `/signup/buyer`
- `01 / 04 — EMAIL`
- 헤드라인: `구매사 계정을 만듭니다`
- 이메일 입력, 실시간 형식 검증
- 회사 이메일 권장 안내(`SignupEmailGuide`): 인풋 아래 상시 중립 힌트 "회사 이메일을 입력해주세요" → 무료(개인) 도메인(gmail/naver 등, `lib/auth/free-email-domains.ts`) 감지 시 amber 경고 한 줄로 전환 "기업 메일 없는 사업장이나 공동 도메인 이메일이 없는 분들은 별도 심사 과정이 추가될 수 있어요." (비차단, EMAIL_TAKEN/마스터 에러 표시 중에는 숨김. 라이브 리전 role="status"는 상시 유지)
- 약관/개인정보(필수 2종) + 마케팅(선택), 전체 동의 토글
- [인증 메일 받기] 제출 시: `checkEmailAvailableAction` 으로 이메일 중복 확인 → 이미 가입된 이메일이면 "이미 가입된 이메일입니다. 로그인하시겠어요?" 인라인 오류 + `/login?email=...` 링크 표시 (버튼 비활성 `처리 중…` 후 복귀)
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
- **사업자번호 조회 저하 모드 (확정 결정, v0.4.29.0)** — Bs4·Gs2 공통. 아래 §사업자번호 조회 저하 계약 참조.

#### Gs1 PG사 — 이메일 `/signup/pg`
- `01 / 04 — EMAIL` (직접 가입) 또는 `01 / 03 — EMAIL` (초대 가입)
- 헤드라인: `PG사 계정을 만듭니다`
- 이메일 입력 + 약관 동의 (Bs1과 동일 패턴 — EMAIL_TAKEN 인라인 오류 + 로그인 CTA, 회사 이메일 권장 안내 `SignupEmailGuide` 포함. 단 초대 가입은 이메일이 고정이라 안내 숨김)
- 보조 안내: "초대 이메일을 받으셨나요? — 메일의 링크를 클릭하면 이 단계가 자동으로 건너뛰어집니다."
- 푸터: `이미 계정이 있으세요? 로그인 →`

#### Gs2 PG사 — 워크스페이스 생성 정보 `/signup/pg/workspace` (직접 가입 전용)
- `02 / 04 — WORKSPACE` (직접 가입 전용; 초대 가입은 이 단계를 건너뜀)
- 헤드라인: `워크스페이스를 만듭니다`
- 입력 필드: 워크스페이스 이름 + 사업자등록번호(10자리)
- 제출 → draft에 wsName/bizNo 저장 → `/signup/pg/profile`
- 초대 경로 진입 시 자동으로 `/signup/pg/profile`로 redirect
- **사업자번호 조회 저하 모드**: 아래 §사업자번호 조회 저하 계약 참조.

#### 사업자번호 조회 저하 계약 (확정 결정, v0.4.29.0) — Bs4 · Gs2 공통

국세청(odcloud) 조회 API 장애 시 **가입을 막지 않는다**. 조회 성공을 제출 하드
게이트로 걸어 두면 3rd-party 가용성에 가입 퍼널이 직결된다(실제로 전면 정지한 적 있음).

- **사용자 화면에는 오류가 뜨지 않는다.** 인프라 오류(`NTS_UPSTREAM_DOWN`·`NTS_NETWORK`·
  `NTS_NO_KEY`·`NTS_INVALID_KEY`)면 `BizLookupField` 가 `role="alert"` 없이 미검증으로
  통과시키고 `확인은 가입 심사 중에 완료돼요.` 한 줄만 중립 톤으로 안내한다. 확인 배지
  (`✓ 확인됨`)·과세 유형·사업자 상태는 조회를 못 했으므로 렌더하지 않는다.
- **사용자 오류는 그대로 보인다.** 미등록·폐업/휴업·미지원 사업자 유형은 기존 안내 유지.
- **레이트리밋은 저하 대상이 아니다** — in-process 버킷(10 req/s)은 남용 방어선이라,
  통과시키면 버킷을 고갈시켜 검증을 우회하는 경로가 열린다. 기존 재시도 안내 유지.
- **판정은 서버가 한다.** `resolveBizProfileForWrite` 가 쓰기 시점에 직접 조회한다 —
  클라이언트가 보낸 `taxType`/`status` 는 쓰지 않는다(생략 우회·값 위조 동시 차단).
- **최종 방어선은 관리자 승인.** 워크스페이스는 원래대로 `pending` 이고, 미검증 건은
  `risk_flags(biz_unverified)` + 심사 요청 메일 제목 `⚠ 사업자번호 미검증` + 본문 경고
  블록으로 **운영자에게만** 알린다. 회로 차단기 open/close 전이는 Sentry 1회.
- **설정 화면(B6 사업자번호 변경)은 저하에서 제외**(`ntsLookupStrict`) — 이미 승인을
  통과한 워크스페이스에는 승인 게이트라는 방어선이 없어 바꿔치기 경로가 된다.

#### Gs3 PG사 — 프로필 `/signup/pg/profile`
- `02 / 03 — PROFILE` (초대 가입) 또는 `03 / 04 — PROFILE` (직접 가입)
- Bs3과 동일 필드/패턴 + 휴대전화 OTP (아래 자동 제출 계약 적용)

#### OTP 자동 제출 계약 (v0.4.28.0 — 두 입력 공통)

앱의 OTP 는 전부 6자리 고정이라 **마지막 자리를 채우는 순간 자동 제출**된다. 적용 대상은 휴대전화 인증번호(`PhoneVerificationField`, Gs3)와 가입 직후 이메일 인증 코드(`EmailVerifySection`, `/pending-approval`) 두 곳이며, 로직 단일 출처는 `lib/hooks/useOtpAutoSubmit.ts` 다. 확인 버튼은 폴백으로 남는다.

- **같은 코드로는 두 번 자동 발화하지 않는다.** 틀린 코드를 한 자 지웠다 같은 자를 다시 넣어도 재발화 없음 — 그러지 않으면 사용자가 모르는 사이 서버 시도 횟수(`MAX_ATTEMPTS`)를 태운다. 같은 코드 재시도는 **버튼·Enter** 라는 명시적 경로만 허용한다.
- **재전송하면 기록을 지운다**(`reset()`) — 새 코드가 우연히 같은 6자리여도 다시 발화해야 하므로. 단 **발송이 확인된 뒤에만** 지운다. 재발송이 실패하면 서버 코드는 갈리지 않았으므로 지웠던 입력을 되돌리고 오류를 알린다(v0.4.28.1).
- **`autoComplete="one-time-code"` 는 휴대전화 칸에만 붙인다.** 이메일 코드 칸에 붙이면 iOS 가 직전 단계에서 받은 SMS OTP 를 제안하고, 잘못 탭하는 순간 자동 제출이 바로 나가 시도 횟수를 태운다.
- 사용자 조작 없이 제출되므로 각 입력 아래 sr-only `role="status"` 라이브 리전으로 진행을 알린다(노드는 유지하고 텍스트만 교체). 오류는 `role="alert"`.

#### Gs4 PG사 — 인증 대기 `/signup/pg/verify`
- `03 / 03 — VERIFY` (초대 가입) 또는 `04 / 04 — VERIFY` (직접 가입)
- Bs2와 동일 패턴
- 직접 가입 → `signupCompleteAction`(새 워크스페이스 생성) → `/inbox`
- 초대 가입 → `signupViaWorkspaceInviteAction`(기존 ws member 합류) → `/home`

#### 인증 처리 스플래시 `/auth/verify?token=...`
- 모노 `불러오는 중이에요…` 한 줄
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

#### 워크스페이스 초대 수락 `/invite/workspace/:token`
- 토큰으로 초대 정보를 서버에서 읽어 렌더한다 — 비인증이면 `WorkspaceInviteUnauthClient`(가입 플로우로 핸드오프, 이메일 고정), 인증 상태면 `WorkspaceInviteAuthedClient`(즉시 합류), 로그인 계정과 초대 대상 이메일이 다르면 `WorkspaceInviteEmailMismatch`.
- 상세 분기는 §1.4 시나리오 E2(신규 유저) · E3(기존 유저) 참조.
- **거절 액션은 없다.** 초대를 받지 않으려면 무시하면 되고, 만료·철회는 초대자 쪽에서 처리한다. (토큰 없는 `/invite` 목업 화면이 오래 남아 있었으나 어디서도 링크되지 않는 고아 라우트였고, 그 화면의 `거절하기` 버튼도 핸들러가 없어 무동작이었다 — v0.4.24.0 에서 삭제)

#### 이메일 변경 확인 `/auth/email-change?token=...`
- 토큰 검증 → "이메일이 {new}로 변경되었습니다." 안내 + 자동 재로그인 요청
- 만료/무효 분기 동일
- **로그인 상태에서도 반드시 통과해야 한다** — 정상 경로가 곧 인증 상태다(설정 화면에서 본인이 요청 → 새 주소로 받은 링크를 같은 브라우저에서 연다). `/auth/verify` 와 함께 `lib/auth/route-decision.ts` 의 `ALWAYS_PASSTHROUGH_PREFIXES` 에 등록돼 있으며, 빠지면 공개 프리픽스 규칙에 걸려 `/home` 으로 튕기고 확인 액션이 실행되지 않아 변경이 조용히 완료되지 않는다(v0.4.3.0 회귀 수정). `lib/auth/__tests__/public-routes-registered.test.ts` 가 `app/(public)` 폴더를 순회해 이 축을 고정한다 — 새 매직링크류 공개 페이지를 추가할 때 이 목록도 함께 갱신할 것.
- 목적지 주소가 마스터 allowlist(`MASTER_ACCOUNT_EMAILS`)에 있으면 요청 단계(`emailChangeRequestAction`)에서 `MASTER_EMAIL` 로 거부된다 — 가입 5경로와 같은 규칙(v0.4.3.0).

#### 로그아웃 `/logout`
- POST 핸들러: 세션 쿠키 삭제 → `/login` redirect
- GET 진입 시 `/login` 으로 (CSRF 회피)

### 1.4 시나리오 (Verification)

**시나리오 D — 구매사 신규 가입(셀프서비스)**
1. `/login` → `회원가입` → `/signup` → (buyer 호스트이면 자동) Bs1 이메일 + 약관 동의 → [인증 메일 받기]
3. Bs2 대기 → 이메일 토큰 URL → `/auth/verify` 스플래시 → Bs3 자동 이동
4. 프로필 입력 → Bs4 워크스페이스 이름·산업 → [만들기] → `/rfp` (관리자)

**시나리오 E2 — PG 워크스페이스 초대 진입(신규 유저)**
1. `/invite/workspace/:token` 진입 — `SignupDraft` 선 채움 (workspaceType='pg', email, wsInviteToken, inviteWorkspaceName)
2. Rs1 건너뜀(draft 존재) → Gs1 이메일(email prefill + readOnly, 3단계 스텝)
3. Gs3 프로필(이름 + 비밀번호) → Gs4 인증 메일 대기
4. 이메일 인증 → `signupViaWorkspaceInviteAction` → `/home` (기존 ws에 member 합류)

**시나리오 F — PG 직접 가입**
1. `/signup` → (partner 호스트이면 자동) Gs1 이메일(4단계 스텝)
2. Gs2 워크스페이스 정보 → Gs3 프로필 → Gs4 인증 메일 대기 → `signupCompleteAction` → `/inbox`

**시나리오 G — 비밀번호 분실**
1. `/login` → `비밀번호를 잊으셨나요?` → `/password/forgot`
2. 이메일 토큰 → `/password/reset` → 새 비밀번호 → 자동 로그인 → `/home`

### 1.5 `/invite/rfp/:token` → PG 플로우 핸드오프

PG 영업담당의 1차 진입 경로. 토큰 검증 후 인증 상태에 따라 분기:

- **Case A** — 이미 인증됨 + 이메일 일치: token claim → `/inbox/:rfpId`
- **Case B** — 이미 인증됨 + 이메일 불일치: "다른 계정으로 로그인이 필요합니다" + [로그아웃 후 재시작]
- **Case C** — 미인증: `SignupDraft` 선 채움 (`workspaceType='pg'`, `email`, `rfpInviteToken`) → Gs2로 redirect (Rs1 호스트 redirect + Gs1 건너뜀, 이메일 자동 채움)

### 1.6 본 절 범위 외
- SSO (Google/네이버/카카오) — 후속
- SAML/SCIM (엔터프라이즈) — 별도 스펙
- 2FA (TOTP/SMS) — 후속
- 디바이스 신뢰 / 의심 로그인 알림 — 후속
- 회사 도메인 자동 합류 — v1 옵션 기능, 본 v0 범위 외
- 감사 로그 — 백엔드 영역

> 시각 디자인 규칙은 [DESIGN.md](./DESIGN.md) 참조. 도메인 타입·검증·라우팅 가드는 코드가 캐노니컬 — `lib/` Server Actions + zod 스키마, 인증 가드는 `app/(app)/layout.tsx` 의 서버 redirect 참조.
