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
| S2 | 서명 페이지가 **실제로** 휴대폰 인증을 요구하는가 | ⏳ **발송까지 완료, 사람 확인 대기.** 계약 `03934b5b-6a02-4374-bda5-b0f000466193` 를 실제 발송(`status:pending`, 양측 `email_delivery:'delivered'`)했다. 서명 화면에서 본인인증이 요구되는지는 사람이 열어봐야 한다 — 필드 수락 ≠ 강제 적용이므로 이 항목 확정 전에는 "강제됨"이라고 말할 수 없다 |
| S5 | `POST /v1/templates` 가 `signers[].security_method` 를 받는가 | ⏳ 미측정(`--s5`). 받아도 채택하지 않는다 — 단일 파이프라인이 콘솔 조작·역할 정책 의존에 면역이라 더 강하다 |

### 부수로 알게 된 것

- **`signature_fields` 의 참여자 키가 경로마다 다르다** — 템플릿 생성은 `role`,
  계약 생성은 **`participant`**. 이 실행은 `participant` 로 보내 201 을 받았다.
  다만 **계약 상세 응답에 `signature_fields` 가 없어** 칸이 올바른 참여자에게
  묶였는지는 **양성 확인이 안 된다**(생성 성공과 모순되지 않는다는 것까지만).
  실제 배치 검증은 서명 페이지를 봐야 한다 → S2 와 함께 측정.
- 우리가 안 보낸 값의 기본값: `signing_order='parallel'`, `locale='ko'`,
  `mobile_alimtalk_enabled=false`. 2자 계약에서 parallel 은 양측 동시 서명이라
  현행 UX 와 맞는다(순서 강제가 필요하면 명시해야 한다).
- **초안도 취소된다** — `POST /v1/contracts/{id}/cancel` 이 draft 에 HTTP 200.
  `INVALID_CONTRACT_STATUS` 가 아니다. 2단계 발송(초안 → 영속 → send)에서 중간
  실패한 초안을 정리할 수단이 있다는 뜻이다.
- 업로드 진단이 폰트·페이지 박스까지 돌려준다(`upload_policy:'allow'`,
  `render_profile:'fontFace'`) — 발송 전 PDF 경고를 사용자에게 보여줄 재료가 된다.
- `security_method` 는 **발송 후에도 그대로 유지**된다(초안·발송 두 시점 모두
  `identity_verification`) — 발송 과정에서 조용히 강등되지는 않는다.
- `email_delivery` 는 초안에서 `null` 이고 발송 후 `'delivered'` 가 된다.

### ⚠️ 서명 마감(`deadline_days`)은 **어느 경로에서도 확인된 적이 없다**

S6 이 드러낸 것은 이 경로의 문제만이 아니다. 위 T9 는 "계약 `expires_at` 기본값 =
`null`" 인데, 그때 하네스는 `deadline_days` 를 **보내지 않았다**(v0.4.42.0 이
`createTemplate` 에 `deadline_days:30` 을 넣은 것은 그 뒤다). 즉 **템플릿 경로에서
`deadline_days` 가 실제로 `expires_at` 을 만드는지도 측정된 적이 없다** — 진행 카드의
서명 마감 표시는 확인 없이 출하됐다. `POST /v1/contracts` 에서는 확실히 무시된다.
템플릿 경로 재측정(`--template` + deadline_days 확인)이 필요하다.

### 이 실행들이 남긴 것

- 계약 `85ee1bd2-d668-4e7f-9bae-6fb58f52cf7c`(초안) — 취소 완료(HTTP 200).
- 계약 `03934b5b-6a02-4374-bda5-b0f000466193`(**실제 발송**) — S2 사람 확인 후 취소할 것.
- 업로드 세션 2개(10분 TTL 자연 소멸).

### 운영 제약 (재측정 전에 읽을 것)

- **업로드 세션은 조직(API 키) 공유 동시 3개 한도**, TTL 10분, 해제 API 없음.
  `--template` 한 번이 2개, `--contract` 한 번이 1개(`--s5` 는 +1)를 점유한다.
  실키 재측정은 PG 들이 실제 업로드를 하지 않는 한산한 시간대에, 실패 후 재시도는
  TTL 이 풀리는 ~10분 뒤에.
- **템플릿 삭제 API 가 없다.** T4 가 만든 템플릿은 조직에 남는다(무해).
  이 실행이 남긴 것: `8108b8a7-0e29-4499-9298-974ca2eedae1`.
- 발송된 실측 계약 `938eb0c2-7f4b-46b3-be22-eee45058213e` 는 확인 후 취소했다(HTTP 200).
