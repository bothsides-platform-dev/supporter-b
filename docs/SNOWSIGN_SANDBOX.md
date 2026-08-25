# 스노우싸인 실 API 실측 기록

딜룸 건별 임베드 발송 설계가 서 있던 가정들을 실 API 키로 확인한 결과. 유닛 테스트는
전부 HTTP mock 이라 이 항목들을 **검증하지 못한다** — 여기가 유일한 근거다.

재측정이 필요하면 두 가지 경로가 있다.

- **통합 경로(권장)**: 로컬 앱을 띄우고 딜룸 계약 탭에서 실제로 발송한다. 우리 sandbox·
  오리진 가드·attach 배선까지 함께 검증된다. 아래 결과는 이 경로로 얻었다.
- **독립 하네스**: `SNOWSIGN_API_KEY=... pnpm signing:smoke` → `http://lvh.me:4599`.
  앱 없이 임베드만 띄워 오는 postMessage 를 원본 그대로 찍는다(`scripts/signing/snowsign-smoke.ts`).
  API 응답 형태만 빠르게 볼 때 쓴다.
- **템플릿 경로 하네스**: 같은 스크립트에 `--template` 을 붙이면 업로드→템플릿 생성→
  발송 경로(T1~T10)를 잰다. 임베드 경로와 재는 것이 다르다 — 아래 "템플릿 경로 실측" 절.

> ⚠️ 스크립트 출력에는 실 계약 참여자 이메일 등 라이브 데이터가 섞인다.
> 원본 출력을 그대로 붙여넣지 말고 **판정 결과만** 아래에 옮겨 적을 것.

---

## 판정 (실측 완료 2026-08-01, 실 API 키 · 딜룸 임베드 · 실제 발송 1건)

측정 방법: 로컬 앱(`partner.lvh.me:3000`)의 딜룸 계약 탭에서 **우리 sandbox 안의 iframe**으로
끝까지 발송. 스노우싸인 사이트에서 직접 한 게 아니라 통합 경로를 그대로 탔다.

| # | 질문 | 결과 |
|---|---|---|
| Q1 | `flows:['pdf_send']` 임베드가 업로드 → 배치 → 발송까지 완주하는가 | ✅ **완주** — 5단계 위저드(문서 업로드 → 참여자 설정 → 서명란 배치 → 서명란 확인 → 최종 확인), 실제 계약 생성·발송 성공 |
| Q2 | 완료 postMessage 의 정확한 형태 | ✅ **`snowsign.embed.contract_sent`**, payload 에 `contract_id`·`title`·`status`·`sent_at`. 전체: `{source:'snowsign.embed', type:'snowsign.embed.contract_sent', payload:{contract_id, title, status:'pending', sent_at}}` |
| Q3 | `external_id` 가 `GET /v1/contracts/{id}` 에 되돌아오는가 | ❌ **아니다** — 응답에 `external_id`·`integration` 키가 **아예 없다**. 확인된 키: `contract_id, title, description, status, signing_order, participants, variables, integrity_hash, email_issue, email_issue_count, created_at, sent_at, completed_at, cancelled_at, cancelled_reason, expires_at` |
| Q4 | 임베드 오리진 | ✅ **`https://snowsign.jtsnowball.com`** — API 호스트(`api-snowsign.jtsnowball.com`)와 **다르다** |

### ~~⚠️ 웹훅은 이 실측에서 **검증되지 않았다**~~ — 아래 결론은 **틀렸다** (2026-08-04 정정)

> 이 절의 추정("폴링이 100% 를 혼자 했을 가능성이 높다")은 콘솔을 보지 않고 내린
> 것이었다. 실제로는 웹훅이 등록·활성 상태로 돌고 있었고 운영 서버가 200 으로 받고
> 있다 — 문서 아래쪽 "T10 — 웹훅은 실제로 동작하고 있었다" 절이 근거다. 아래 문단은
> 당시 판단 이력으로 남긴다. **교훈: 문서에 절이 없다는 것은 기능이 없다는 뜻이 아니다.**

`SNOWSIGN_WEBHOOK_SECRET` 이 비어 있었고, 라우트는 미설정이면 fail-closed 401 이다 —
웹훅이 왔더라도 처리될 수 없었다. 게다가 **Public API 문서에는 웹훅 절이 아예 없다**
(등록 엔드포인트도 이벤트 목록도 없음). `lib/server/signing/webhook.ts` 의 "SnowSign 은
진행 이벤트를 등록 URL 로 POST 한다"는 서술은 문서 근거가 없는 가정이다. 시크릿도 API 가
아니라 스노우싸인 **콘솔**에서 발급받는 out-of-band 값이다.

즉 지금까지 상태 동기화는 **폴링이 100% 를 혼자 하고 있었을 가능성이 높다.** 확인하려면:
① 콘솔에 웹훅 URL 이 등록돼 있는지 + 이벤트 목록에 발송 계열이 있는지, ② 운영 env 에
시크릿이 채워져 있는지. 둘 다 확인 전에는 웹훅을 설계의 저지연 경로로 신뢰하면 안 된다.

### 우리 코드에 대한 검증 (부수 확인)

- **우리 sandbox 최소 집합이 임베드를 깨뜨리지 않는다** — 실측 없이 정한 값이었는데 그대로 통했다.
  `allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals` + `referrerPolicy="no-referrer"`.
- **`lib/signing/embed-events.ts` 의 추정 상수가 전부 맞았다**: 네임스페이스 `snowsign.embed.` ✓,
  완료 어미 `sent`(실제 `contract_sent`) ✓, 컨테이너 키 `payload` ✓, 계약 id 화이트리스트(UUID) ✓.
- **교차 오리진 postMessage 가 우리 오리진 가드를 통과**해 `attachProviderContract` 까지 이어졌고,
  딜룸이 자동으로 `sent` 로 전진했다.
- **참여자 미러링 정확**: 이메일 매칭으로 `role=buyer` 판정, `participantMismatch=false` 감사 기록.
- 문서화되지 않은 필드 둘: 모든 이벤트에 `source:'snowsign.embed'`, 그리고 레이아웃용
  `{type:'get-iframe-pos'}` 메시지가 온다.
- 세션 수명은 둘이다: `code_expires_at` 5분(iframe 인계 코드)과 payload 의 `expires_at` 약 1시간.

### 실측으로 잡은 결함 3건 (전부 수정됨)

1. **리스 미반납** — 닫기가 리스를 안 풀어 방금 닫은 본인이 잠겼다.
2. **리스 형태** — 30분 고정이라 탭 닫기·크래시가 그만큼 유령으로 남았다 → 5분 + 하트비트.
3. **`external_id` 고정** — 스노우싸인이 `external_system + external_id` 로 임베드 세션을
   중복 방지해서(409 `EMBED_SESSION_ALREADY_ACTIVE`) 재오픈이 막혔다 → 세션마다 nonce.
   `reference_id` 를 유니크하게 줘도 소용없음을 실측으로 확인했다.

## Q3=아니오 가 뜻하는 것 (중요)

`external_id` 가 회신되지 않으므로 **두 가지가 성립하지 않는다.**

1. **`attachProviderContract` 의 external_id 소유 검증은 현재 무력이다.** 코드는 남아 있지만
   (`if (detail.externalId && !matchesEmbedExternalId(...))`) `detail.externalId` 가 항상
   undefined 라 분기가 실행되지 않는다. 공급자가 나중에 필드를 추가하면 저절로 살아나므로
   지우지 않되, **지금 소유가 검증되고 있다고 착각하면 안 된다.** 실제 게이트는 ACL(낙찰 PG)과
   `provider_ref` 바인딩 유일성 둘뿐이다. 남는 위험: 단일 org 라 다른 계약의 UUID 를 아는 PG 가
   그것을 자기 딜에 붙일 수 있다(계약 id 는 비열거·불투명하고 PG 화면에 노출되지 않아 도달성은
   낮다). TODOS.md Signing 절에 P2 로 등재.
2. **고아 복구를 `external_id` 로는 만들 수 없다.** 그 필드로 우리 딜을 식별할 수 없다.
   ~~남은 수단은 계약 id 를 사람이 넣는 복구 입력뿐이다.~~ — **이 결론은 틀렸다(v0.4.37.0 에서 정정).**
   `external_id` 가 유일한 상관키라고 전제한 탓이다. 실제로는 다른 키가 있다:
   `GET /v1/contracts/{id}` 가 **`participants` 를 이메일까지 돌려주고**(위 확인된 키 목록 참조),
   우리는 구매사 서명 담당자 이메일을 알고 있다 — 임베드 패널이 PG 에게 그대로 받아적으라고
   띄우는 값이고, `participantMismatch` 가 이미 같은 대조를 한다. `GET /v1/contracts`(목록,
   `status` 필터·`created_at` 반환)로 후보를 좁힌 뒤 상세를 확인하면 자동 매칭이 성립한다.
   구현은 별도 PR 로 분리했다 — 설계와 지켜야 할 제약은 TODOS.md Signing 절 참조.

---

## 템플릿 경로 실측 (2026-08-03, 실 API 키 · 프로덕션 org)

계약서 템플릿 재도입(PR#470)이 처음 쓰는 네 엔드포인트 — `POST /v1/uploads`
(`purpose=template_document`), `POST /v1/templates`, `POST /v1/templates/{id}/create-contract`,
`POST /v1/contracts/{id}/send` — 는 그때까지 **실 API 로 한 번도 호출된 적이 없었다.**
위 임베드 실측(2026-08-01)은 이 경로를 전혀 건드리지 않는다.

측정 방법: `pnpm tsx scripts/signing/snowsign-smoke.ts --template` + 브라우저에서 PDF 선택.
T2 는 **브라우저 컨텍스트에서** 재도록 설계돼 있다 — CORS 는 서버측 fetch 로 잴 수 없다.

| # | 질문 | 결과 |
|---|---|---|
| T1 | `/v1/uploads` 가 주는 `fields` 의 형태 | **S3 presigned POST** — `[Content-Type, key, x-amz-algorithm, x-amz-credential, x-amz-date, x-amz-security-token, policy, x-amz-signature]` |
| T2 | 업로드 HTTP 메서드 (presigned POST vs raw PUT) | ⛔ **raw PUT = HTTP 403** / ✅ **presigned POST(form) = HTTP 204** |
| T3 | 바이트가 실제로 착지하는가 | ✅ `page_count: 1`, `upload_policy: allow`, `mediabox [0,0,612,792]` |
| T4 | 우리 프로덕션 payload 로 템플릿이 생성되는가 | ✅ **HTTP 201**. `signers` 를 **문자열 배열**로 줘도 통과(`['구매사','PG사']`), `signature_fields` 스키마 그대로 수용 |
| T5 | 서명칸 좌표가 그대로 왕복하는가 | ✅ **정확히 일치 — 정규화 없음.** 보낸 `(72,72)`·`(72,160)` w180 h48 이 그대로 회신 |
| T7 | create-contract → send | ✅ 생성 201, 발송 성공 `status=pending`, `sent_at` 회신 |
| T9 | 계약 `expires_at` 기본값 | `null` (기본 만료 없음) |
| T6 | 좌표 원점이 top-left 인가 | ✅ **좌상단 확정 — y-플립 불필요.** 콘솔 템플릿 미리보기에서 `(72,72)` 칸이 페이지 **상단**, `(72,160)` 칸이 그 **아래**. 좌하단 원점이면 순서가 뒤집혔어야 한다. 화면 실측도 일치(612pt→711px, 배율 1.16; 두 칸 간격 103px÷1.16=88pt=160−72 ✓, 첫 칸 상단 오프셋 72pt ✓) |
| T10 | 웹훅 콘솔 등록 여부 | ✅ **등록·활성·수신 확인** — 아래 절 참조 |

### T2 가 프로덕션 결함을 잡았다

`ContractTemplateEditor` 는 R2 첨부(`lib/attachments/upload-client.ts`)의 presigned **PUT**
패턴을 그대로 가져와 `session.fields` 를 버리고 raw PUT 을 쐈다. 주석까지 "PUT은 폼 필드가
필요 없다"고 단언해 두었는데 그 가정이 틀렸다 — **PG 는 계약서 템플릿을 한 건도 등록할 수
없었다.** 유닛 테스트가 전송 방식을 고정하지 않아(`fetch` 가 resolve 하는지만 확인) 통과했다.

수정: `fields` 를 전부 FormData 에 넣고 `file` 을 **마지막에** 붙여 POST 한다(S3 는 `file`
뒤의 필드를 무시한다). `Content-Type` 은 `fields` 안에 있으므로 **요청 헤더로 넣지 않는다** —
헤더로 박으면 브라우저가 multipart boundary 를 못 붙여 본문이 깨진다.

### 알아 둘 응답 형태

- **`role` ↔ `role_name` 비대칭**: 생성 요청은 서명칸 역할을 `role` 로 보내는데
  `GET /v1/templates/{id}` 는 **`role_name`** 으로 돌려준다. 모르고 `role` 로만 대조하면
  멀쩡한 좌표 왕복이 전부 "유실"로 읽힌다(하네스가 첫 실행에서 실제로 그랬다).
- GET 응답이 덧붙이는 필드: `uuid`, `display_order`, `is_required`(signature 는 항상 true),
  `label`, `date_precision`, `date_format_pattern`, `fill_background`, `text_align`(해당 없으면 null).
- `signers` 응답은 `uuid`·`role_name`·`signing_order`·`security_method`·`locale` 형태로 확장된다.
- `GET /v1/templates/{id}/download` 는 HTTP 200 에 `content-type: application/json` 이다
  (PDF 바이트도 리다이렉트도 아니다 — `download_url` 봉투를 파싱해 그 URL 을 따라가야
  바이트가 나온다). ~~우리 클라이언트는 이 엔드포인트를 쓰지 않는다 — 비이슈.~~
  **v0.4.43.0 부터 쓴다**: 템플릿 수정 진입이 `SnowSignClient.templateDownloadUrl()` 로
  봉투를 받고, 스트리밍 프록시(`/api/signing/templates/{id}/document`)가 서버에서
  `download_url` 을 fetch 해 원본 PDF 를 에디터에 중계한다. `GET /v1/templates/{id}` 도
  같은 흐름(`getTemplate()` — 서명칸 좌표 되읽기)에서 함께 소비된다.

### T10 — 웹훅은 **실제로 동작하고 있었다** (2026-08-04 콘솔 확인)

위 임베드 실측 절의 "웹훅은 검증되지 않았다"는 서술은 **틀렸다.** 콘솔
(조직 관리 → 웹훅)에 이렇게 등록돼 있다:

- `prod-support-b` · **활성** · `https://partner.support-b.com/api/signing/webhook`
- 구독 이벤트 7종: 계약서 열람됨 · 참여자 서명 완료 · 계약 만료됨 · 계약 취소됨 ·
  참여자 서명 거절 · 모든 서명 완료 · **계약서 발송됨**(발송 계열이 있다 — 고아 복구
  트리거로 쓸 수 있다는 뜻)

그리고 전송 로그가 **운영 서버가 200 으로 받고 있음**을 보여준다:

| 시각 | 이벤트 | 응답 |
|---|---|---|
| 2026-08-04 02:16 | 계약 취소됨 | **200** (39ms) |
| 2026-08-04 02:15 | 계약서 발송됨 | **200** (122ms) |
| 2026-08-02 01:04 | 계약서 발송됨 | **200** (91ms) |

앞의 두 건이 **이 실측이 만든 계약**이다(02:15 발송 / 02:16 취소). 우리 라우트는
시크릿 미설정 시 fail-closed 401 이므로, **200 은 운영 env 에
`SNOWSIGN_WEBHOOK_SECRET` 이 채워져 있고 HMAC 검증이 통과한다는 직접 증거다.**
"폴링이 100% 를 혼자 하고 있었다"는 추정은 성립하지 않는다.

남는 한 가지 한계: 200 은 우리가 **받아서 ack 했다**는 뜻이지, 그 뒤 `after()` 로
도는 재조회가 성공했다는 뜻은 아니다(핸들러가 비블로킹으로 응답한다). 인증·도달은
확인됐고 그 뒤 구간은 폴링 백스톱과 같은 경로다.

콘솔이 보여주는 payload 예시도 우리 핸들러의 가정과 맞는다:
`{ "event": "contract.completed", "timestamp": …, "data": { "contract_id": …, … } }`
— 이벤트명은 점 표기이고 `data.contract_id` 를 뽑아 쓰는 우리 방식 그대로다.

## 본인인증 강제 경로 실측 (2026-08-07, 실 API 키 · 프로덕션 org · 초안까지만)

측정 방법: `pnpm tsx scripts/signing/snowsign-smoke.ts --contract --pdf <파일>`.
발송은 하지 않았다(`--send` 미사용 — 메일·차감 없음). 참여자 페이로드는 프로덕션과
같은 판정 함수(`lib/signing/security-method.ts` 의 `resolveSecurityMethod`)로 만들었다.

| # | 질문 | 결과 |
|---|---|---|
| S0 | `/v1/uploads` `purpose='contract_document'` 가 동작하는가 | ✅ HTTP 201. `fields` 키는 template_document 와 동일(`Content-Type, key, x-amz-*, policy`). post-form 업로드 HTTP 204 |
| S1 | `POST /v1/contracts` 가 `security:{method:'identity_verification'}` + `phone` 을 받는가 | ✅ **HTTP 201, `status:'draft'`.** 이 설계 전체의 전제가 성립한다 |
| S3 | phone 포맷 | ✅ **하이픈 포맷(`010-1234-5678`) 수락** — 재조회 시 **그대로 에코**된다. `users.phone` 은 숫자만 저장이므로 전송 시 하이픈을 붙인다(`formatPhoneInput`) |
| S4 | `GET /v1/contracts/{id}` 가 `security_method` 를 회신하는가 | ✅ **회신한다.** 값은 **`identity_verification`** — 템플릿 `signers[].security_method` 의 `easy_cert` 와 **다른 어휘다**. `contract-signing.ts` 의 기존 reconcile 매핑(`identity_verification → easy_cert`)이 이미 이 값을 옳게 다룬다 |
| S4 | `phone` 도 회신하는가 | ✅ 회신한다 — 참여자 미러링에 그대로 쓸 수 있다 |
| S4 | `integration.external_id` 가 되돌아오는가 | ❌ **아니다** (임베드 경로 Q3 와 동일). 응답에 `integration`·`external_id` 키가 없다 → **소유 검증·중복 탐지에 쓸 수 없다.** 보내는 것 자체는 무해하지만 왕복으로 확인할 수 없다 |
| S6 | `deadline_days` (서명 마감) | ❌ **조용히 무시된다** (2026-08-07 발송 실측). 요청에 `deadline_days:30` 을 실으면 **201 로 수락**하지만 `expires_at` 은 초안에서도 발송 후에도 **`null`** 이다. **수락 ≠ 적용** — 모르는 필드를 버리는 전형이다. 이 경로에는 서명 마감을 심을 수단이 없다 |
| S2 | 서명 페이지가 **실제로** 휴대폰 인증을 요구하는가 | ✅ **요구한다** (2026-08-07, 실 발송 계약 `03934b5b…` 의 서명 화면을 사람이 열어 확인). 발송은 `status:pending` + 양측 `email_delivery:'delivered'` 로 도달했다. **범위 주의**: 확인된 것은 *인증이 요구된다*는 사실이고, **실명·번호로 인증을 통과해 서명을 완주한 것은 아니다** — 취소 시점에 양측 참여자가 `status:'pending'`·`signed_at:null` 이었다. 통신사 대조 통과 여부는 여전히 미측정 |
| S5 | `POST /v1/templates` 가 `signers[].security_method` 를 받는가 | ✅ **받는다** — `signers:[{role,security_method:'easy_cert'}]` 로 생성하고 `GET` 하면 두 역할 모두 `security_method:'easy_cert'` 로 되읽힌다. **문서 요청 스펙에 없는 필드인데 실제로 동작한다**(웹훅과 같은 패턴 — 문서에 없다고 기능이 없는 게 아니다). 이 결과가 설계를 바꿨다 — 아래 절 |

### 부수로 알게 된 것

- **`signature_fields` 의 참여자 키가 경로마다 다르다** — 템플릿 생성은 `role`,
  계약 생성은 **`participant`**. 이 실행은 `participant` 로 보내 201 을 받았다.
  다만 **계약 상세 응답에 `signature_fields` 가 없어** 칸이 올바른 참여자에게
  묶였는지는 **양성 확인이 안 된다**(생성 성공과 모순되지 않는다는 것까지만).
  실제 배치 검증은 서명 페이지를 봐야 한다 → S2 와 함께 측정.
- 우리가 안 보낸 값의 기본값: `signing_order='parallel'`, `locale='ko'`,
  `mobile_alimtalk_enabled=false`. 2자 계약에서 parallel 은 양측 동시 서명이라
  현행 UX 와 맞는다(순서 강제가 필요하면 명시해야 한다).
  **⚠️ `signing_order` 는 더 이상 "안 보내는 값"이 아니다** — v0.4.51.0 의
  `createContract`(자체 발송 경로, **아직 호출자 0**)가 `parallel` 을 명시 전송한다.
  이 줄은 그 이전(2026-08-07) 관측이고, 수락 + **적용** 판별은 아래 C7 이 한다.
  `locale`·`mobile_alimtalk_enabled` 는 여전히 안 보낸다.
- **초안도 취소된다** — `POST /v1/contracts/{id}/cancel` 이 draft 에 HTTP 200.
  `INVALID_CONTRACT_STATUS` 가 아니다. 2단계 발송(초안 → 영속 → send)에서 중간
  실패한 초안을 정리할 수단이 있다는 뜻이다.
- 업로드 진단이 폰트·페이지 박스까지 돌려준다(`upload_policy:'allow'`,
  `render_profile:'fontFace'`) — 발송 전 PDF 경고를 사용자에게 보여줄 재료가 된다.
- `security_method` 는 **발송 후에도 그대로 유지**된다(초안·발송 두 시점 모두
  `identity_verification`) — 발송 과정에서 조용히 강등되지는 않는다.
- `email_delivery` 는 초안에서 `null` 이고 발송 후 `'delivered'` 가 된다.

### 자체 발송 경로 실측 — 참여자별 강등 (C6, 2026-08-08)

건별 발송을 임베드에서 자체 경로(`POST /v1/contracts`)로 옮기려면 **한쪽만
`security` 를 실은 혼합 참여자 목록**이 성립해야 한다. 위 S1·S3·S4 는 전부 **양쪽 다
강제된** 경우만 쟀다 — 하네스가 실번호 없이는 `--send` 를 거부하므로 그 모양만
측정돼 왔다. `--degrade`(PG 에게 번호를 주지 않는다)로 초안까지만 돌려 확인했다.
**발송하지 않았으므로 메일 0통·차감 0이다.**

| # | 질문 | 결과 |
|---|---|---|
| C6a | 혼합 목록을 공급자가 받는가 | ✅ **받는다.** `status:'draft'` 로 생성됨. 참여자별 강등이 성립한다 |
| C6b | `security` 를 **안 실은** 참여자에게 `GET` 이 무엇을 회신하는가 | ✅ **`security_method: null`** (키는 있고 값이 없다). `phone` 도 `null` |
| 부수 | 조직 기본 인증수단 강제가 걸려 있는가 | ❌ **없다.** 걸려 있었다면 C6b 가 `identity_verification` 으로 나왔을 것이다 |
| 부수 | 2쪽 필드(`page_number:2`)를 받는가 | ✅ 3필드(1쪽 2개 + 2쪽 1개) 페이로드로 201 |
| 부수 | 초안 취소 | ✅ HTTP 200 — 2단계 발송의 중간 실패 정리 수단이 실재한다 |

**이것이 왜 결정적인가**: `null` 이므로 `bindDispatchedContract` 의 기존 매핑
(`p.securityMethod === PROVIDER_ENFORCED_SECURITY_METHOD ? 'easy_cert' : 'email'`)이
**손대지 않고** 이 값을 `'email'` 로 접는다. 매핑 방향이 fail-safe 라 —
`identity_verification` 이 아닌 모든 값이 약한 쪽으로 접힌다 — 공급자가 나중에 이
필드를 바꿔도 **본인인증을 거짓 주장하는 것은 구조적으로 불가능하다**.

### 자체 발송 경로 실측 — 서명칸 배치·참여자 귀속 (C1~C4, 2026-08-08)

같은 초안(`2c13dca0`)을 **콘솔 계약 상세**(`/dashboard` → 계약서 → 해당 행)에서
직접 봤다. **발송 0건** — 콘솔의 `문서 미리보기`·`참여자` 탭만으로 판정된다.
(콘솔 경로는 `snowsign.jtsnowball.com/dashboard` 다. 마케팅 페이지의 `대시보드`
버튼은 프로그래매틱 클릭에 반응하지 않고 `app.snowsign…` 은 에러 페이지다.)

보낸 페이로드: 1쪽 `구매사 signature (72,72)` + 1쪽 `PG사 signature (72,160)` +
2쪽 `구매사 name (300,400)`.

| # | 질문 | 결과 |
|---|---|---|
| C1 | `participant` 키가 역할에 실제로 바인딩되는가 | ✅ **바인딩된다.** 미리보기가 칸마다 소유자를 라벨링한다 — `실측구매사의 서명란`(파란 점선) / `실측PG의 서명란`(초록 점선). 섞이지 않았다. **계약 상세 API 에 `signature_fields` 가 없어 이 확인은 화면만이 낼 수 있다.** ⚠️ **측정 방법이 계획과 다르다** — 원 기준은 *세션별* 가시성(구매사 화면에 PG 칸이 안 보이는가)이었고 그건 실발송이 필요하다. 여기서 확인된 것은 **소유자 귀속**이고, *세션별 격리*는 관측되지 않았다. 게이트(플랜 B 분기)는 귀속만으로 판정되므로 해소됐지만, 격리는 잔여다 |
| C2 | 좌표 원점 | ✅ **좌상단 — T6(템플릿)과 동일.** `(72,72)` 칸이 `(72,160)` 칸보다 **위**에 있다. 좌하단이면 순서가 뒤집혔어야 한다. y-플립 불필요 |
| C3 | `page_number` 1-based | ✅ **맞다.** 2쪽 지정 `name` 칸이 페이지 인디케이터 `2 / 2` 페이지에, `PAGE 2 - name probe` 텍스트 아래에 있다. 1쪽에는 서명칸 2개만 있다(off-by-one 없음) |
| C4 | 강등 참여자가 이메일 인증으로 가는가 | ✅ **공급자가 자기 UI 에서 그렇게 선언한다.** `참여자` 탭: `실측구매사` 연락처 `010-1234-5678` → **`🔒 휴대폰 간편인증`**, `실측PG` 연락처 `없음` → **`이메일 본인인증`**. 참여자별로 갈린 정책이 화면에 그대로 뜬다 |
| 부수 | 역할 라벨·서명 순서 | `구매사`/`PG사`(= `SIGNING_ROLE_LABELS`)와 `동시 서명`(parallel)이 그대로 표시된다 |
| 부수 | `만료일` | **`없음`** — S6(`deadline_days` 무시) 재확인 |
| **C7** | 우리가 **실어 보낸** `signing_order` 가 적용되는가 | ✅ **적용된다** (2026-08-08, 초안 2건, 발송 0). 프로덕션이 보내는 유일한 미측정 키였다 — 기본값이 parallel 임은 관측됐지만 **키를 보낸 적은 없었다** |

**C7 의 판별 방법이 결론보다 중요하다.** `parallel` 을 보내고 `parallel` 이 회신되는 것은
**근거가 아니다** — 기본값이 이미 parallel 이라 "적용됨"과 "무시됐는데 기본값이 같다"가
구별되지 않는다. `deadline_days` 가 정확히 그렇게 속였다(201 수락, `expires_at` 은 null).
그래서 판별은 **기본값 아닌 값**으로 한다: `--signing-order sequential` 로 보냈고 상세가
`sequential` 을 회신했다 → 이 필드는 수락 **+ 적용**이다. 프로덕션은 계속 `parallel` 을 보낸다.
`docs/SNOWSIGN_API.md` 가 이 엔드포인트의 request-body **표**에서 이 키를 빼고 **예시**에만
넣어 둔 탓에 미문서 필드로 오독하기 쉬운 자리다.

**C4 의 잔여**: 확인된 것은 공급자가 선언한 **정책**이고, 강등 쪽 서명 **화면**을
실제로 열어 본 것은 아니다(실발송이 필요하다). 다만 S2 가 `identity_verification`
쪽 화면이 휴대폰 인증을 요구함을 이미 확인했고 공급자가 다른 쪽을 다르게 라벨링하므로
근거는 충분하다. 그리고 **위험 방향이 안전하다** — 강등 쪽이 되레 인증을 요구하면
우리 표시(`'email'`)가 **과소**주장이 된다. 과대주장은 불가능하다.

**근거의 형태 — 스크린샷이 아니라 산문 전사다.** C1~C3 은 콘솔 UI 를 사람이 읽은 것이고,
이 문서에 남은 것은 그 **전사**다(점선 색으로 갈린 소유자 라벨, `2 / 2` 페이지 인디케이터,
`PAGE 2 - name probe` 텍스트, 칸의 상하 순서). 캡처 이미지는 레포에 커밋하지 않았다 —
계약 제목·참여자 이메일이 함께 찍히고, 재현 절차가 위에 적혀 있어 다시 볼 수 있기 때문이다.
따라서 이 세 줄은 **재현 가능한 관찰 기록**이지 이미지 증거가 아니다.

**결론: 자체 발송 경로의 전제가 전부 성립한다.** 좌표계·페이지·참여자 귀속·참여자별
인증수단·`signing_order` 다섯 축 모두 우리 에디터가 이미 내는 형식(`getViewport({scale:1})`
픽셀, 좌상단 원점, 1-based 페이지)과 일치한다. 플랜 B(딜별 일회용 템플릿)로 갈 이유가 없다.

### ⚠️ 서명 마감(`deadline_days`)은 **어느 경로에서도 확인된 적이 없다**

S6 이 드러낸 것은 이 경로의 문제만이 아니다. 위 T9 는 "계약 `expires_at` 기본값 =
`null`" 인데, 그때 하네스는 `deadline_days` 를 **보내지 않았다**(v0.4.42.0 이
`createTemplate` 에 `deadline_days:30` 을 넣은 것은 그 뒤다). 즉 **템플릿 경로에서
`deadline_days` 가 실제로 `expires_at` 을 만드는지도 측정된 적이 없다** — 진행 카드의
서명 마감 표시는 확인 없이 출하됐다. `POST /v1/contracts` 에서는 확실히 무시된다.
템플릿 경로 재측정(`--template` + deadline_days 확인)이 필요하다.

### 이 실행들이 남긴 것

- 계약 `85ee1bd2-d668-4e7f-9bae-6fb58f52cf7c`(초안) — 취소 완료(HTTP 200).
- 계약 `03934b5b-6a02-4374-bda5-b0f000466193`(실제 발송) — S2 확인 후 취소 완료(HTTP 200).
- S5·프로브 실행이 남긴 초안 4건(`f5e754d0`·`760ea5ec`·`ba67808a` + 실패 1건) — 모두 취소 완료.
- **템플릿 `d6ef2ed3-737d-4686-a876-48b00dbfbccb`**(signers 둘 다 `easy_cert`) — 삭제 API 가
  없어 조직에 남는다(무해). 템플릿 경로를 재측정할 때 이걸 재사용하면 슬롯을 아낀다.
- 업로드 세션 5개(10분 TTL 자연 소멸).
- **C6 실행(2026-08-08)**: 계약 `81057a54-43f3-4a75-8cfd-8b8a6e4779ba`(초안) — 취소 완료(HTTP 200).
  계약 `2c13dca0-37f9-4632-b97a-4a39c396532f`(초안) — C1~C4 를 콘솔에서 확인한 뒤
  취소 완료(HTTP 200). 업로드 세션 2개(자연 소멸). **발송 0건 · 메일 0통 · 차감 0.**
- **C7 실행(2026-08-08)**: 계약 `aff242b7`(`parallel` — 판별력 없음 확인) ·
  `6339dc53`(`sequential` — 판별 성립) 둘 다 초안, 취소 완료(HTTP 200).
  업로드 세션 2개. **발송 0건 · 메일 0통 · 차감 0.**

### 템플릿 역할 정책도 본인인증을 강제할 수 있다 — 단 계약별 강등은 불가

S5 가 통과했으므로 경로가 둘이다. 그 차이를 프로브로 확정했다(2026-08-07,
`easy_cert` 로 만든 실측 템플릿 `d6ef2ed3-737d-4686-a876-48b00dbfbccb` 사용):

| 프로브 | 결과 |
|---|---|
| `easy_cert` 템플릿 + participants 에 **phone 없음** | ❌ **HTTP 400 `VALIDATION_ERROR`** — "간편인증 휴대폰 번호는 **010으로 시작하는** 국내 휴대폰 번호여야 합니다" |
| `easy_cert` 템플릿 + phone 있음 | ✅ 201. 계약 참여자는 `security_method:'identity_verification'` 으로 회신 |

두 가지가 확정된다.

1. **어휘 매핑은 양방향으로 확인됐다** — 템플릿 역할은 `easy_cert`, 그 템플릿으로
   만든 계약의 참여자는 `identity_verification`. 같은 정책의 두 표기다.
2. **템플릿 역할 정책은 템플릿 단위라 계약별 강등이 불가능하다.** 역할이
   `easy_cert` 면 phone 은 **필수**이고, 없으면 공급자가 fail-closed 400 을 낸다.
   `POST /v1/contracts` 의 참여자별 `security` 만이 계약별 강등을 허용한다.
3. **번호는 `010` 만이다.** 우리 `isCompletePhone` 은 `01[0-9]`(구 번호대)를
   허용하므로 그 판정을 그대로 쓰면 강등이 아니라 발송 400 이 된다 —
   `lib/signing/security-method.ts` 가 `010` 으로 좁혀 강등시킨다.

**미해결(템플릿 경로를 고를 경우)**: 기존 `pg_signing_templates` 행이 가리키는
템플릿은 전부 기본(email) 정책으로 만들어졌다. `security_method` 는 신규 생성에만
붙으므로 **기존 템플릿은 조용히 이메일 인증으로 남는다** — 재생성 마이그레이션이
필요하다(수정 플로가 재생성이므로 PG 가 손대면 갱신되지만, 안 건드린 템플릿은 그대로).

### 결론 — 기본강제가 성립한다

`POST /v1/contracts` 는 참여자별 `security:{method:'identity_verification'}` + `phone` 을
수락하고(S1), 되읽을 때 유지하며(S4), **서명 화면에서 실제로 본인인증을 요구한다**(S2).
따라서 휴대폰 간편인증 기본강제는 이 경로에서 구현 가능하다. 남은 미지수는 둘뿐이다 —
**과금 구조**(API 로 알 수 없음, 스노우볼과의 상업 조건)와 **서명 마감**(아래 절).

### 운영 제약 (재측정 전에 읽을 것)

- **업로드 세션은 조직(API 키) 공유 동시 3개 한도**, TTL 10분, 해제 API 없음.
  `--template` 한 번이 2개, `--contract` 한 번이 1개(`--s5` 는 +1)를 점유한다.
  실키 재측정은 PG 들이 실제 업로드를 하지 않는 한산한 시간대에, 실패 후 재시도는
  TTL 이 풀리는 ~10분 뒤에.
- **템플릿 삭제 API 가 없다.** T4 가 만든 템플릿은 조직에 남는다(무해).
  이 실행이 남긴 것: `8108b8a7-0e29-4499-9298-974ca2eedae1`.
- 발송된 실측 계약 `938eb0c2-7f4b-46b3-be22-eee45058213e` 는 확인 후 취소했다(HTTP 200).

## 읽기측 `signers[].role_name` 실측 — **존재 확정** (2026-08-14, 실 API 키 · 프로덕션 org)

TODOS "getTemplate 이 미검증 공급자 필드를 하드 요구한다"(v0.4.55.0 해결) 항목이 남긴
숙제 — S5 스모크가 `${s.role_name ?? '?'}` 로 찍어 존재가 입증되지 않았던 그 필드를,
킬 스위치 재활성화(v0.4.56.0) 브라우저 QA 에서 직접 재확인했다.

**측정 방법**: 재활성화된 `/contract-templates` 에디터로 템플릿 1건을 실제
생성(`QA 재활성화 검증용 v1`, provider id `38f12765-8c5f-4445-b3d8-20202a44d2e2`)한 뒤
`GET /v1/templates/{id}` 를 curl 로 직접 호출해 **원시 JSON** 을 확인.

**결과**:

- `signers[].role_name` 은 **회신된다** — `"구매사"` · `"PG사"`, 우리가 쓴 라벨 그대로
  (NFC, 공백 변형 없음). 쓰기 `role` ↔ 읽기 `role_name` 비대칭은 사실이지만 읽기 키
  자체는 실존한다. → v0.4.55.0 의 관대 파싱(H1)은 **살아있는 우회가 아니라
  심층방어**다(미래 키 드리프트 대비 + `signersSkipped` 진단).
- 부수 확인 ①: 두 역할 모두 `security_method: "easy_cert"` — v0.4.46.0 본인인증
  기본강제가 신규 생성 경로에서 그대로 성립.
- 부수 확인 ②: `deadline_days: 30` 회신 — 템플릿 생성 시 보낸 값이 저장돼 있다.
- 부수 확인 ③: 한글 라벨이 정확일치로 왕복한다 — TODOS P3 "정책 게이트의 유일한
  키가 한글 문자열 정확일치"의 전제(공급자 정규화)는 현재 관측되지 않음(항목은
  방어적 정규화 제안으로 유지).

이 실행이 남긴 것: 템플릿 `38f12765-8c5f-4445-b3d8-20202a44d2e2`(조직에 잔존, 무해 —
삭제 API 없음. QA 후 앱 목록에서는 삭제해 링크 행만 제거).

## 조항형(compose) 발송 실측 (2026-08-25, 실 API 키 · 프로덕션 org · **실제 발송 1건**)

계약서 QA 중 딜룸에서 `연결된 템플릿으로 보내기` 로 조항형 계약을 **끝까지 발송**했다
(우리가 렌더한 PDF → 업로드 → `POST /v1/contracts` → `sendContract`). 정리는 앱의
`취소` 로 했고 공급자도 `cancelled` 로 반영했다.

### C1 — 공급자가 우리 PDF 를 받는다

- 계약이 `pending` 에 도달했다. 즉 **pdf-lib + fontkit 으로 우리가 만든 바이트를
  스노우싸인이 그대로 수용한다** — TODOS 의 "공급자 수용 미검증" 위험은 해소.
- 참여자 둘 다 `identity_verification` — v0.4.46.0 본인인증 강제가 **compose 경로에서도**
  공급자 측에서 실제로 성립한다(템플릿 경로 실측의 연장).
- 아직 미검증: `/v1/uploads/{id}/diagnostics` 의 `page_count`·`warnings`, 그리고
  **서명칸이 좌표대로 앉았는지**(서명 화면을 열지 않았다). 레이아웃 엔진 좌표 ↔ 공급자
  렌더의 일치는 여전히 남은 검증이며, 셋 중 제일 중요하다.

### C2 — ⚠️ 타임스탬프에 **타임존이 없다** (이번에 드러난 결함의 원인)

`GET /v1/contracts/{id}` 가 돌려주는 시각 필드는 **오프셋 없는 naive ISO** 다:

```
"created_at":   "2026-08-24T16:50:15.571055",
"sent_at":      "2026-08-24T16:50:15.987890",
"cancelled_at": "2026-08-24T17:29:39.914508",
"expires_at":   null
```

값 자체는 **UTC 벽시계**다(위 `sent_at` 은 KST 08-25 01:50 에 누른 발송이다). 그런데
`Z` 가 없으면 ECMAScript 는 date-time 형식을 **로컬 시각**으로 파싱하므로, 프로세스가
UTC 가 아니면 그대로 흘린 문자열이 TZ 만큼 어긋난 순간이 된다 — KST 에서 9시간 과거로,
음수 오프셋 지역에서는 미래로. 실제로 `sent_at` 이 `07:50Z` 로 저장돼 방금 보낸 계약이
"보낸 지 1일째" 로 표시됐고, 발송 노드가 선정 노드보다 **앞선 시각**을 찍었다.

→ 경계에서 확정한다: `asIsoDate`(`lib/server/signing/snowsign-client.ts`)가 오프셋이
없으면 `Z` 를 붙인다(커밋 `fc3a2233`). 오프셋이 이미 있으면 손대지 않는다.
**`expires_at: null`** 은 S6(조항형은 `deadline_days` 가 무시된다)의 재확인이다.

이 실행이 남긴 것: 계약 `9e08cd4e-84b1-4cce-b71e-30bd170f7546`(취소됨). 발송 시 구매사·PG
양측 실주소로 서명 요청 메일이 나갔고, 취소 시 취소 안내가 나갔다.
