# CLAUDE.md

This file provides guidance to coding agents when working with code in this repository — Claude Code (claude.ai/code) reads it directly, Codex reads it through the `AGENTS.md` symlink.

## Documentation Map

This file is the agent entry point — **`AGENTS.md` is a symlink to this file** (relative target, mode `120000`), not a second copy, so Codex and Claude Code read the same bytes. **지침은 여기서만 고친다**: `AGENTS.md` 를 직접 편집·생성하지 마라 — 제자리 쓰기는 이 파일을 덮어쓰고, 원자적 저장(임시파일→rename)은 심링크를 일반 파일로 바꿔 사본을 되살린다. `lib/__tests__/agent-entrypoint.test.ts` 가 그 두 경우를 잡는다. The live content docs:
- `CLAUDE.md` (this file) — stack, routing, design hard-rules, TDD rules, skill routing.
- `README.md` — local setup / run instructions.
- `DESIGN.md` — Linear design language: tokens, typography, color, component visual rules.
- `SCREEN_DESIGN.md` — screen IA, route map, per-screen UX spec.
- `UX_WRITING.md` — 토스 보이스톤 기반 UX 라이팅 원칙 (해요체·능동형·긍정형·캐주얼 경어·버튼 문구). UI 문구 작성 시 필수 참조.
- `CONTEXT.md` — 코드와 에이전트가 공유하는 핵심 도메인 용어집. 기존 제품 규칙을 대체하지 않으며, 용어의 뜻과 피해야 할 표현만 좁게 정의한다.
- `docs/THREAT_MODEL.md` — 위협 모델·수용 리스크 대장 (AR-N; 실시간/presence 포함). 각 항목의 규범은 링크된 가드 테스트가 SSOT — 신뢰 경계를 바꾸는 변경은 같은 PR 에서 해당 절을 갱신한다.
- `docs/DOCS_ATTRIBUTION.md` — 기존 최초 유입과 분리한 최근 30일 docs 경유 기록, 공유 URL 계약, GA4 보고서와 메인 → docs 적용 순서.
- `docs/INDUSTRY_NAVIGATION.md` — 구매사·관리자 업종 탐색 표시 메타데이터와 두 저장소 동기화 절차.
- `docs/BUSINESS_DEADLINES_ROLLOUT.md` — 한국 영업일 견적 마감의 공식 달력 적재·운영 예외·cron·DDL 선행·복구 순서.
- `docs/OUTBOX_CLAIMS_ROLLOUT.md` — 일반·채팅·팀 채팅 이메일의 공통 선점, DDL 선행·구 실행기 배출·롤백 절차.
- `docs/DEPENDABOT_PATCH_PLAN_2026-09-15.md` — 2026-09 Dependabot 경고 17건의 취약 범위·도달 조건·패치 버전과 적용 검증 기록.
- `docs/SNOWSIGN_API.md` — 스노우싸인(SnowSign) Public API 레퍼런스 원문 사본(엔드포인트·요청/응답 스키마·에러코드·rate limit). 외부 서비스 스펙이지 이 레포의 스펙이 아니다 — 실제 연동 코드는 `lib/server/signing/`·`PlatformAgreementService`와 기존 건 동기화를 맡는 `ContractSigningService`(아래 노온–구매사 합의서 전환 절).
- `docs/NTS_REPRESENTATIVE_NAME.md` — 국세청 API로 대표자명을 확보·검증할 수 있는지 조사한 구현 전 참고 자료. 현행 제품 동작이나 확정 스펙이 아니다.
- `TODOS.md` — 미해결 부채 대장 (영역별 P1~P4). 해결분은 지우지 않고 `~~취소선~~ — 해결 (vX.Y.Z.W)` 로 남겨 결정 이력을 보존한다.
- `CHANGELOG.md` — 릴리스별 사용자 관점 변경 기록. 최상단 버전 헤더는 `VERSION`(4자리 `MAJOR.MINOR.PATCH.MICRO`)과 **항상 같아야 한다**. `package.json` 은 npm 이 4자리 버전을 거부하므로 그 **3자리 번역본**을 담는다(`0.5.6.1` → `0.5.6`) — 두 파일이 글자 그대로 다른 것은 정상이고, 단일 출처는 `VERSION` 이다. 이 번역은 `lib/__tests__/version-stamp.test.ts` 가 검증한다(`.gstack/pregate.json` 이 두 파일을 이 테스트에 연결).

> ⚠️ **Codex 로 이 파일을 읽는 경우 — 잘렸는지 먼저 확인하라.** Codex 는 프로젝트 문서를 `project_doc_max_bytes`(기본 32KiB)에서 **조용히 잘라서** 주입한다(잘렸다는 표시가 없다). 이 파일은 80KB 를 넘어 기본값이면 앞 38% 정도만 들어오고 Stack·라우팅·**디자인 하드룰·TDD 하드룰**·워크트리 규칙이 통째로 사라진다. 판별법: 온전한 이 파일의 **마지막 줄**은 `END` 를 담은 HTML 주석 센티널이다(리터럴을 여기 적지 않는 이유는, 적으면 그 문자열이 경고문 안에도 있어 `grep` 이 잘린 로드에서도 1건을 찾아 통과시키기 때문이다 — 아래 문서 편집 규칙이 그 줄을 파일 끝에 고정한다). 지금 읽고 있는 내용이 그 줄로 끝나지 않으면 잘린 것이다 — 그때는 **`cat "$(git rev-parse --show-toplevel)/CLAUDE.md"` 로 전문을 다시 읽고 나서** 작업을 시작하라(하위 디렉터리에서 시작했으면 상대경로 `cat` 은 파일을 못 찾는다). 그 출력마저 도구 출력 상한에 걸려 **가운데가** 잘리면 꼬리의 센티널은 남으므로, 한 번에 다 못 읽었으면 `sed -n '1,60p'` → `sed -n '61,120p'` 처럼 앞에서부터 나눠 읽어라. 항구적 해결은 `~/.codex/config.toml` 에 `project_doc_max_bytes = 262144`(저장소 안 `.codex/config.toml` 은 무시된다 — 실측). **이 검사는 Codex 전용이다** — Claude Code 는 이 파일 뒤에 사용자 지침·메모리 문서를 이어 붙여 주입하므로 애초에 센티널로 끝나지 않는다. 거기에 이 검사를 적용하면 매 세션 86KB 를 헛되이 다시 읽는다.

**라이브 배포**: AWS Lightsail 단일 VM 자체호스팅 (Caddy + PM2 `next start` + Docker Postgres). 현행 런북은 `docs/DEPLOY_LIGHTSAIL.md`, 관련 자산은 `ecosystem.config.cjs`(PM2) · `docker-compose.prod.yml`(운영 Postgres) · `deploy/Caddyfile` · `scripts/deploy/lightsail-*.sh` · `.env.production.example`.

**Historical / NOT current truth** (verify against code before trusting): `docs/superpowers/**` (point-in-time plan & spec artifacts). The legacy `PG_RFP_SPEC.md` / `SPEC.md` docs were **removed** — do not reference them; canonical product rules now live in code + tests + SCREEN_DESIGN.md 의 "확정 결정" 블록 (Context 절).

## Domain Context (memorize)

### 신규사업체 구매사 자동 승인 (2026-10-25)

신규 구매사 가입·워크스페이스 생성에서 서버의 국세청 정상 영업 검증 이후 APICK(`APICK_API_KEY`)으로 개업일·대표명을 확보하고 국세청 `/validate`로 번호·개업일·대표명 일치와 정상 영업을 검증한다. 사용자 추가 입력 없이 한국 날짜 기준 개업일부터 6개월 미만(월말 보정, 정확히 6개월은 제외)만 내부 영세 예외로 승인한다. 보나페이 조회·판정은 제거했으며 과거 승인 이력의 표시와 미인증 재가입 정리 호환만 유지한다. 간이과세·클라이언트 등급은 승인 근거가 아니다. 키 부재·실패·검증 불충족은 수동 심사로 접수한다.

`sole`·`new_business_exception`, active 워크스페이스, approved 신청과 `system:apick` 자동 승인 감사를 같은 트랜잭션으로 저장한다. APICK 성공·번호 일치 응답의 전체 JSON(`api`·`data`, 대표명 포함)은 승인 여부와 무관하게 신청에 연결된 `admin_audit_logs`의 별도 `workspace.apick_lookup` 사건 `payload_json.after.response`에 보관한다. 키·요청 헤더와 국세청 원문은 저장하지 않는다. 기존 이메일 인증·미인증 재가입 보호를 유지하며 기존 대기 건은 일괄 승인하지 않는다. DDL 선행·관리자 표시·환경변수·복구는 [운영 절차](docs/BUYER_AUTO_APPROVAL.md)를 따른다.

### 로그인 전 견적 작성 (2026-10-11)

구매사 랜딩의 비로그인 CTA는 `/quote-start`에서 홈페이지 질문부터 시작한다. `RfpDraftProvider`로 같은 질문·검증을 쓰되 회원 초안과 데모에서 저장소를 격리한다. 작성 중 답변·진행 위치는 localStorage, 원본 첨부는 IndexedDB에 보관한다. 가입 버튼에서 답변·원본을 서버에 먼저 저장하고 계정·워크스페이스·입점 심사 신청과 같은 가입 트랜잭션으로 연결한다. 연결 전 서버 초안은 마지막 저장 후 24시간, 연결 후에는 요청 완료·직접 삭제·계정 탈퇴까지 보관한다. 기존 입점 심사 Slack에 서버 저장본의 전체 답변·첨부명·크기를 함께 전달한다(원본·다운로드 URL 제외). 승인된 같은 구매사 계정은 다른 기기에서도 복원하며, 서버 revision·최종 요청 멱등 키·원자 완료 처리를 공유한다. 로그인·가입·이메일 인증·승인 이후 `/rfp-create?resume=guest`에서 선택한 초안을 계정+워크스페이스에 고정하고 서버 파일은 재업로드 없이 회원 첨부로 인계한다. 기존 로그인만 거친 브라우저 초안은 인증 업로드를 수행한다. 사업자 확인 뒤 유효하지 않은 답변으로 돌아가거나 PG 추천으로 진행하며, 기존 초안의 최종 요청은 사용자가 직접 실행한다. `GUEST_RFP_AUTO_SEND_ENABLED` 활성 시 명시적으로 확정한 예약은 인증·승인 후 서버가 자동 발송한다. 신규 예약의 소유권·30일 만료·완료 효과·배포 계약은 `docs/GUEST_RFP_AUTO_SEND.md`를 따른다. 다른 계정/워크스페이스의 자동 복원은 금지하고 회원 초안은 덮어쓰지 않는다. 완료 화면은 결과 우선 슬라이더 계산기 → 로그인·가입 → 답변 요약 순서다. 계산기 값과 최초 연출 여부는 초안과 분리한 클라이언트 상태이며 API·DB에 저장하지 않는다. 기본값은 신규·갱신 모두 10억 원·1%p이며 포인터 드래그 종료·직접 입력과 키보드 500ms 정지 시 확정한다. 연출 규칙은 DESIGN.md §9의 예상 절감 계산기 예외와 SCREEN_DESIGN.md를 따른다. 공개 업종 목록은 `PublicIndustry`의 `id/name/mccCode` projection만 제공한다. `/api/guest-rfp/events`는 기본적으로 시작·작성 완료를 `guest_rfp_events` 복합 PK로 선점해 기존 Slack 채널에 최대 한 번씩 전달한다. 서버/클라이언트 `GUEST_RFP_SLACK_THREADS_ENABLED` 플래그가 켜진 뒤 새 초안은 Bot 원문 하나에 분석·1분 행동 배치 댓글을 연결한다. `guest_journeys`가 증명·소유권·스레드를, 이벤트·배치 테이블이 중복 선점과 미확정 발송을 소유한다. 가입·최종 요청 성공은 서버 확인 결과만 기록한다. 2026-10-24 결정으로 질문 완료 답변과 가입 이메일·회사명·사업자등록번호·담당자명·인증된 연락처는 Slack 전용 행동 값으로 최대 500자까지 기록하며 GA에는 보내지 않는다. 비밀번호·인증번호·인증 ID·파일 원본은 제외한다. 추가 DDL·Bot 설정·보존·롤백은 `docs/GUEST_RFP_SLACK_THREADS.md`를 따른다. DDL 선행·오류 처리·브라우저 보존 한계는 `docs/GUEST_RFP_INTAKE.md`, 신뢰 경계는 `docs/THREAT_MODEL.md` §7을 따른다.

**미인증 재가입 예외**: 같은 이메일로 새 가입이 오면 정확한 같은 초안 ID+HttpOnly 비밀값 재제출만 응답 유실의 로그인 복구로 보존한다. 그 밖에는 기존 연결 초안을 폐기·소유 해제한 뒤 미인증 계정을 원자적으로 교체한다. 초안 존재만으로 공격자가 고른 비밀번호 자격 증명을 고정할 수 없다.

### 한국 영업일 견적 마감 (2026-09-26)

실제 구매사의 맞춤 PG 상담 마감은 요청 다음 날부터 **한국 영업일 5일**을 기본으로 하며, 빠른 선택은 3·5·10영업일이다. 구매사가 최소 3영업일 이상·요청일 기준 30달력일 이내의 영업일을 고를 수 있다. 마감 시각은 해당일 **18:00 KST**다. 토·일, 한국천문연구원 `getRestDeInfo` 공휴일, 5월 1일, 운영자가 기록한 임시휴일을 제외한다. 5월 1일에는 자체 대체휴일을 만들지 않는다. 정책 계산은 `lib/rfp/business-deadline.ts`, 공식 응답 검증은 `lib/server/calendar/official.ts`, 영속 달력·수동 예외·불변 변경 이력은 `business_calendar_*` 테이블이 소유한다. 미적재 연도는 근무일로 추정하지 않고 요청/변경을 차단한다. 기능 플래그 없이 항상 적용되므로 올해·다음해 달력 적재와 coverage 확인은 앱 배포(재시작) 전에 끝낸다. `scripts/deploy/lightsail-deploy.sh`가 PM2 reload 전에 달력을 적재하고 `scripts/calendar/check.ts`로 앱이 필요로 하는 연도(오늘부터 30일 안)가 있는지 확인해 비었거나 확인이 실패하면 중단한다. 기존 1:N 견적도 같은 영업일 규칙을 따른다. 랜딩·튜토리얼 샘플은 서버를 부르지 않는 `lib/rfp/sample-calendar.ts`(공식 공휴일 없이 주말·5월 1일만 제외)를 쓴다. 신규 요청·구매사 마감 변경·재요청은 쓰기 트랜잭션에서 달력과 상태를 재검증한다. 새 공휴일은 저장된 마감을 자동 이동시키지 않고, 변경 이벤트를 통한 영향 구매사 안내로 처리한다. 마감·리마인더 알림은 `deadline_notification_deliveries`의 멱등 키와 outbox를 공유한다. 운영 순서와 장애 복구는 `docs/BUSINESS_DEADLINES_ROLLOUT.md`를 따른다. 기존 레거시 견적의 저장 마감값은 일괄 변환하지 않는다.

### 노온–구매사 합의서 전환 (2026-10-21)

신규 계약 당사자는 **주식회사 노온과 구매사**다. 선정 PG는 이용 대상·수수료 조건으로만 기록한다. 견적 선정 트랜잭션이 `platform_buyer` 대기 계약을 만들고 구매사가 회사 정보 저장 → 노온 사전 날인 PDF 확인 → 명시적 서명 요청을 진행한다. 지정 구매사 담당자 한 명만 SnowSign 이메일 링크에서 본인인증·서명한다. 약정기간은 실제 PG 이용 시작일부터 2년이며 할인액 반환 청구자는 노온이다. PG 정산대금 상계는 없다.

새 문서는 buyer/platform 판별 타입과 `platform_agreement_drafts.prepared`의 불변 발송 스냅샷을 사용한다. 기존 `pg` 필드·sent_document를 노온으로 재해석하지 않는다. 서버 원본 도장·문안·당사자·견적·표준 요율 판본을 고정하며 같은 PDF 렌더러를 쓴다. 구매사만 신규 계약을 조회·저장·발송하고 완료본/감사추적인증서는 구매사 보관함에 한 번만 만든다. PG 계약 탭·작성·템플릿·복구·보관함과 수동 계약 업로드는 폐지한다. 폐지 페이지/API는 404 또는 명시적 기능 폐지 오류로 차단한다.

기존 `pg_buyer` 계약·첨부·감사는 운영 보존과 내부 동기화만 유지한다. 사용자 목록·상세·다운로드·알림에서는 숨기며 과거 선정 보정 생성·재촉을 중단한다. 외부 기존 계약 일괄 취소는 하지 않는다. 관리자 PG 표준 요율은 계속 사용한다. 구현은 `PlatformAgreementService`·`PlatformAgreementPanel`·`platform-agreement.ts`, DDL/복구/검증은 [전환 런북](docs/PLATFORM_BUYER_AGREEMENT_IMPLEMENTATION.md)이 소유한다.

- **Two-sided platform**: `buyer` workspace (구매사) sends RFPs; `pg` workspace (결제대행사 영업담당) responds with bids
- **Bidding is sealed 1:N; discovery is open (opt-out)**: participation (who can bid) is buyer-controlled via the workspace-ID allowlist (`rfp_allowed_pg`), and **bids stay sealed — PGs never see each other or a competitor count (`Bid.competitorCount` does not exist by design).** Two axes, kept separate:
  - **Discovery = open by default, buyer opt-out.** Every legacy `sent` RFP with `deadline > now` and `board_visible=true` appears on the PG-facing open board; new PG consultation requests are private (`/opportunities` + PG home 탐색 section). The board listing exposes a **non-competitive whitelist — `견적번호`·`구매사명`(workspace name)·`제목`·`홈페이지`·`마감일`·`요청 결제수단`(+커스텀 라벨)·`주요 상품`·`계약 유형`** — and never fees/current-terms/volume/bizNo/memo/attachments. The whitelist is the `OpportunityListing` type (`lib/types/pg-request.ts`), enforced at the query layer by an explicit SELECT projection in `lib/server/repositories/drizzle/rfp-pg-request.ts` and pinned by an exact-key guard test in its `__tests__`. **Adding a field to that type widens the public boundary — treat it as a sealed-bid decision, not a UI tweak.** **This block is the only place the field list is spelled out in prose** — README.md and SCREEN_DESIGN.md deliberately point here instead of restating it (they drifted apart when all three carried copies). **Board visibility is set once at RFP creation (wizard step 4, `RfpStep4Review` checkbox — gated on `OPEN_BOARD_ENABLED`) and is read-only thereafter** — the UI shows a status chip (`RfpBoardVisibilityStatus`) with no toggle. `setRfpBoardVisibilityAction`/`rfpRepo.setBoardVisible` are kept server-side for admin/recovery use but no UI surface calls them. **Kill switch**: `OPEN_BOARD_ENABLED = false` in `lib/features/open-board.ts` temporarily hides the entire open-board surface (board page, nav, home 탐색 section, wizard checkbox). Data and server logic are intact — flip to `true` to restore. (v0.2.52.0)
  - **Participation = buyer-gated.** A non-invited PG sends a one-time cold-pitch request (`rfp_pg_requests`, UNIQUE per (rfp, pg), rejection permanent). Buyer **accept** adds them to the allowlist + a real invitation (full info then visible in their inbox); **reject** is final.
  - **견적 접수 기간 = 상태 + 유효 마감 (v0.12.0.0).** 신규 견적은 RFP가 `sent`이고 `rfps.deadline > now`일 때만, 재요청 응답은 같은 상태이면서 해당 PG의 pending 재요청 `deadline > now`일 때만 받는다. 읽기·표시 규칙의 단일 출처는 `lib/rfp/bid-window.ts`의 `isRfpBidWindowOpen`/`isPgBidWindowOpen`이며, 재요청 마감은 공용 RFP 마감 대신 편지함·칸반·상세·보낸 견적 요약의 표시와 정렬에 일관되게 쓴다. 기한만 지난 `sent` 요청은 미선정으로 분류하지 않고 `마감`으로 표시하며 `BidWizard`와 제출·재요청 행동을 숨긴다. **화면 게이트는 편의층일 뿐 쓰기 경계가 아니다** — `BidService.submit`이 트랜잭션 안에서 `findByIdForUpdate`로 RFP 행을 잠그고 현재 견적·pending 재요청을 다시 읽은 뒤, 캡처한 같은 `now`로 `deadline <= now`를 거부한다(`RFP_NOT_OPEN`/`REQUOTE_DEADLINE_PASSED`). 이 재검증이 직접 액션 호출, 마감 직전 경합, 동시 중복 제출을 막는 최종 경계다.
  - **견적 수정 요청 (v0.27.0.0).** 구매사는 견적을 제출한 PG사에 수정 내용과 PG사별 응답 마감을 보내며, PG는 직전 견적의 조건·메모·요율을 불러와 새 회차를 제출한다. PDF는 유지·교체·제거를 고른다. 유지 시 첨부 소유 bid는 그대로 두고 `bids.proposal_source_bid_id`로 원본을 가리킨다. `BidService.submit`은 RFP 잠금 안에서 현재 재요청 ID·마감 판본·기준 bid ID와 ready 첨부의 소유 PG를 재검증한다. 구매사 비교·선정은 PG별 최신 제출 회차를 쓰되 새 회차 전까지 기존 견적도 선정할 수 있다. 양측은 제출 회차의 작성자·조건·메모·첨부 이력을 읽고, PG 로더는 자기 워크스페이스 회차만 제공한다. 화면 규칙은 SCREEN_DESIGN.md의 확정 결정, 배포 DDL은 `docs/DEPLOY_LIGHTSAIL.md`를 따른다.
  - **기존 견적의 구매사 PG 피커에 무엇이 뜨는가 (v0.4.53.0)**: 기존 견적요청 위저드의 PG 선택·최종 확인과 발송 후 PG 추가 초대는 둘 다 `searchWorkspaces` → `DrizzleWorkspaceRepository.search()` 한 곳을 지난다. 그 조회는 **`status='active'` 만** 돌려주고(이전에는 조건이 `type` 하나뿐이라 셀프서비스 생성 기본값인 **심사 대기 워크스페이스가 모든 구매사에게 노출**됐다), 여기에 더해 **이름에 `test`/`테스트` 가 든 워크스페이스를 기본 제외**한다 — 내부 테스트용 PG 를 실사용자에게 숨기기 위함이고, 규칙 단일 출처는 `lib/features/test-pg.ts` 의 `TEST_PG_NAME_TOKENS` 다(TS 술어 `isTestPgName` 과 SQL `notIlike` 가 같은 배열에서 파생되며 PGlite 토큰 루프 테스트가 드리프트를 잡는다). **필터는 앱이 아니라 SQL 에 있다** — `limit(q?20:500)` 이 필터 이후에 걸려야 결과 개수가 줄지 않기 때문. 숨김 해제는 **콘솔 쿠키** `document.cookie='support-b-show-test-pg=1; path=/'` + 새로고침이며(끄기는 `max-age=0`), 서버(RSC 는 `cookies()`, 라우트는 `request.cookies`)가 직접 읽으므로 기본 상태에서는 숨긴 이름이 RSC 페이로드에도 JSON 응답에도 실리지 않는다. **보안 경계가 아니라 가시성 조정이다** — 쿠키 이름을 아는 사람은 누구나 켜며(`/login/ops` 의 숨은 URL 과 같은 성격), 실제 경계는 라우트의 buyer+`type=pg` 게이트다. 두 축은 **직교**한다: 쿠키를 켜도 `pending` 은 나오지 않는다. 부분 문자열 매칭이라 상호에 토큰이 우연히 든 정상 PG 도 조용히 숨겨지는 오탐은 **수용된 트레이드오프**다. 범위는 발견·선택 표면뿐 — 딜룸·채팅·알림·이메일의 PG 이름 표기는 `search()` 를 지나지 않아 그대로다. 쓰기 경로(`filterPgIds`·`createRfp`)는 아직 status 를 보지 않는다(UI 로는 도달 불가, TODOS.md P3).
  - **Per-field opt-out for invited PGs — `현재 카드 수수료`.** Even an invited PG who sees the full brief can be denied one field: the buyer's **current card fee** (default shown, opt-out per RFP). When off, the value is stripped server-side in `loadPgRfpDetail` (the PG never reads it from the RSC payload/network — `RfpBriefPanel`'s render gate is only the visual fallback). The buyer's own comparison baseline always keeps the fee. Toggle lives in the RFP create wizard (step 2, under 현재 카드 수수료). **Implementation note (v0.2.26.x, migration complete):** current-terms is stored as a versioned JSONB document (`current_terms` column, `lib/types/rfp-terms.ts`). PG field visibility is controlled by a `hidden_from_pg` text-array (path allowlist) — `loadPgRfpDetail` strips any path that has a handler in `PG_STRIP` (fail-closed). The legacy `current_fee_visible_to_pg` boolean column and individual `current_*` columns were dropped in v0.2.26.2 — `current_terms` is the sole authoritative store. `currentFeeVisibleToPg` is derived at the app layer from `hiddenFromPg`. User-facing behavior is unchanged. **New-contract exemption (v0.2.68.0):** when 견적 유형 = 신규 계약 (`contractType==='new'`), the PG-contract-history fields that can't exist for a first-time PG contract — 전년도 연간 PG 총 거래액(`annualPgVolume`), 현재 카드 수수료(`currentFeeRate`) + its PG-visibility, 현재 월 정산한도, 현재 보증보험, 현재 정산주기 — are hidden in both wizard step 2 (input) and step 4 (review) and stripped server-side in `RfpService.createRfp` before persistence and idempotency hashing (trust boundary — a tampered draft/direct call still can't leak them into `current_terms`). The previously-required `annualPgVolume` is no longer required for `'new'` — the SSOT gate is `isAnnualPgVolumeSatisfied` in `lib/rfp/required-fields.ts`. 배송·서비스 기간 and 현재 운영 솔루션 are KEPT (PG-independent). Renewal/null behavior unchanged.
- **견적 내용 질문 흐름 (2026-09-24)**: 실제 구매사 작성은 `RfpQuestionFlow`가 한 화면에 질문 하나를 보여준다. 기존 입력은 `RfpStep2Content`의 질문별 렌더를 재사용하고, 랜딩·튜토리얼은 기존 묶음 화면을 쓴다. `content-questions.ts`가 순서·신규/갱신 분기·질문별 완료 조건을 소유한다. 새 판매 정보(`productInfo`)는 `current_terms`의 선택 키로 보관한다. 입점 판매자 유무는 선택, 환금성 상품·최고 가격대·판매 방식은 신규 상담 발송에 필수다. `lib/rfp/product-info.ts`가 값·스키마·표시를 소유하고 액션과 서비스가 검증하며 판매 방식은 정규화 후 멱등 해시에 포함한다. PG 요청 상세에는 공개하지만 오픈 게시판 projection에는 추가하지 않는다. 기존 견적의 미입력을 아니요로 해석하지 않는다.
- **맞춤 PG 상담 (2026-09-19)**: 신규 구매사 요청은 업종별 관리자 정책(`pg_matching_policies`)으로 한 PG에 상담을 요청하고, PG 심사·견적 이후 구매사가 최종 선정한다. 거절/철회 시 이전 PG를 제외한 다음 후보를 제안한다. `rfp_matching_requests`는 업종·분류 스냅샷과 구매사별 제출 키를, `rfp_pg_reviews`는 선택 조건·심사 이력을 저장한다. 관련 상태 변경은 RFP 행 잠금을 공유한다. 기존 발송된 1:N 견적은 보존하고 신규 상담은 게시판·추가 초대·참여 수락을 차단한다. 관리자는 별도 admin-supporter-b `/pg-recommendations`에서 업종 분류·PG 순서·수수료 조건을 설정한다. 업종별 후보가 없으면 `pg_matching_defaults`에 관리자가 지정한 기본 PG를 추가 검토(Gray) 대상으로 추천한다. 접수 불가(Black)·삭제된 업종은 우회하지 않고 이전 상담 PG·비활성 PG를 제외한다. 기본 PG 미설정·후보 소진 시에는 접수할 수 없다. 업종은 구매사가 직접 선택하며 관리자에서 MCC 기반 목록을 검색·일괄 등록할 수 있다. 같은 PG를 여러 업종에 연결할 수 있고 기존 `pg_recommendation_members`는 레거시 매핑으로 남는다. 새 테이블 DDL과 outbox enum은 양쪽 코드보다 먼저 적용한다. 화면/운영 규칙은 SCREEN_DESIGN.md의 맞춤 PG 상담 확정 결정, 배포는 `docs/PG_MATCHING_ROLLOUT.md`를 참조한다.
- **업종 직접 입력 (2026-09-24)**: 실제 구매사 질문의 `IndustrySelection`은 표준 목록 검색·카테고리별 라디오와 직접 입력을 함께 제공한다. `industrySelectionSchema`가 기존 ID/직접 입력 이름의 배타성·길이를 검증한다. 공백·대소문자 정규화 후 기존 이름과 일치하면 기존 정책을 적용하고 미일치 이름은 상담에만 저장하여 기본 PG(Gray)를 사용한다. 서버가 판정한 `rfp_matching_requests.is_custom_industry`는 삭제된 등록 업종의 NULL ID와 구분하여 재추천 우회를 막는다. 표준 29개는 `20260924-custom-industries.sql`의 일회성 등록이며 `app_data_migrations` 기록이 재실행·삭제 후 복원을 막는다. 배포 절차는 `docs/PG_MATCHING_ROLLOUT.md`, 화면 규칙은 SCREEN_DESIGN.md §0을 따른다.
- **Per-RFP unique URL + token** in invitation email; token authoritative only for first entry, then workspace membership takes over
- **용어 주의 — 코드는 `RFP`/`bid`, 사용자 화면은 '견적' 언어**: 코드 식별자·라우트(`/rfp`)·DB(`rfps`/`bids`)는 영어 그대로지만, **사용자에게 보이는 모든 한국어 문구는 '견적 요청'(RFP)·'견적'(bid)·'선정'(award)** 으로 통일한다. UI 문구 작성·수정 시 `UX_WRITING.md` §8 도메인 용어집을 따른다. 구매사 랜딩/마케팅 면(CTA·서비스 명칭·사이트 제목·SEO)은 **'맞춤 PG 견적'** 프레이밍을 쓴다 — 신규 구매사 흐름이 맞춤 PG 상담이라 'PG 비교 견적'·'경쟁 입찰'을 대체했다(사용자 결정 2026-10-10, v0.34.6.2). PG 랜딩은 '경쟁 입찰' 프레이밍을 계속 허용한다.
- **서명 정책과 보존**: `signing-policy.ts`는 kind별 정책을 분리한다. 신규는 지정 구매사 정확히 한 명과 본인인증, 레거시는 기존 구매사+승인 PG 정책을 유지한다. 웹훅은 HMAC 검증 후 재조회하는 트리거이며 폴링과 같은 경로를 쓴다. 발송 리스·revision·stamp·providerRef CAS 및 완료 멱등성을 유지한다. 새 발송 스냅샷은 `platform_agreement_drafts.prepared`, 레거시 문서 이력은 기존 `sent_document`다. 원본 도장은 public에 넣지 않는다. 폰트·글리프·레이아웃 제약은 `lib/contract-doc`의 테스트가 지킨다. 과거 연동 세부 기록은 `docs/SNOWSIGN_SANDBOX.md`와 `docs/LONG_TERM_AGREEMENT_ROLLOUT.md`를 참고하되 신규 제품 정책으로 해석하지 않는다.

## Current Stack

| Layer | Choice | Version |
|---|---|---|
| Server runtime | Node.js — `mise.toml`이 단일 출처(로컬 mise·CI `setup-node`가 읽고 perf 컨테이너·bootstrap 기본값은 테스트가 맞춤, README 로컬 개발 환경), 의존성 설치 시 Node 22.23.4 이상 22.x 요구 | `22.23.4` |
| Framework | Next.js App Router, Turbopack default, async `params`/`searchParams` | `next@16.4.3` |
| Runtime | React | `react@19.2.4` |
| Language | TypeScript strict | `typescript@6.0.3` |
| Auth | Auth.js v5 (no middleware — guard via `(app)/layout.tsx` redirect) | `next-auth@5.0.0-beta.32` |
| DB | Drizzle ORM + Postgres | `drizzle-orm@0.45.2`, `postgres@3.4.7` |
| Storage | ① 첨부파일: Cloudflare R2(S3 호환 API, `lib/server/storage/r2.ts`, 키 `attachments/<id>`) — 라우트는 `getStorage()` 만 본다. 업로드는 2-phase presigned 직행 PUT(`POST /api/files/presign` → 브라우저→R2 PUT → `POST /api/files/{id}/complete` 서버 스니핑 검증, `attachments.status` pending→ready, 클라 공용 헬퍼 `lib/attachments/upload-client.ts`). 일반 다운로드는 `GET /api/files/{id}` 가 ACL 검증 후 302 → presigned GET(TTL 15분)이고, PDF 썸네일은 같은 ACL을 통과한 `GET /api/files/{id}?preview=1`이 앱에서 바이트를 스트리밍한다. 버려진 pending 은 `/api/cron/sweep-uploads`(1h 초과) 가 청소, 버킷 CORS(PUT) 필수. R2 env(`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`) 미설정 시 모든 환경에서 throw(폴백 없음) — 로컬 dev도 실 R2 버킷 사용, 단위 테스트는 `__setStorageForTest` mock 주입, e2e 첨부 스펙은 R2 env 없으면 skip. ② 사용자 프로필 사진: Postgres bytea — `user_avatar_blobs` 테이블, `UserAvatarRepo`(`getUserAvatarRepo()`) — `getStorage()` 외부, 별도 repo 패턴. ③ 계약 보관 문서: 같은 R2 버킷의 `contract-archives/signing/<signingContractId>/{document,audit}.pdf`에 완료본·감사추적인증서를 자동 보관한다. 사용자에게는 구매사 소유 `platform_buyer`만 공개하고 PG·레거시·수동 업로드 행은 내부 보존한다. 수동 업로드 presign/complete API는 404다. 다운로드는 소유권·계약 종류·서명 정책 확인 후 presigned GET(TTL 15분)을 발급한다. sweeper는 과거 `source='upload'` pending만 정리하며 signing 하이드레이션 대기는 삭제하지 않는다 | `@aws-sdk/client-s3@3.x` |
| Styling | Tailwind v4 + CSS Variables (`@theme` block) | `tailwindcss@4.2.4` |
| Headless UI | `@base-ui/react` (shadcn base-nova style) + Radix 일부 (`@radix-ui/react-slider`) | `@base-ui/react@1.4.1` |
| Component tooling | shadcn (base-nova) — 컴포넌트 scaffolding 전용 | `shadcn@4.6.0` |
| State | Zustand (UI toggles, signup draft, page→shell header-actions slot) | `zustand@5.0.13` |
| Forms | zod v4 검증 + Server Actions (react-hook-form 미사용 — 폼은 useState + zod) | `zod@4.4.3` |
| Client data fetching | SWR — `force-static` 랜딩 헤더(`LandingHeaderNav`/`PgLandingHeaderNav`)가 마운트 후 `/api/auth/session`을 클라이언트에서 재조회해 로그인 상태를 반영(`components/landing/use-session-authed.ts`); 같은 키를 쓰는 두 헤더 인스턴스 요청을 SWR 캐시가 자동 중복제거 | `swr@2.4.2` |
| Numeric input | `react-number-format` — 원화 금액 입력 천단위 구분·소수점 차단 (`CurrencyInput`) + `D+N` 정수 전용 정산주기 입력 (`DayOffsetInput`) | `react-number-format@5.4.5` |
| Korean i18n | `es-hangul` (toss) — 조사 자동 선택(`josa()`), 초성 검색(`disassemble`), 숫자→한글 혼합 표기(`numberToHangulMixed`). 한글 텍스트 처리 단일 출처 | `es-hangul@2.3.8` |
| Icons | lucide-react | `lucide-react@1.14.0` |
| Fonts | `next/font/local` — Pretendard Variable + Nunito Variable (numeric) + JetBrains Mono Variable (ASCII), self-hosted in `public/fonts/` | — |
| Motion | `motion` (구 Framer Motion). 임포트는 `motion/react`. | `motion@12.38.0` |
| Email | Resend + `@react-email/render` | `resend@6.4.0` |
| Logging | Pino + Axiom — 서버 운영 로그는 `@axiomhq/pino` transport. 브라우저 web-vitals 는 `@axiomhq/react` 훅(`useReportWebVitals`+`transformWebVitalsMetric`)이 모으고 keepalive fetch 로 `POST /api/axiom` 서버 릴레이에 보낸다 — `@axiomhq/logging` 은 서버(`lib/observability/axiom-server.ts`)에서만 쓴다(클라이언트에 넣으면 서버용 `@axiomhq/js` 가 번들에 딸려 온다). 비인증 수집 경계는 THREAT_MODEL §4.1 | `pino@10.3.1`, `@axiomhq/react@0.4.1`, `@axiomhq/logging@0.4.1` |
| Observability | Sentry | `@sentry/nextjs@10.51.0` |
| Support | Channel.io | `@channel.io/channel-web-sdk-loader@2.0.2` |
| Realtime | Centrifugo (자체호스팅 WS, Caddy `wss://`) + `centrifuge-js` — 채팅 라이브(즉시 수신·타이핑·프레즌스·읽음). 메시지는 자사 Postgres에만 영속, 비공개 ACL은 subscribe-proxy로 앱에 보존 | `centrifuge@5.6.0` |
| Cmdk | `cmdk` | `cmdk@1.1.1` |
| Testing | Vitest + PGlite (단위), Playwright (e2e) | `vitest@4.1.11`, `@electric-sql/pglite@0.3.13` |
| Package mgr | pnpm | — |

> **Presigned upload 불변식:** 첨부 브라우저 PUT은 `pending/<final>` staging 키로만 발급한다. 공통 모듈이 HEAD ETag에 고정된 range GET + 조건부 CopyObject를 거쳐 최종 키를 공개한다. 재사용된 PUT URL의 고아 staging 객체는 `attachments/pending/` R2 lifecycle이 청소한다. 계약 수동 업로드의 기존 코드·기록은 보존하되 사용자 업로드 API는 폐지됐다.

상세 버전·스크립트는 `package.json` 참조. 부트스트랩은 완료 (M0).

## Routing Architecture (critical)

```
app/
├─ quote-start/ # 공개 실작성 — 로컬 작성·가입 시 서버 저장 후 구매사 인증 복귀, noindex
├─ demo/        # 공개 구매사 데모 — 요청·메시지·견적 수정·선정·가상 서명·계약 보관. 세션 메모리만 사용, 실제 업무 API 미호출
├─ legal/       # 공개 법적 고지: /legal 및 terms·privacy·marketing (판 번호 없는 URL. 가입 증빙 판본은 terms v2·privacy v4·marketing v3 — `lib/auth/signup-documents.ts`; 사용자 요청·운영 동의 0건 확인 후 v1 삭제)
├─ (public)/    # Unauthenticated: /login, /signup/{buyer,pg}/*, /password/*, /invite/{rfp,workspace}/[token], /auth/*, /pending-approval, /suspended
├─ (app)/       # Authenticated, AppShell wrapped (full-height Sidebar + Header)
│  ├─ home/
│  ├─ rfp/                    # buyer workspace pages (B1~B7): /rfp, /rfp/[id] (비교·선정 인라인 — 별도 award 라우트 없음), /rfp/@modal/(.)[id] (인터셉트 딜룸 모달)
│  ├─ rfp-create/             # /rfp-create — RFP 작성 플로우 (AppShell 공유, 인터셉트 라우트)
│  ├─ inbox/                  # pg workspace pages (P2~P4): /inbox, /inbox/[rfpId] (제출 후 인플레이스 흡수 — 별도 /submitted 라우트 없음, 재요청 딥링크 `?tab=write` — `lib/rfp/pg-deal-room-link.ts`), /inbox/@modal/(.)[rfpId] (인터셉트 딜룸 모달)
│  ├─ opportunities/          # pg — 오픈 RFP 게시판 (비초대 PG 발견·콜드 피치)
│  ├─ tutorial/               # buyer+pg — 온보딩 튜토리얼. 홈 환영 모달(WelcomeModal)/재유도 배너(TutorialNudge)의 진입점. buyer는 BuyerTutorialFlow(components/onboarding/tutorial/)가 같은 라우트 내 phase 전환(작성→도착연출→비교·선정→완료, 전부 fixture)으로 실제 여정 제공. pg는 PgTutorialFlow가 같은 방식으로 초대 수신 연출→요청 조건 확인(RfpBriefPanel)→견적 작성·제출(BidWizard)→완료(봉인 입찰 안내) 여정 제공. **오픈 샌드박스 계약(v0.3.4.0)**: 폼은 전부 프리필(무입력 클릭 완주는 여전히 성립 — e2e/tutorial-click-through.spec.ts가 커버)이지만 차단이 없다 — 키보드락·클릭 실드·밖-클릭 넛지 제거, 사용자는 값을 바꾸고 화면을 자유롭게 탐색할 수 있다. action 코치마크는 타깃 클릭을 기다리며(진행 로직 불변), 타깃 버튼이 disabled면 말풍선에 막힘 힌트를 띄운다. **오프코스 리졸버(v0.3.5.0)**: 사용자가 안내 코스를 벗어나 화면을 직접 바꿔도(위저드 이전/스텝 인디케이터 점프·info 안내 무시하고 실제 버튼 클릭·검증에 막힌 클릭) CoachmarkTour가 250ms 폴링(2틱 히스테리시스, ~0.5s)으로 현재 화면에 실재하는 action 앵커를 찾아 그 스텝으로 즉시 점프·복귀한다 — 전제는 "한 화면에 이 투어의 action 앵커 최대 1개"(위저드 next-N은 스텝별 상호배타, `components/onboarding/tutorial/__tests__/tours.test.ts` 드리프트 가드가 위저드 스텝 상수와 정합을 못박음). action 2개 이상인 투어에서만 인터벌이 돌고(1개 이하는 점프 경로 도달 불가라 미생성), 앵커 0개(전환 중)·2개 이상(모호)·expected 없음(마지막 action 이후)이면 관망한다. 클릭이 접수됐지만 실제 진행이 막혀 다음 타깃이 나타나지 않는 경우도 리졸버가 ~0.5s 안에 직전 action 스텝으로 되돌리며(마지막 action 포함 — PG 제출 확인창의 확인 버튼이 pgWriteTour의 마지막 action 스텝(`tutorial-bid-confirm`, ConfirmDialog `confirmDataCoachmark`)이라, 확인창 취소로 확인 앵커가 사라지면 리졸버가 제출 스텝으로 복귀시킨다. 확인창이 열려 앵커 2개가 공존하는 동안은 '모호=관망'이 흡수), 기존 notFound 타임아웃 복귀는 폴백으로 유지된다. 점프가 사용자 화면을 당기지 않도록 이미 뷰포트에 보이는 앵커는 스크롤하지 않고(완전히 밖일 때만 center 스크롤 — useAnchorRect 공통), 스텝 전환(점프 포함)은 말풍선 옆 sr-only `role=status` 라이브 리전으로 공지된다. /tutorial 밖 내부 링크 클릭은 TutorialLeaveGuard가 가로채 [계속 체험하기|나중에 하기(dismissed)|건너뛰기(completed)] 확인 후 이동(프로그래매틱 이동·뒤로가기는 미가드 — 무스탬프라 환영 모달 재노출로 흡수). 실 백엔드 터치는 스텁: 첨부 드롭존 sampleMode(가상 첨부), 템플릿 저장 안내 토스트. 건너뛰기 계약(v0.3.2.0)·Esc 무반응·라이트 스포트라이트 링 펄스(v0.3.3.0)는 유지. **건너뛰기 계약(v0.3.2.0)**: 코치마크의 건너뛰기 버튼 클릭 = 정상 완주와 동일하게 completed 스탬프+done 화면 점프(양 플로우 handleComplete 공유, 재진입 가드 포함). Esc는 코치마크에 무반응 — onSkip이 비가역 완료와 묶이면서 오발 Esc(⌘K 닫기·앵커 탐색 구간)가 영구 완료가 되는 사고를 막기 위해 CoachmarkTour의 전역 Esc 리스너를 제거함(스킵=버튼 전용). **라이트 스포트라이트(v0.3.3.0)**: 코치마크가 화면을 어둡게 덮던 dim 스크림을 제거 — 배경은 밝게 유지된다. 타깃 강조 링에 opacity 소프트 펄스(`.coachmark-pulse`)를 더해 시선을 유도한다(`prefers-reduced-motion` 존중, 자세히는 DESIGN.md §6)
│  ├─ messages/               # buyer+pg 공통 — 라이브 채팅 (Centrifugo WS)
│  ├─ notifications/          # 인앱 알림 목록 페이지
│  ├─ contracts/              # buyer 전용 — 노온 합의서 완료본·감사추적인증서 보관함. 수동 업로드 없음
│  ├─ quote-templates/        # pg — 견적 템플릿 (정산조건·가입비·수수료율 저장, top-level PG 라우트 — settings 하위 아님)
│  ├─ contract-templates/     # 폐지 — 404. PG 견적 템플릿은 유지
│  ├─ workspace/new/          # 워크스페이스 생성
│  └─ settings/{profile,members,notifications,audit-log}/
├─ logout/route.ts            # GET (redirect to /login) + POST (204, for client-side signOut)
└─ (no middleware.ts)         # auth guard는 app/(app)/layout.tsx의 서버 redirect로 처리 (resolveShellAccess)
```

Workspace type (`buyer` vs `pg`) determines which sub-tree of `(app)/*` is shown — same shell, different navigation.

**견적 초안의 화면별 격리 (2026-10-22)**: 랜딩·튜토리얼·공개 데모는 최초 렌더에서 `createRfpDraftStore`로 독립 메모리 store를 만들고 `RfpDraftProvider`로 전달한다. 회원 전역 store의 값이나 persistence를 임시로 바꾸지 않는다. 샘플 초기값·자동 재생도 해당 store에만 쓴다. 회원 초안의 영속 저장과 공개 작성·서버 복원의 소유권 규칙은 각 경로가 유지한다.

**Shell-guard gates (`resolveShellAccess` in `lib/auth/shell-access.ts`)**: the `(app)/layout.tsx` guard runs ordered redirects — unauth → `/login`, incomplete-but-authed (no membership) → `/logout`, **email-unverified → `/pending-approval`**, workspace `pending` → `/pending-approval`, workspace `suspended` → `/suspended`. The email-verification gate is **first-class and independent of workspace status** — an unverified member is redirected even when their active workspace is already `active` (closes the canonical-PG-join hole where joining an approved workspace skipped verification). `emailVerified` is read **live from the DB** (`getDbEmailVerified`, not the JWT) so a just-completed verification takes effect without re-login; after verifying, the server revokes provisional sessions and replaces only the proving browser session using request-local renewal authority. Code and link share the guest-resume/home destination; an open signup tab rechecks server state before accepting a completion signal. Cookie replacement failure falls back to re-login. The guard then re-branches by workspace status. **PG 멤버십 승인은 서버 데이터 경계로도 강제된다 (v0.4.20.0)**: `isPgMembershipBlocked`(`lib/auth/pg-membership-gate.ts`)가 승인 상태를 DB 라이브 리드로 판정해 `requirePgSession`(PG 전용 표면)과 `requireActiveWorkspace`(채팅·보드·계약 라이프사이클 등 양측 공용 액션)에 이중 배선 — `pending_approval`/`rejected`/행 부재 전부 fail-closed 차단, 마스터(synthetic admin, 멤버십 row 없음)는 `isMasterEmail` 재확인으로 면제. 셸 가드의 승인 게이트도 `!== 'approved'` fail-closed 로 정렬됨. 업무 HTTP API(일반 첨부·계약 보관함·알림·워크스페이스 검색)는 `checkBusinessApiSession`으로 같은 게이트를 공유하고, 연결 토큰은 계정 캐시 검사 뒤 `checkBusinessWorkspace`로 워크스페이스·PG 승인을 매 요청 확인한다. server-to-server subscribe ACL도 signed `meta.workspaceId`의 active/approved 실효 멤버십을 매 구독 확인하고 모든 채널 판정을 그 workspace에 묶는다. 잔여는 이미 열린 구독의 외부 관리자 승인·workspace 상태 변경 재검사다 — TODOS.md P4 참조.

**마스터/운영계정의 워크스페이스 관리 권한 (v0.10.0.0)**: 운영계정은 멤버십 행 없이 선택한 모든 워크스페이스의 synthetic admin 으로 설정의 이름 변경 요청·멤버 초대/재발송/취소·역할 변경·내보내기와 활동 기록 조회를 수행한다. 이름·멤버 관리 쓰기 권한의 서비스 경계는 `WorkspaceService.workspaceManagementAccess` 다 — 세션의 `isMaster` 값을 신뢰하지 않고 사용자 이메일을 DB 에서 다시 읽어 서버 전용 `MASTER_ACCOUNT_EMAILS` allowlist 와 대조하며, 일반 사용자는 승인된 admin 멤버십을 요구한다. 이 작업들의 액션은 렌더 시점의 `workspaceId` 를 필수로 받아 현재 세션 워크스페이스와 정확히 비교하므로, 다른 탭에서 워크스페이스를 바꾼 뒤 남은 화면은 `WORKSPACE_CHANGED` 로 멈춘다. 운영계정도 마지막 승인 admin 을 강등·내보낼 수 없고, 판정은 쓰기 트랜잭션 안의 행 잠금 카운트가 지킨다. 이름·멤버 관리 감사 로그는 같은 트랜잭션에서 `metadata.actorWasMaster` 를 사건 당시 값으로 스냅샷하며, 이 필드가 없는 레거시 행만 조회 시점의 allowlist 로 폴백한다.


**워크스페이스 상태 서버 게이트 (v0.22.2.0)**: `requireSession`과 인증 API의 `isWorkspaceInactive`는 현재 DB의 워크스페이스가 `active`인지 요청마다 확인한다. `pending`·`suspended`·삭제된 워크스페이스는 업무 액션·파일·알림·계약·연결 토큰 API에서 차단된다. 계정 복구·가입·초대 수락·워크스페이스 전환은 `allowInactiveWorkspace`를 명시해 접근을 유지한다. 세션 갱신의 워크스페이스·역할 claim은 `lib/auth/master-login.ts`가 DB 멤버십에서 다시 도출한다. 세부 위협 경계와 테스트는 `docs/THREAT_MODEL.md` §3.4.

**Host routing (prod only)**: the single Next.js app serves two hostnames — `support-b.com` (buyer) and `partner.support-b.com` (PG). Route tree is unchanged; `(app)/layout.tsx` reads the request host and redirects a mismatched session to its correct host (`lib/site-routing.ts`). `/signup` also reads the host and redirects to `/signup/buyer` or `/signup/pg` without a role-chooser screen (`signupTargetForHost` in `lib/site-routing.ts`). Session cookie is scoped to `.support-b.com` for cross-subdomain SSO (`AUTH_COOKIE_DOMAIN`). Workspace switch navigates across hosts. PG-facing emails link to `partner.support-b.com`. Local dev uses a single host (routing disabled). Env vars: `NEXT_PUBLIC_BUYER_ORIGIN`, `NEXT_PUBLIC_PARTNER_ORIGIN` — **both-or-neither, enforced fail-closed**: `appOrigins()` throws when exactly one is set (v0.4.3.0). A partial config used to let the missing one fall back to a value that could equal the other, making a broken deploy indistinguishable from single-host dev — and that state silently disabled the partner-host noindex (`shouldNoindexHost`, `robots.ts`) and the `/login/ops` OAuth PKCE host pin (`opsLoginRedirectTarget`, cf. PR#361) at the same time. The origin fallback chain itself (`NEXT_PUBLIC_BASE_URL` → `AUTH_URL` → `http://localhost:3000`) has a single source, `baseUrl()` in `lib/site-routing.ts`; `siteConfig.url` and `lib/server/env.ts`'s `baseUrlFor` (email links) both derive from it, and `lib/server/env.ts` re-exports `baseUrl` only as a deprecated compat hop — new code imports from `@/lib/site-routing`.

**SEO / AI(GEO) 텍스트 엔드포인트**: `/llms.txt`(큐레이션 인덱스)·`/llms-full.txt`(전체 마크다운)는 host-aware route handler(`app/llms.txt`·`app/llms-full.txt`)로 buyer/PG 청중별 사실을 `text/plain`으로 제공한다. `app/robots.ts`·`app/sitemap.ts`도 host-aware로 전환 — buyer 호스트는 자기 origin 참조 + 주요 AI 크롤러 명시 허용하지만, **partner(PG) 호스트는 전면 비색인**(`buildRobots(origin, 'pg')`가 모든 크롤러에 `disallow: ['/']` 반환, `buildSitemap`도 빈 배열, `proxy.ts`가 응답에 `X-Robots-Tag: noindex, nofollow` 헤더까지 얹어 이미 색인된 페이지도 제거 유도 — `lib/site-routing.ts`의 `shouldNoindexHost`). 콘텐츠 SSOT는 `lib/seo/{host,product-facts,llms,robots,sitemap,jsonld}.ts`이며 FAQ는 랜딩 상수(`faq-data`·`pg-faq-data`)를 재사용해 드리프트가 없다. 공식 표기는 '서포트비'이며 그 단일 출처는 `lib/site-config.ts`의 `siteConfig.name` 하나다 — `lib/seo/product-facts.ts`의 `PRODUCT_NAME`은 두 번째 출처가 아니라 거기서 파생하는 재export다(v0.4.3.0). 2026-10-03 사용자 결정에 따라 화면·검색 메타데이터·AI 안내는 '서포트비'만 사용하며 별칭 배열·키워드·JSON-LD alternateName은 제거했다. 명칭을 정정한 이용약관·개인정보 처리방침과 마케팅 문서는 v2로 게시했고, 2026-10-08 문의 주소 정정으로 개인정보 처리방침·마케팅 문서는 v3가 됐고, 2026-10-10 보호책임자 주소 정정으로 개인정보 처리방침은 v4다(이용약관은 v2 유지, 판본 단일 출처는 `lib/auth/signup-documents.ts`). 후속 사용자 요청에 따라 운영 가입 동의 0건을 확인한 뒤 v1 공개 페이지 3개를 삭제했다. JSON-LD 스키마 빌더는 `lib/seo/jsonld.ts`에 있고, `buildOrganizationJsonLd`는 buyer 랜딩(`app/page.tsx`)·PG 랜딩(`pg-landing-data.ts`, description 오버라이드)이 공유하며 `buildSoftwareApplicationJsonLd`는 buyer 랜딩 전용, `<script type="application/ld+json">` 인라인 직렬화는 반드시 같은 파일의 `serializeJsonLd`(`<`·`>`·U+2028/U+2029 유니코드 이스케이프 — `</script>` 태그 탈출 방지)를 쓴다(raw `JSON.stringify` 금지). 랜딩 히어로 지표(`HERO_METRICS`)는 `components/landing/hero-metrics.ts`에 단일 출처로 추출돼 `LandingHero.tsx`와 `product-facts.ts`(BUYER_FACTS.metrics)가 공유하며, `lib/seo/__tests__/product-facts.test.ts` 드리프트 가드 테스트가 양쪽 캡션 일치를 보장한다. 두 txt 경로는 `proxy.ts`/`lib/auth/proxy-matcher.ts` 매처에서 robots/sitemap과 함께 제외해 비인증 크롤러가 접근한다. `app/layout.tsx` metadata의 `alternates.types['text/plain'] = '/llms.txt'` 선언으로 ChatGPT·Perplexity 등 AI 크롤러가 `<head>`에서 자동발견 가능하다. **매처 제외 목록에 항목을 추가할 때 지켜야 할 규칙 두 가지**(v0.4.9.0): ① 세그먼트의 점(`.`)은 `\\.`으로 이스케이프해 파일명이 리터럴 점으로만 매칭된다(`llmsXtxt` 같은 경로가 의도치 않게 제외되는 것을 방지). ② 모든 항목은 세그먼트 경계(`SEGMENT_END` = `/` 또는 경로 끝)에 고정된다 — 맨 접두어로 두면 미래에 그 단어로 시작하는 실제 보호 라우트(`/landing-editor`·`/api-docs`)가 인증 프록시를 통째로 건너뛴다. **유일한 예외는 Next.js 메타데이터 이미지 규약**(`opengraph-image`·`twitter-image`·`apple-icon`)으로, 확장자가 붙어 도착하므로(`app/opengraph-image.png` → `/opengraph-image.png`, 동반 alt 는 `/opengraph-image.alt.txt`) `ASSET_SUFFIX`(`.`/`-` 뒤에만 접미사 허용)를 쓰되 `PATH_END`(`$`)로 고정해 하위 경로(`/apple-icon.png/admin`)까지 새지 않게 한다. 이 규칙은 `lib/auth/__tests__/proxy-matcher.test.ts`가 못박으며, 매처를 바꾸면 `proxy.ts`의 인라인 리터럴도 함께 갱신하고(드리프트 가드가 둘을 byte-equal 로 고정) **반드시 `next build`로 확인해야 한다** — Next 는 `config.matcher`를 모듈 실행 없이 정적 분석하므로 유닛 green 이 build green 을 보장하지 않는다.

**Admin 콘솔은 별도 레포로 분리됨**: `github.com/bothsides-platform-dev/admin-supporter-b`. 이 레포에 `app/admin/` 없음. admin 관련 코드를 찾거나 수정할 때는 해당 레포를 참조. 이 레포에는 DB 마이그레이션 소유권(`lib/db/schema/admin.ts`)과 신규 가입 알림 이메일(`lib/integrations/admin-email.ts`)만 잔존.

**PG 용어 사전(docs)은 별도 레포**: `github.com/bothsides-platform-dev/docs-supporter-b` 가 `docs.support-b.com`(Next.js 정적 export, Cloudflare Pages)을 서빙한다. 이 레포는 docs 링크와 [docs 경유 수신부](docs/DOCS_ATTRIBUTION.md)를 가진다 — URL 단일 출처 `DOCS_URL`(`lib/site-config.ts`, 사이트 루트)을 양쪽 랜딩 헤더의 `인사이트` 메뉴·공용 푸터(`components/shell/Footer.tsx`)·buyer llms 링크(`product-facts.ts`; 절대 URL 은 `renderLink` 가 origin 없이 그대로 출력)가 소비한다. 랜딩 헤더의 `인사이트`는 구매사에서 자주 묻는 질문 다음·도입문의 앞, PG에서 고객사 사례 다음에 둔다(2026-10-22). PC·모바일과 로그인 여부에 관계없이 같은 탭으로 이동하며, 모바일 클릭은 메뉴를 닫는다. 외부 링크이므로 현재 섹션 강조 대상에는 포함하지 않는다. Organization 의 별칭(`siteConfig.alternateNames`)과 `sameAs`(`siteConfig.sameAs`)는 docs 레포의 같은 @id 노드와 같은 값을 유지한다. docs 쪽 JSON-LD 가 `publisher: { '@id': '<siteConfig.url>/#organization' }` 로 이 레포의 Organization 을 참조하므로, `buildOrganizationJsonLd` 의 `@id` 를 바꾸면 docs 레포도 함께 고친다.

## Server Architecture (lib/server/)

세 계층으로 구성된다. 계층 간 의존 방향은 Actions → Services → Repositories.

```
lib/server/
├─ actions/          # 얇은 진입점: 세션 검증 + 입력 파싱 후 서비스에 위임
├─ services/         # 비즈니스 로직 캡슐화 (전체 코드베이스 적용 완료)
│  ├─ rfp.ts         # RfpService: award / cancel / close
│  ├─ bid.ts         # BidService: submit / withdraw
│  ├─ chat.ts        # ChatService: sendMessage / conversation lookup
│  ├─ workspace.ts   # WorkspaceService: create / invite / member management
│  ├─ auth.ts        # AuthService: signup / password reset / email change
│  ├─ notification.ts# NotificationService: markRead / markAllRead / retryEmail
│  ├─ contract-signing.ts # ContractSigningService 파사드: 선정 후 전자서명 전체 흐름 조율
│  ├─ contract-dispatch.ts # PDF·조항형·공통 합의서 발송의 공통 ACL·상태 게이트와 저장 서식 게이트
│  ├─ signing-dispatch.ts # PDF·조항형·공통 합의서 발송 구현, 문서 렌더링·초안 복구
│  ├─ signing-recovery.ts # 복구 후보 조회: ACL·리스·예산·참여자 매칭·노출 기록
│  ├─ signing-reconciliation.ts # 공급자 상태 동기화·관측 계약 바인딩·완료 처리
│  ├─ signing-policy.ts # 공통 상태 판정·당사자 접근 판정·감사 실패 처리
│  ├─ signing-send-lease.ts # 발송 리스 취득·연장·반납·이어받기와 동료 알림
│  ├─ signing-sent-commit.ts # 공급자 발송 결과의 원자 커밋·참여자·감사·알림
│  └─ signing-party-notifications.ts # 구매사·PG 수신자와 딜룸 링크 파생
└─ repositories/     # DB 접근 추상화 (Drizzle 구현 — 단위 테스트는 PGlite 로 실 DB 검증)
```

**대화 읽음 상태는 의도적인 tier-spanning 예외다.** `lib/chat/read-state/`가 `(conversation, active workspace, user)` 읽음 cursor, 상대 workspace 판정, unread·상대 읽음 영수증 projection을 함께 소유한다. 서버 호출자는 `markRead`·`projectInbox`·`projectThread`·`projectDigest` interface만 사용하며, 화면은 `useConversationReadReceipt`만 사용한다. Postgres 영속은 기존 `ChatReadRepo`/Drizzle adapter가 담당하고 Centrifugo는 best-effort 전달 adapter다. raw digest dedupe key codec은 읽음 의미가 아니라 queue envelope이므로 `lib/server/outbox/chat-digest-key.ts`에 남는다. team chat은 이 module의 범위가 아니다. 결정 근거는 `docs/adr/0003-conversation-read-state-vertical-module.md`를 본다.

**서비스 레이어 규칙:**
- 서비스는 트랜잭션·알림 팬아웃·이메일 아웃박스를 소유한다. 액션은 이를 직접 다루지 않는다.
- 가입과 워크스페이스 생성·초대 수락의 공통 쓰기는 `WorkspaceMembership`에 필요한 repository를 주입해 실행한다. 바깥 `AuthService`/`WorkspaceService`가 전달한 같은 트랜잭션을 사용하며 `services`에서 `actions`의 내부 helper를 역참조하지 않는다. 미인증 가입의 크로스 애그리거트 정리는 `services/purge-unverified-signup.ts`의 명시적 DB 접근 예외로 유지한다.
- 이메일 실행은 `lib/server/outbox/`가 소유한다. repository는 일반·채팅·팀 채팅의 원자적 선점과 결과 갱신을 맡고, 실행기가 배치 발송·백오프를 적용한다. `scheduled_at`은 예약 시각이며 작업 소유권은 별도 `claim_token`·`claim_expires_at`으로 표현한다. 신규 코드는 `outboxRepo.flush()` 대신 실행기를 호출한다. DDL 선행·구 실행기 배출·롤백은 `docs/OUTBOX_CLAIMS_ROLLOUT.md`를 따른다.
- **알림 팬아웃 단일 API**: `lib/server/notifications/notify.ts`의 `notify(tx, input)` — in-app row insert와 email·alimtalk outbox enqueue를 채널(`inapp`/`email`/`alimtalk`) 지정 한 번으로 처리하고, 생성한 `Notification[]`을 반환한다(호출자가 `pendingEmits`에 모아 commit 후 emit). `rfp.ts`/`bid.ts`/`chat.ts`/`team-chat.ts`/`contract-signing.ts` 의 알림 발송이 모두 이 API로 통일되어 있다 — 신규 알림 발송 코드는 `dispatchNotification`+`outboxRepo.enqueue` 두 호출을 직접 조합하지 말고 `notify()`를 쓴다. **범위 밖(의도적)**: `auth.*`/`workspace.*` 서비스와 `lib/server/services/workspace-membership/notify-invitation.ts`는 기존 `dispatchNotification`/outbox 직접 호출 패턴을 그대로 유지한다.
  - **삽입은 채널당 한 문장이다 (v0.4.47.0)**: 수신자 수와 무관하게 `dispatchNotifications`(→`notificationRepo.saveMany`)와 `outboxRepo.enqueueMany` 를 각각 1회 호출한다. 알림톡은 명시적인 타입 입력이 있을 때 수신 연락처·설정을 일괄 조회하고 별도 `alimtalk_outbox`에 같은 트랜잭션으로 일괄 적재한다. 발송 전 권한·설정·번호를 재확인하며, 불명확한 접수 결과는 자동 재시도하지 않는다(운영 절차: `docs/ALIMTALK_ROLLOUT.md`). 예전에는 수신자마다 단건 INSERT 를 돌아 트랜잭션이 팀 규모에 비례해 길어졌다. **수신자별로 값이 갈려야 하면 루프를 돌지 말고 함수를 넘긴다** — `dedupeKey: (r) => …`, `linkUrl: string | ((r) => …)`. 이 두 필드가 함수를 받기 전에는 호출부가 `recipients:[한 명]` 으로 루프를 도는 것 말고는 표현할 방법이 없었고, 그게 12곳에 퍼져 있었다.
  - **⚠️ `dedupeKey` 는 수신자마다 달라야 한다**: 전원이 같은 키를 내면 outbox 의 dedupe UNIQUE 에 걸려 **첫 1건 말고는 메일이 조용히 사라진다**(중복 억제가 목적일 때만 의도적으로 상수 키를 준다). 파라미터 이름은 타입이 아니라서 옛 시그니처(`(email) => …`)를 그대로 둔 호출부는 **컴파일을 통과한 채** 키가 `[object Object]` 로 굳는다 — `notify()` 가 런타임에 throw 해서 막는다.
- `Actor = { userId, workspaceId }` — 세션에서 추출해 액션이 서비스에 전달한다.
- `ServiceResult<T> = { ok: true } & T | { ok: false; error: string }` — 서비스 레이어 반환 타입. 예외 throw 없이 결과를 반환한다.
- `ActionResult<T> = { ok: true } & T | { ok: false; error: string }` — 액션 레이어 반환 타입 SSOT (`lib/server/actions/_result.ts`). 각 도메인 파일의 동일 타입 선언을 대체한다.
- 액션 공통 세션 헬퍼: `requireBuyerActor` / `requirePgActor` / `requireActiveWorkspace` (`lib/server/actions/_session.ts`) — 세션 검증·Actor 추출 로직의 단일 출처. 신규 액션 작성 시 `_shared.ts` 대신 이 헬퍼를 사용한다.
- 서비스 싱글턴은 `lib/server/_singleton.ts` 의 `defineAsyncSingleton(key, 'service', build)` 한 줄로 만든다 — `export const { get: getRfpService, set: __setRfpServiceForTest, reset: __resetRfpServiceForTest } = defineAsyncSingleton(…)`. 레지스트리는 `globalThis` 위 Map 하나(HMR 생존)이고, 의미는 `get = override ?? cache ?? build()` · `set(undefined)` 는 override 만 지움 · `reset` 은 둘 다. 인프라 클라이언트(`snowsign-client`·`storage`·`nts`)는 같은 헬퍼의 `'infra'` 그룹. **`repositories/factory.__resetForTest()` 가 `'service'` 그룹을 함께 리셋**하므로 테스트 하네스는 서비스별 reset 을 나열하지 않는다(인프라 더블은 남는다). 모듈마다 `declare global` + `getX` + `__setXForTest` + `__resetXForTest` 를 손으로 복사하던 시절의 블록은 전부 이 헬퍼로 대체됐다.

**리포지토리 경계 (ESLint 강제):** 모든 DB 접근은 `lib/server/repositories/**` 가 소유한다. 그 밖의 `lib/`·`app/` 코드는 `@/lib/db/schema`·`@/lib/db/client` 를 **값(value)으로 정적 import 할 수 없다** — 레포를 주입(`repositories/factory` 의 `get*Repo()`)해서 쓴다. `import type { DB }`(타입 전용)는 허용. **서비스의 트랜잭션 핸들은 `repositories/factory` 의 `getDb()` 로 받는다** — 리포와 **같은 주입점**이라 테스트는 `__useDrizzleWithDbForTest(db)` 한 번으로 리포·서비스가 함께 PGlite 로 간다(서비스를 손으로 재배선하는 하네스는 없다; 서비스가 `import('@/lib/db/client')` 를 직접 열던 시절에는 액션 테스트마다 서비스 7개를 `new XService(db, …)` 로 다시 조립해야 했다). 위반 시 lint 에러(`@typescript-eslint/no-restricted-imports`, 규칙명 `repo-boundary/db-access`) + 독립 드리프트 가드 테스트(`lib/server/__tests__/repo-boundary.test.ts`)가 잡는다 — 가드는 ESLint 가 못 보는 동적 `import('@/lib/db/*')` 와 `lib/server/services/**` 밖의 `getDb()` 호출도 잡는다(핸들을 그대로 내주는 접근자라 액션·로더가 부르면 경계가 조용히 다시 열린다). **의도적 예외**(`lib/server/db-boundary-allowlist.mjs` 에 명문화, 단일 출처)는 하나뿐이다: 크로스-애그리거트 캐스케이드(`services/purge-unverified-signup.ts`). **액션은 DB 핸들을 만지지 않는다** — 옛 `actionDb()` 테스트-오버라이드 레지스트리는 마지막 호출처 3개(loginAction 의 죽은 인자, `RfpService.setBoardVisible`, `WorkspaceService.replaceBizProfile` 로 이관)와 함께 사라졌고, 액션·로더 테스트 하네스는 `lib/server/__tests__/_harness.ts` 의 `setupServerTestEnv()` 하나다(서비스 단위 테스트는 SUT 를 직접 `new XService(…)` 로 조립한다 — 생성자 인자가 바뀌면 그 헬퍼들도 함께). 예외를 늘리려면 allowlist 에 추가하고 리뷰한다.

## Linear Design Language — Hard Rules

These are non-negotiable visual decisions enforced across all screens. The design language is **Linear** — dense, fast, structure carried by low-contrast borders not shadows. Light-first; dark mode is Linear's signature near-black (`#08090A`). **Note:** token *names* keep the `--md-sys-*` prefix from the prior MD3 system — only the values are Linear. `md-sys` in the name does not mean MD3. DESIGN.md is the canonical source.

- **No** Inter/Roboto/Arial direct import. Pretendard Variable (KR + Latin, Inter-derived) + Nunito (numeric) + JetBrains Mono (ASCII) only.
- **No** pill buttons. Interactive elements are 6px (`shape-small`). `shape-full` (9999px) only for Avatars, status dots, pills indicators.
- **No** hover shadow promotion — hover is a background-lightness shift only.
- **No** heavy/skeuomorphic shadows — most surfaces use a 1px border or elevation-1; big shadows only on floating elements (popover, dropdown, toast, dialog, command palette).
- **No** high-contrast dividers — default to `outline-variant` (the deliberately low-contrast border). The faint border IS the Linear look, not a bug.
- **No** `outline` token as text/icon color — it's a **border** token (1.41:1 light / 1.45:1 dark against `surface`, fails AA). Use `on-surface-variant` for secondary text/icons. Sole exception: purely decorative `aria-hidden` separators, enumerated in `OUTLINE_TEXT_ALLOWLIST` (`lib/design/design-hardrule-allowlist.mjs`) and enforced by `lib/design/__tests__/outline-text-drift.test.ts`. `on-surface-variant` itself still misses AA on container-tier backgrounds — see DESIGN.md §2 and TODOS.md.
- **Readable type before density** — app body baseline is 16px with unitless 1.5 line-height. Dense tables/lists may use 14px, captions 13px, and short metadata labels 12px; do not use sub-12px text for user-facing content. Preserve density with spacing and hierarchy, not tiny type (~32px rows, 28–36px buttons / default 32px).
- **No** accent gradients/neon/glassmorphism/blurred orbs. The accent is solid trust blue `#0061A4`. (단 하나의 좁은 예외: 랜딩 히어로 다크 씬 소프트 블룸 — DESIGN.md §9 랜딩·마케팅 예외 ⑤.)
- **No** illustrated empty states. Line SVGs (1.4–1.5 stroke) only.
- **로딩 모션 허용** — 넓은 영역은 펄스 스켈레톤, 인라인·타이핑 인디케이터는 펄스 점(staggered). `prefers-reduced-motion: reduce` 존중(저감 시 정지/단순화). 버튼 진행 등 짧은 진행 표시는 한국어(`처리 중…`/`불러오는 중이에요…`)로 통일 — 영문 `LOADING…` 은 폐지(DESIGN.md §6). 장식적 컨페티·강한 모멘텀 모션 제한은 유지(DESIGN.md §9 다섯 예외 — "축하 모먼트"·"테마 전환 리빌"·"브랜드 마크 진입"·"랜딩/마케팅 모션"·"예상 절감 계산기"). 자세히는 DESIGN.md §6 "로딩 모션".
- **No** № symbol (U+2116 NUMERO SIGN) anywhere — use plain numerics or zero-padded strings.
- **All** numerics (₩, qty, dates, RFP numbers like `P-2605-0042`) use `.md-numeric` class (Nunito + tabular-nums). Never on nav/labels/buttons, except the year number in the planned-opening status Chip in the landing service menu. Keep the surrounding status text unstyled.
- **Status** uses Chip component — never bracketed plain text `[ 결재중 ]`.
- **Typography** uses the typescale tokens — no `font-mono uppercase tracking` on labels/nav; sentence case with slight negative tracking.
- **Chip color** mapping: 성공/완료→tertiary, 실패/오류→error, 보류/신규→warning, 중립→surface, 주요→primary.
- **Motion** animates transform/opacity/color only (never layout); cause→effect under ~100ms (`duration-short-4`). 단, DESIGN.md §9의 다섯 예외(① "축하 모먼트" — 종결 성공 1회성 컨페티, ② "테마 전환 리빌" — View Transitions clip-path, ③ "브랜드 마크 진입" — 앱 셸 브랜드 마크의 1회성 SVG draw-on, ④ "예상 절감 계산기" — `/quote-start` 완료 화면의 최초 카운트업·브랜드 블루 폭죽과 증가 시 제한된 소형 폭죽, 모션 감소 존중, ⑤ "랜딩·마케팅 모션" — 랜딩/마케팅 면은 스크롤 pin·진입 스케일·가이드 커서 등 몰입형 모션 및 `prefers-reduced-motion` 미존중 허용)는 별도.

If frontend code looks "generic SaaS", check DESIGN.md §9 (anti-patterns) before defending it.

## TDD — Hard Rules

모든 코드 변경은 `superpowers:test-driven-development` 스킬을 발동하고 **RED → GREEN → REFACTOR** 사이클로 진행한다. 이 스킬의 Iron Law가 본 프로젝트의 비결정 사항이다:

> **NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**

- **Failing test 먼저, 구현 나중**. `__tests__/<name>.test.ts(x)`에 테스트를 작성하고 `pnpm test <path>`로 빨갛게 떨어지는 것을 직접 확인한 뒤 구현 코드를 작성한다.
- **테스트 후행 금지**. 구현부터 작성한 코드는 "참고용"으로도 남기지 말고 삭제 후 테스트부터 다시 시작. ("이미 X시간 썼는데 아까워서…"는 sunk-cost.)
- **즉시 통과한 테스트는 가짜 테스트**. RED를 직접 본 적 없으면 그 테스트는 무엇도 보장하지 않는다.
- **수동 브라우저 클릭은 테스트 대체재가 아니다**. 시각/UX 확인용이지 회귀 방지는 아니다 — 자동 테스트와 병행한다.
- **버그 픽스는 먼저 회귀 테스트로 재현**. 테스트가 빨갛게 뜨는 것을 보고 나서 픽스.
- **GREEN은 최소 코드만**. 통과시키기 위한 최소 구현 — 미래를 위한 옵션·파라미터·추상화 금지(YAGNI).

**TDD 면제 (그 외에는 모두 적용)**:
- 일회용 prototype/spike (커밋 안 함)
- 생성 코드 (codegen 산출물)
- 순수 설정 파일 (`*.config.*`, `eslint.config.mjs`, `drizzle.config.ts` 등)
- 시각/스타일만 손대는 변경 — 단 상태(state)·핸들러·조건 분기를 같이 추가하면 비예외.
- `app/**/page.tsx`·`app/**/layout.tsx` shell이 단순 컴포넌트 조립일 때 (안의 client component·server function 단위로 테스트).

면제에 해당해도 **확신이 안 서면 우선 테스트부터** — 30초 손해보다 회귀 한 번이 비싸다.

세부 RED-Flag 합리화 패턴(예: "이건 너무 사소해서…", "이미 수동으로 확인했어")과 cycle 가이드는 `superpowers:test-driven-development` 스킬 본문 참조.

## When Editing Documentation

The content docs (this file, `README.md`, `DESIGN.md`, `SCREEN_DESIGN.md`) cross-reference each other. After any change:
- If you edit DESIGN.md tokens → also bump `styles/tokens.css`. The canvas token (`--md-sys-color-background`) additionally drives browser/PWA chrome, and its JS copy lives in exactly one place: `lib/theme/canvas-colors.ts` (`CANVAS_COLOR`). `app/layout.tsx` (`viewport.themeColor` + the FOUC inline script), `app/manifest.ts`, and the runtime updater `lib/theme/chrome-color.ts` all dereference it — do not re-type the hex. `app/__tests__/chrome-colors.test.ts` reads `tokens.css` directly and fails if any link in that chain drifts, including if a hex literal reappears in layout/manifest. See DESIGN.md §2.
- If you add or change a screen/route → register it in SCREEN_DESIGN.md (§0 route map + screen table) and, for new top-level trees, the Routing Architecture block above. A new **public** page under `app/(public)` that must open while logged in (magic links) also needs registering in `ALWAYS_PASSTHROUGH_PREFIXES` (`lib/auth/route-decision.ts`) — `lib/auth/__tests__/public-routes-registered.test.ts` walks the folder and fails otherwise.
- **도메인 어휘는 각각 출처가 하나다** (v0.4.3.0 정리, 전부 드리프트 가드 테스트로 고정): 결제수단 = `PAYMENT_METHODS`(`lib/types/bid.ts`, 런타임 튜플이라 `z.enum()` 에 그대로 들어간다 — 라벨 누락은 컴파일러가(`PAYMENT_METHOD_LABELS` 가 `Record<PaymentMethod,_>`), 카테고리 누락은 드리프트 가드 테스트가 잡는다(`PAYMENT_METHOD_CATEGORIES` 는 평범한 배열이라 컴파일러가 못 잡는다 — `lib/types/__tests__/bid-tiers.test.ts`)), 가맹점 등급 = `MERCHANT_TIERS`(같은 파일 — `payment-fees-schema.ts` 의 구간 키가 여기서 파생하므로 손으로 나열하면 `.strict()` 가 신규 등급 요율을 조용히 거부한다), 현재 운영 솔루션 = `SOLUTION_VALUES`(`lib/types/rfp-terms.ts`, 라벨·옵션은 `lib/rfp/solutions.ts` 가 얹는다 — UI 는 `solutions.ts` 만, 서버·검증 계층은 `rfp-terms.ts` 만 임포트). 새 값 추가는 해당 배열 한 곳 + 라벨이며, 액션·스키마·위저드에 배열을 복제하지 않는다.
- 절을 추가·이동해도 파일 마지막 줄의 센티널 주석(`CLAUDE.md: END`)은 **항상 맨 끝**에 남기고, 그 리터럴을 문서 본문 어디에도 두 번째로 적지 않는다 — 위 ⚠️ 블록의 절단 판별이 그 줄의 위치 하나에 걸려 있고, 리터럴이 앞쪽에 또 있으면 `grep` 판별이 잘린 로드를 통과시킨다.
- **`AGENTS.md` 를 다시 쓰는 도구를 이 저장소에 겨누지 마라** — 특히 "AGENTS.md 가 너무 길다"에 반응하는 문서 리팩터 스킬. 심링크라 제자리 쓰기는 이 파일을 통째로 덮어쓰고(그때 `git status` 는 `AGENTS.md` 가 아니라 **`CLAUDE.md` 가 변경됐다고** 표시한다 — 원인을 찾기 어렵다), 임시파일→rename 방식은 링크를 일반 파일로 되돌려 사본 드리프트를 되살린다.
- Canonical product rules now live in **code + tests + SCREEN_DESIGN.md 의 "확정 결정" 블록** (Context 절; the legacy `PG_RFP_SPEC.md` / `SPEC.md` docs were removed). If a decision contradicts the "확정 결정" rules, **stop and ask**.

## Skill routing (project-specific only)

대부분의 스킬은 description 자동 매칭에 의존한다. 아래는 프로젝트 특수 라우팅:

- `superpowers:test-driven-development` — **모든 신규 코드/버그픽스/리팩터링 직전 필수**. 면제 범위는 "TDD — Hard Rules" 참조.
- `/plan-eng-review` — M2 이후 새 기능 코딩 시작 전 (아키텍처 락인)
- `/design-review` — 화면 시각 폴리시 (Linear 디자인 시스템 정합 검증)
- `/investigate` — 버그·에러·예상치 못한 동작
- `/ship` — PR 생성·배포 단계

## Health Stack

`/health` 가 사용하는 도구 체인. e2e는 별도 (`/qa` 또는 `pnpm e2e`).

- typecheck: `pnpm tsc --noEmit`
- lint: `pnpm lint`
- test: `pnpm test`

TDD 사이클 중 단일 파일만 실행: `pnpm test <path-to-test>` — RED/GREEN 확인은 항상 단일 파일로 빠르게, 전체 그린 확인은 `pnpm test`.

**CI (`.github/workflows/ci.yml`)는 `main`·`dev` 대상 PR 과 `main` push 에서 lint+tsc · unit 을 돌리고, e2e 는 `main` 대상 PR 과 `main` push 에서만 돌린다** (dev 대상 PR 은 잡 레벨 `if` 로 스킵 — 사용자 결정 2026-09-04). e2e 를 PR 로 옮긴 것 자체는 2026-08-26 변경이다 — 그 전에는 `main` push 전용이라 PR 에서 required 인데도 **보고되지 않은 채** 통과했고, 깨진 스펙 6개가 두 달간 머지돼 들어왔다. 그래서 **e2e 게이트는 이제 dev→main 컷 PR 한 곳뿐이다** — 깨진 스펙이 dev 에 머무를 수 있으니 컷 PR 의 e2e 결과를 반드시 읽어라(머지 뒤에 있는 게이트는 게이트가 아니다). e2e 로컬 실행 전제는 `docker compose --profile test up -d pg-test`(5433/`supporter_b_test`)이며, `pnpm e2e` 출력은 `| tail` 로 파이프하지 말 것 — 종료코드가 가려진다.

## Worktree Workflow

모든 기능 개발·버그픽스는 **worktree 브랜치**에서 진행한다. dev는 항상 clean 상태 유지.

- 새 작업 시작 시 `EnterWorktree` (네이티브 도구)로 `.worktrees/<branch-name>` 생성
- Worktree 디렉터리: `.worktrees/` (`.gitignore`에 등록됨)
- 브랜치 명명: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`
- PR은 `/ship` 스킬로 생성
- PR 머지 후 `git worktree remove .worktrees/<name> && git branch -d <name>` 정리

**동의 없이 worktree를 자동 생성해도 된다.** 별도 확인 불필요.

<!-- CLAUDE.md: END -->
