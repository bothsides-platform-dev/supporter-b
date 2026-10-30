# 제품 규칙 상세

`CLAUDE.md` Domain Context의 불변식을 구현 수준으로 푼 문서다. 다루는 주제의 절만 읽는다. 구현 동작의 최종 근거는 코드와 테스트이고, 화면 규칙은 `SCREEN_DESIGN.md`의 확정 결정이 소유한다. Bidding is sealed 1:N; discovery is open (opt-out)라는 두 축(Discovery, Participation)은 분리해서 다룬다.

## 오픈 게시판 (Discovery)

**Discovery = open by default, buyer opt-out.** Every legacy `sent` RFP with `deadline > now` and `board_visible=true` appears on the PG-facing open board; new PG consultation requests are private (`/opportunities` + PG home 탐색 section). 공개 필드 목록과 경계는 `CLAUDE.md` Domain Context의 오픈 게시판 화이트리스트가 단일 출처다(세 문서가 사본을 들고 있을 때 서로 어긋났다). **Board visibility is set once at RFP creation (wizard step 4, `RfpStep4Review` checkbox — gated on `OPEN_BOARD_ENABLED`) and is read-only thereafter** — the UI shows a status chip (`RfpBoardVisibilityStatus`) with no toggle. `setRfpBoardVisibilityAction`/`rfpRepo.setBoardVisible` are kept server-side for admin/recovery use but no UI surface calls them. **Kill switch**: `OPEN_BOARD_ENABLED = false` in `lib/features/open-board.ts` temporarily hides the entire open-board surface (board page, nav, home 탐색 section, wizard checkbox). Data and server logic are intact — flip to `true` to restore. (v0.2.52.0)

## 참여 요청 (Participation)

**Participation = buyer-gated.** A non-invited PG sends a one-time cold-pitch request (`rfp_pg_requests`, UNIQUE per (rfp, pg), rejection permanent). Buyer **accept** adds them to the allowlist + a real invitation (full info then visible in their inbox); **reject** is final.

## 견적 접수 기간

**견적 접수 기간 = 상태 + 유효 마감 (v0.12.0.0).** 신규 견적은 RFP가 `sent`이고 `rfps.deadline > now`일 때만, 재요청 응답은 같은 상태이면서 해당 PG의 pending 재요청 `deadline > now`일 때만 받는다. 읽기·표시 규칙의 단일 출처는 `lib/rfp/bid-window.ts`의 `isRfpBidWindowOpen`/`isPgBidWindowOpen`이며, 재요청 마감은 공용 RFP 마감 대신 편지함·칸반·상세·보낸 견적 요약의 표시와 정렬에 일관되게 쓴다. 기한만 지난 `sent` 요청은 미선정으로 분류하지 않고 `마감`으로 표시하며 `BidWizard`와 제출·재요청 행동을 숨긴다. **화면 게이트는 편의층일 뿐 쓰기 경계가 아니다** — `BidService.submit`이 트랜잭션 안에서 `findByIdForUpdate`로 RFP 행을 잠그고 현재 견적·pending 재요청을 다시 읽은 뒤, 캡처한 같은 `now`로 `deadline <= now`를 거부한다(`RFP_NOT_OPEN`/`REQUOTE_DEADLINE_PASSED`). 이 재검증이 직접 액션 호출, 마감 직전 경합, 동시 중복 제출을 막는 최종 경계다.

## 견적 수정 요청

**견적 수정 요청 (v0.27.0.0).** 구매사는 견적을 제출한 PG사에 수정 내용과 PG사별 응답 마감을 보내며, PG는 직전 견적의 조건·메모·요율을 불러와 새 회차를 제출한다. PDF는 유지·교체·제거를 고른다. 유지 시 첨부 소유 bid는 그대로 두고 `bids.proposal_source_bid_id`로 원본을 가리킨다. `BidService.submit`은 RFP 잠금 안에서 현재 재요청 ID·마감 판본·기준 bid ID와 ready 첨부의 소유 PG를 재검증한다. 구매사 비교·선정은 PG별 최신 제출 회차를 쓰되 새 회차 전까지 기존 견적도 선정할 수 있다. 양측은 제출 회차의 작성자·조건·메모·첨부 이력을 읽고, PG 로더는 자기 워크스페이스 회차만 제공한다. 화면 규칙은 SCREEN_DESIGN.md의 확정 결정, 배포 DDL은 `docs/DEPLOY_LIGHTSAIL.md`를 따른다.

## 구매사 PG 피커

**기존 견적의 구매사 PG 피커에 무엇이 뜨는가 (v0.4.53.0)**: 기존 견적요청 위저드의 PG 선택·최종 확인과 발송 후 PG 추가 초대는 둘 다 `searchWorkspaces` → `DrizzleWorkspaceRepository.search()` 한 곳을 지난다. 그 조회는 **`status='active'` 만** 돌려주고(이전에는 조건이 `type` 하나뿐이라 셀프서비스 생성 기본값인 **심사 대기 워크스페이스가 모든 구매사에게 노출**됐다), 여기에 더해 **이름에 `test`/`테스트` 가 든 워크스페이스를 기본 제외**한다 — 내부 테스트용 PG 를 실사용자에게 숨기기 위함이고, 규칙 단일 출처는 `lib/features/test-pg.ts` 의 `TEST_PG_NAME_TOKENS` 다(TS 술어 `isTestPgName` 과 SQL `notIlike` 가 같은 배열에서 파생되며 PGlite 토큰 루프 테스트가 드리프트를 잡는다). **필터는 앱이 아니라 SQL 에 있다** — `limit(q?20:500)` 이 필터 이후에 걸려야 결과 개수가 줄지 않기 때문. 숨김 해제는 **콘솔 쿠키** `document.cookie='support-b-show-test-pg=1; path=/'` + 새로고침이며(끄기는 `max-age=0`), 서버(RSC 는 `cookies()`, 라우트는 `request.cookies`)가 직접 읽으므로 기본 상태에서는 숨긴 이름이 RSC 페이로드에도 JSON 응답에도 실리지 않는다. **보안 경계가 아니라 가시성 조정이다** — 쿠키 이름을 아는 사람은 누구나 켜며(`/login/ops` 의 숨은 URL 과 같은 성격), 실제 경계는 라우트의 buyer+`type=pg` 게이트다. 두 축은 **직교**한다: 쿠키를 켜도 `pending` 은 나오지 않는다. 부분 문자열 매칭이라 상호에 토큰이 우연히 든 정상 PG 도 조용히 숨겨지는 오탐은 **수용된 트레이드오프**다. 범위는 발견·선택 표면뿐 — 딜룸·채팅·알림·이메일의 PG 이름 표기는 `search()` 를 지나지 않아 그대로다. 쓰기 경로(`filterPgIds`·`createRfp`)는 아직 status 를 보지 않는다(UI 로는 도달 불가, TODOS.md P3).

## 초대 PG의 필드 숨김과 신규 계약 면제

**Per-field opt-out for invited PGs — `현재 카드 수수료`.** Even an invited PG who sees the full brief can be denied one field: the buyer's **current card fee** (default shown, opt-out per RFP). When off, the value is stripped server-side in `loadPgRfpDetail` (the PG never reads it from the RSC payload/network — `RfpBriefPanel`'s render gate is only the visual fallback). The buyer's own comparison baseline always keeps the fee. Toggle lives in the RFP create wizard (step 2, under 현재 카드 수수료). **Implementation note (v0.2.26.x, migration complete):** current-terms is stored as a versioned JSONB document (`current_terms` column, `lib/types/rfp-terms.ts`). PG field visibility is controlled by a `hidden_from_pg` text-array (path allowlist) — `loadPgRfpDetail` strips any path that has a handler in `PG_STRIP` (fail-closed). The legacy `current_fee_visible_to_pg` boolean column and individual `current_*` columns were dropped in v0.2.26.2 — `current_terms` is the sole authoritative store. `currentFeeVisibleToPg` is derived at the app layer from `hiddenFromPg`. User-facing behavior is unchanged. **New-contract exemption (v0.2.68.0):** when 견적 유형 = 신규 계약 (`contractType==='new'`), the PG-contract-history fields that can't exist for a first-time PG contract — 전년도 연간 PG 총 거래액(`annualPgVolume`), 현재 카드 수수료(`currentFeeRate`) + its PG-visibility, 현재 월 정산한도, 현재 보증보험, 현재 정산주기 — are hidden in both wizard step 2 (input) and step 4 (review) and stripped server-side in `RfpService.createRfp` before persistence and idempotency hashing (trust boundary — a tampered draft/direct call still can't leak them into `current_terms`). The previously-required `annualPgVolume` is no longer required for `'new'` — the SSOT gate is `isAnnualPgVolumeSatisfied` in `lib/rfp/required-fields.ts`. 배송·서비스 기간 and 현재 운영 솔루션 are KEPT (PG-independent). Renewal/null behavior unchanged.

## 초대 링크

**Per-RFP unique URL + token** in invitation email; token authoritative only for first entry, then workspace membership takes over

## 견적 내용 질문 흐름

**견적 내용 질문 흐름 (2026-09-24)**: 실제 구매사 작성은 `RfpQuestionFlow`가 한 화면에 질문 하나를 보여준다. 기존 입력은 `RfpStep2Content`의 질문별 렌더를 재사용하고, 랜딩·튜토리얼은 기존 묶음 화면을 쓴다. `content-questions.ts`가 순서·신규/갱신 분기·질문별 완료 조건을 소유한다. 새 판매 정보(`productInfo`)는 `current_terms`의 선택 키로 보관한다. 입점 판매자 유무는 선택, 환금성 상품·최고 가격대·판매 방식은 신규 상담 발송에 필수다. `lib/rfp/product-info.ts`가 값·스키마·표시를 소유하고 액션과 서비스가 검증하며 판매 방식은 정규화 후 멱등 해시에 포함한다. PG 요청 상세에는 공개하지만 오픈 게시판 projection에는 추가하지 않는다. 기존 견적의 미입력을 아니요로 해석하지 않는다.

## 맞춤 PG 상담

**맞춤 PG 상담 (2026-09-19)**: 신규 구매사 요청은 업종별 관리자 정책(`pg_matching_policies`)으로 한 PG에 상담을 요청하고, PG 심사·견적 이후 구매사가 최종 선정한다. 거절/철회 시 이전 PG를 제외한 다음 후보를 제안한다. `rfp_matching_requests`는 업종·분류 스냅샷과 구매사별 제출 키를, `rfp_pg_reviews`는 선택 조건·심사 이력을 저장한다. 관련 상태 변경은 RFP 행 잠금을 공유한다. 기존 발송된 1:N 견적은 보존하고 신규 상담은 게시판·추가 초대·참여 수락을 차단한다. 관리자는 별도 admin-supporter-b `/pg-recommendations`에서 업종 분류·PG 순서·수수료 조건을 설정한다. 업종별 후보가 없으면 `pg_matching_defaults`에 관리자가 지정한 기본 PG를 추가 검토(Gray) 대상으로 추천한다. 접수 불가(Black)·삭제된 업종은 우회하지 않고 이전 상담 PG·비활성 PG를 제외한다. 기본 PG 미설정·후보 소진 시에는 접수할 수 없다. 업종은 구매사가 직접 선택하며 관리자에서 MCC 기반 목록을 검색·일괄 등록할 수 있다. 같은 PG를 여러 업종에 연결할 수 있고 기존 `pg_recommendation_members`는 레거시 매핑으로 남는다. 새 테이블 DDL과 outbox enum은 양쪽 코드보다 먼저 적용한다. 화면/운영 규칙은 SCREEN_DESIGN.md의 맞춤 PG 상담 확정 결정, 배포는 `docs/PG_MATCHING_ROLLOUT.md`를 참조한다.

## 업종 직접 입력

**업종 직접 입력 (2026-09-24)**: 실제 구매사 질문의 `IndustrySelection`은 표준 목록 검색·카테고리별 라디오와 직접 입력을 함께 제공한다. `industrySelectionSchema`가 기존 ID/직접 입력 이름의 배타성·길이를 검증한다. 공백·대소문자 정규화 후 기존 이름과 일치하면 기존 정책을 적용하고 미일치 이름은 상담에만 저장하여 기본 PG(Gray)를 사용한다. 서버가 판정한 `rfp_matching_requests.is_custom_industry`는 삭제된 등록 업종의 NULL ID와 구분하여 재추천 우회를 막는다. 표준 29개는 `20260924-custom-industries.sql`의 일회성 등록이며 `app_data_migrations` 기록이 재실행·삭제 후 복원을 막는다. 배포 절차는 `docs/PG_MATCHING_ROLLOUT.md`, 화면 규칙은 SCREEN_DESIGN.md §0을 따른다.

## 한국 영업일 견적 마감

실제 구매사의 맞춤 PG 상담 마감은 요청 다음 날부터 **한국 영업일 5일**을 기본으로 하며, 빠른 선택은 3·5·10영업일이다. 구매사가 최소 3영업일 이상·요청일 기준 30달력일 이내의 영업일을 고를 수 있다. 마감 시각은 해당일 **18:00 KST**다. 토·일, 한국천문연구원 `getRestDeInfo` 공휴일, 5월 1일, 운영자가 기록한 임시휴일을 제외한다. 5월 1일에는 자체 대체휴일을 만들지 않는다. 정책 계산은 `lib/rfp/business-deadline.ts`, 공식 응답 검증은 `lib/server/calendar/official.ts`, 영속 달력·수동 예외·불변 변경 이력은 `business_calendar_*` 테이블이 소유한다. 미적재 연도는 근무일로 추정하지 않고 요청/변경을 차단한다. 기능 플래그 없이 항상 적용되므로 올해·다음해 달력 적재와 coverage 확인은 앱 배포(재시작) 전에 끝낸다. `scripts/deploy/lightsail-deploy.sh`가 PM2 reload 전에 달력을 적재하고 `scripts/calendar/check.ts`로 앱이 필요로 하는 연도(오늘부터 30일 안)가 있는지 확인해 비었거나 확인이 실패하면 중단한다. 기존 1:N 견적도 같은 영업일 규칙을 따른다. 랜딩·튜토리얼 샘플은 서버를 부르지 않는 `lib/rfp/sample-calendar.ts`(공식 공휴일 없이 주말·5월 1일만 제외)를 쓴다. 신규 요청·구매사 마감 변경·재요청은 쓰기 트랜잭션에서 달력과 상태를 재검증한다. 새 공휴일은 저장된 마감을 자동 이동시키지 않고, 변경 이벤트를 통한 영향 구매사 안내로 처리한다. 마감·리마인더 알림은 `deadline_notification_deliveries`의 멱등 키와 outbox를 공유한다. 운영 순서와 장애 복구는 `docs/BUSINESS_DEADLINES_ROLLOUT.md`를 따른다. 기존 레거시 견적의 저장 마감값은 일괄 변환하지 않는다.

## 로그인 전 견적 작성

구매사 랜딩의 비로그인 CTA는 `/quote-start`에서 선택 사업자번호 → 홈페이지 → 자동 입력 확인 → 부족한 질문으로 시작한다. 자동 입력·AI 보완·맞춤 산정은 별도 기능 플래그 없이 제공한다. AI와 무관한 직접 작성·서버 맞춤 절감액·가입 인계는 [운영 계약](docs/GUEST_QUOTE_ASSIST.md)을 따른다. `RfpDraftProvider`로 같은 질문·검증을 쓰되 회원 초안과 데모에서 저장소를 격리한다. 작성 중 답변·진행 위치는 localStorage, 원본 첨부는 IndexedDB에 보관한다. 가입 버튼에서 답변·원본을 서버에 먼저 저장하고 계정·워크스페이스·입점 심사 신청과 같은 가입 트랜잭션으로 연결한다. 연결 전 서버 초안은 마지막 저장 후 24시간, 연결 후에는 요청 완료·직접 삭제·계정 탈퇴까지 보관한다. 기존 입점 심사 Slack에 서버 저장본의 전체 답변·첨부명·크기를 함께 전달한다(원본·다운로드 URL 제외). 승인된 같은 구매사 계정은 다른 기기에서도 복원하며, 서버 revision·최종 요청 멱등 키·원자 완료 처리를 공유한다. 로그인·가입·이메일 인증·승인 이후 `/rfp-create?resume=guest`에서 선택한 초안을 계정+워크스페이스에 고정하고 서버 파일은 재업로드 없이 회원 첨부로 인계한다. 기존 로그인만 거친 브라우저 초안은 인증 업로드를 수행한다. 사업자 확인 뒤 유효하지 않은 답변으로 돌아가거나 PG 추천으로 진행하며, 기존 초안의 최종 요청은 사용자가 직접 실행한다. `GUEST_RFP_AUTO_SEND_ENABLED` 활성 시 명시적으로 확정한 예약은 인증·승인 후 서버가 자동 발송한다. 신규 예약의 소유권·30일 만료·완료 효과·배포 계약은 `docs/GUEST_RFP_AUTO_SEND.md`를 따른다. 다른 계정/워크스페이스의 자동 복원은 금지하고 회원 초안은 덮어쓰지 않는다. 완료 화면은 사용자 매출 구간·별도 카드 거래액과 내부 요율로 계산하는 맞춤 절감액 → 로그인·가입 → 답변 요약 순서다. 고정 거래액·인하 폭 슬라이더는 제거했다. 선택적 quoteContext에 회사 정보·제안 확인·작성 위치·산정 입력/결과를 보관하며 기존 초안과 호환한다. 양의 서버 결과만 감소 모션을 존중하는 결과 연출을 사용한다.  공개 업종 목록은 `PublicIndustry`의 `id/name/mccCode` projection만 제공한다. `/api/guest-rfp/events`는 기본적으로 시작·작성 완료를 `guest_rfp_events` 복합 PK로 선점해 기존 Slack 채널에 최대 한 번씩 전달한다. 서버/클라이언트 `GUEST_RFP_SLACK_THREADS_ENABLED` 플래그가 켜진 뒤 새 초안은 Bot 원문 하나에 분석 댓글과 10분 진행 요약을 연결한다. 서버 요청 완료는 다음 발송 주기에 한 번 알리고, 전체 행동·답변은 별도 관리자 `/guest-journeys/[draftId]`에서 조회한다. 완료 후 지연 도착 행동은 상세에만 남긴다. `guest_journeys`가 증명·소유권·스레드를, 이벤트·배치 테이블이 중복 선점과 미확정 발송을 소유한다. 가입·최종 요청 성공은 서버 확인 결과만 기록한다. 2026-10-24 결정으로 질문 완료 답변과 가입 이메일·회사명·사업자등록번호·담당자명·인증된 연락처는 Slack 전용 행동 값으로 최대 500자까지 기록하며 GA에는 보내지 않는다. 비밀번호·인증번호·인증 ID·파일 원본은 제외한다. 추가 DDL·Bot 설정·보존·롤백은 `docs/GUEST_RFP_SLACK_THREADS.md`를 따른다. DDL 선행·오류 처리·브라우저 보존 한계는 `docs/GUEST_RFP_INTAKE.md`, 신뢰 경계는 `docs/THREAT_MODEL.md` §7을 따른다.

**미인증 재가입 예외**: 같은 이메일로 새 가입이 오면 정확한 같은 초안 ID+HttpOnly 비밀값 재제출만 응답 유실의 로그인 복구로 보존한다. 그 밖에는 기존 연결 초안을 폐기·소유 해제한 뒤 미인증 계정을 원자적으로 교체한다. 초안 존재만으로 공격자가 고른 비밀번호 자격 증명을 고정할 수 없다.

## 신규사업체 구매사 자동 승인

신규 구매사 가입·워크스페이스 생성에서 서버의 국세청 정상 영업 검증 이후 APICK(`APICK_API_KEY`)으로 개업일·대표명을 확보하고 국세청 `/validate`로 번호·개업일·대표명 일치와 정상 영업을 검증한다. 사용자 추가 입력 없이 한국 날짜 기준 개업일부터 6개월 미만(월말 보정, 정확히 6개월은 제외)만 내부 영세 예외로 승인한다. 보나페이 조회·판정은 제거했으며 과거 승인 이력의 표시와 미인증 재가입 정리 호환만 유지한다. 간이과세·클라이언트 등급은 승인 근거가 아니다. 키 부재·실패·검증 불충족은 수동 심사로 접수한다.

`sole`·`new_business_exception`, active 워크스페이스, approved 신청과 `system:apick` 자동 승인 감사를 같은 트랜잭션으로 저장한다. APICK 성공·번호 일치 응답의 전체 JSON(`api`·`data`, 대표명 포함)은 승인 여부와 무관하게 신청에 연결된 `admin_audit_logs`의 별도 `workspace.apick_lookup` 사건 `payload_json.after.response`에 보관한다. 키·요청 헤더와 국세청 원문은 저장하지 않는다. 기존 이메일 인증·미인증 재가입 보호를 유지하며 기존 대기 건은 일괄 승인하지 않는다. DDL 선행·관리자 표시·환경변수·복구는 [운영 절차](docs/BUYER_AUTO_APPROVAL.md)를 따른다.

## 노온–구매사 합의서

신규 계약 당사자는 **주식회사 노온과 구매사**다. 선정 PG는 이용 대상·수수료 조건으로만 기록한다. 견적 선정 트랜잭션이 `platform_buyer` 대기 계약을 만들고 구매사가 회사 정보 저장 → 노온 사전 날인 PDF 확인 → 명시적 서명 요청을 진행한다. 지정 구매사 담당자 한 명만 SnowSign 이메일 링크에서 본인인증·서명한다. 약정기간은 실제 PG 이용 시작일부터 2년이며 할인액 반환 청구자는 노온이다. PG 정산대금 상계는 없다.

새 문서는 buyer/platform 판별 타입과 `platform_agreement_drafts.prepared`의 불변 발송 스냅샷을 사용한다. 기존 `pg` 필드·sent_document를 노온으로 재해석하지 않는다. 서버 원본 도장·문안·당사자·견적·표준 요율 판본을 고정하며 같은 PDF 렌더러를 쓴다. 구매사만 신규 계약을 조회·저장·발송하고 완료본/감사추적인증서는 구매사 보관함에 한 번만 만든다. PG 계약 탭·작성·템플릿·복구·보관함과 수동 계약 업로드는 폐지한다. 폐지 페이지/API는 404 또는 명시적 기능 폐지 오류로 차단한다.

기존 `pg_buyer` 계약·첨부·감사는 운영 보존과 내부 동기화만 유지한다. 사용자 목록·상세·다운로드·알림에서는 숨기며 과거 선정 보정 생성·재촉을 중단한다. 외부 기존 계약 일괄 취소는 하지 않는다. 관리자 PG 표준 요율은 계속 사용한다. 구현은 `PlatformAgreementService`·`PlatformAgreementPanel`·`platform-agreement.ts`, DDL/복구/검증은 [전환 런북](docs/PLATFORM_BUYER_AGREEMENT_IMPLEMENTATION.md)이 소유한다.

### 서명 정책과 보존

**서명 정책과 보존**: `signing-policy.ts`는 kind별 정책을 분리한다. 신규는 지정 구매사 정확히 한 명과 본인인증, 레거시는 기존 구매사+승인 PG 정책을 유지한다. 웹훅은 HMAC 검증 후 재조회하는 트리거이며 폴링과 같은 경로를 쓴다. 발송 리스·revision·stamp·providerRef CAS 및 완료 멱등성을 유지한다. 새 발송 스냅샷은 `platform_agreement_drafts.prepared`, 레거시 문서 이력은 기존 `sent_document`다. 원본 도장은 public에 넣지 않는다. 폰트·글리프·레이아웃 제약은 `lib/contract-doc`의 테스트가 지킨다. 과거 연동 세부 기록은 `docs/SNOWSIGN_SANDBOX.md`와 `docs/LONG_TERM_AGREEMENT_ROLLOUT.md`를 참고하되 신규 제품 정책으로 해석하지 않는다.

공급자 API 사본은 `docs/SNOWSIGN_API.md`다. 실제 연동 코드는 `lib/server/signing/`·`PlatformAgreementService`와 기존 건 동기화를 맡는 `ContractSigningService`가 소유한다.

## PG 견적 템플릿 폐지

견적 템플릿의 메뉴·명령 팔레트·`G → Q`와 작성기(실제 견적·데모·튜토리얼)의 불러오기·관리·저장을 제거했다. `/quote-templates`는 404이며 기존 조회·저장·복제·삭제 액션은 시그니처를 유지하고 DB 접근 없이 `QUOTE_TEMPLATE_FEATURE_REMOVED`를 즉시 반환한다. PG 상세 응답에 `quoteTemplates`를 싣지 않는다. `bid_quote_templates` 데이터·스키마·내부 저장소는 보존하고 기능 플래그·데이터 삭제 마이그레이션은 추가하지 않는다. 직접 제출·초안 복원·수정 견적의 이전 값 채우기와 메시지 템플릿은 유지한다.

## 랜딩 프레이밍

구매사 랜딩의 '맞춤 PG 견적'은 신규 구매사 흐름이 맞춤 PG 상담이라 'PG 비교 견적'·'경쟁 입찰'을 대체했다(사용자 결정 2026-10-10, v0.34.6.2).

## 도메인 어휘

**도메인 어휘는 각각 출처가 하나다** (v0.4.3.0 정리, 전부 드리프트 가드 테스트로 고정): 결제수단 = `PAYMENT_METHODS`(`lib/types/bid.ts`, 런타임 튜플이라 `z.enum()` 에 그대로 들어간다 — 라벨 누락은 컴파일러가(`PAYMENT_METHOD_LABELS` 가 `Record<PaymentMethod,_>`), 카테고리 누락은 드리프트 가드 테스트가 잡는다(`PAYMENT_METHOD_CATEGORIES` 는 평범한 배열이라 컴파일러가 못 잡는다 — `lib/types/__tests__/bid-tiers.test.ts`)), 가맹점 등급 = `MERCHANT_TIERS`(같은 파일 — `payment-fees-schema.ts` 의 구간 키가 여기서 파생하므로 손으로 나열하면 `.strict()` 가 신규 등급 요율을 조용히 거부한다), 현재 운영 솔루션 = `SOLUTION_VALUES`(`lib/types/rfp-terms.ts`, 라벨·옵션은 `lib/rfp/solutions.ts` 가 얹는다 — UI 는 `solutions.ts` 만, 서버·검증 계층은 `rfp-terms.ts` 만 임포트). 새 값 추가는 해당 배열 한 곳 + 라벨이며, 액션·스키마·위저드에 배열을 복제하지 않는다.
