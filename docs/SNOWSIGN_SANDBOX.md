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

### ⚠️ 웹훅은 이 실측에서 **검증되지 않았다**

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
| T6 | 좌표 원점이 top-left 인가 (시각 확인) | ⏳ **미완** — 아래 참조 |
| T10 | 웹훅 콘솔 등록 여부 | ⏳ **미완** — 위 "웹훅은 검증되지 않았다" 절과 같은 질문 |

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
  (PDF 바이트도 리다이렉트도 아니다). **우리 클라이언트는 이 엔드포인트를 쓰지 않는다** —
  `SnowSignClient` 의 `downloadUrl`/`auditCertificateUrl` 은 둘 다 *계약* 용이다. 비이슈.

### 남은 2건 (사람이 해야 한다)

- **T6 — 좌표 원점.** 발송된 계약의 서명 메일을 열어 서명칸이 1페이지 **상단** 좌측
  (72,72 부근)에 있는지 확인한다. 하단에 찍혀 있으면 원점이 bottom-left(PDF 기본)라는
  뜻이고, 에디터가 보내는 `position_y` 에 **y-플립**이 필요하다. 좌표가 그대로 왕복한다는
  T5 는 "우리가 보낸 값이 보존된다"만 말할 뿐 **원점이 어디인지는 말하지 않는다** — 이
  둘을 섞으면 안 된다.
- **T10 — 웹훅.** 콘솔의 등록 URL·이벤트 목록 + 운영 env 의 `SNOWSIGN_WEBHOOK_SECRET`.

### 운영 제약 (재측정 전에 읽을 것)

- **업로드 세션은 조직(API 키) 공유 동시 3개 한도**, TTL 10분, 해제 API 없음.
  `--template` 한 번이 2개를 점유한다. 실키 재측정은 PG 들이 실제 업로드를 하지 않는
  한산한 시간대에, 실패 후 재시도는 TTL 이 풀리는 ~10분 뒤에.
- **템플릿 삭제 API 가 없다.** T4 가 만든 템플릿은 조직에 남는다(무해).
  이 실행이 남긴 것: `8108b8a7-0e29-4499-9298-974ca2eedae1`.
- 발송된 실측 계약 `938eb0c2-7f4b-46b3-be22-eee45058213e` 는 확인 후 취소했다(HTTP 200).
