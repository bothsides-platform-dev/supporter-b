# 스노우싸인 실 API 실측 기록

딜룸 건별 임베드 발송 설계가 서 있던 가정들을 실 API 키로 확인한 결과. 유닛 테스트는
전부 HTTP mock 이라 이 항목들을 **검증하지 못한다** — 여기가 유일한 근거다.

재측정이 필요하면 두 가지 경로가 있다.

- **통합 경로(권장)**: 로컬 앱을 띄우고 딜룸 계약 탭에서 실제로 발송한다. 우리 sandbox·
  오리진 가드·attach 배선까지 함께 검증된다. 아래 결과는 이 경로로 얻었다.
- **독립 하네스**: `SNOWSIGN_API_KEY=... pnpm signing:smoke` → `http://lvh.me:4599`.
  앱 없이 임베드만 띄워 오는 postMessage 를 원본 그대로 찍는다(`scripts/signing/snowsign-smoke.ts`).
  API 응답 형태만 빠르게 볼 때 쓴다.

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
2. **고아 복구를 `external_id` 자동 매칭으로 만들 수 없다.** `GET /v1/contracts` 로 최근 계약을
   훑어도 어느 것이 우리 딜의 것인지 식별할 방법이 없다. 남은 수단은 계약 id 를 사람이 넣는
   복구 입력뿐이다(또는 스노우싸인에 필드 추가 요청).
