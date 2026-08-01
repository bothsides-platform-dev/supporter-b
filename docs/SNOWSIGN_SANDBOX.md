# 스노우싸인 실 API 실측 기록

딜룸 건별 임베드 발송 설계가 서 있는 가정들을 실 API 키로 확인한 결과를 남긴다.
유닛 테스트는 전부 HTTP mock 이라 이 항목들을 **검증하지 못한다** — 여기가 유일한 근거다.

실행:

```bash
SNOWSIGN_API_KEY=... pnpm signing:smoke
```

브라우저로 `http://localhost:4599` 를 열고 임베드에서 계약서를 한 건 실제로 발송하면
스크립트가 postMessage 를 받아 기록하고 계약 상세를 재조회한다. 하네스는
`scripts/signing/snowsign-smoke.ts`.

> ⚠️ 스크립트 출력에는 실 계약 참여자 이메일 등 라이브 데이터가 섞인다.
> 원본 출력을 그대로 붙여넣지 말고 **판정 결과만** 아래에 옮겨 적을 것.

---

## 판정 (1차 실측 2026-08-01 — Q1·Q2 부분·Q4 확인, Q3 미완)

| # | 질문 | 결과 | 근거 / 메모 |
|---|---|---|---|
| Q1 | `flows: ['pdf_send']` 임베드 세션이 발급되고 iframe 안에서 PDF 업로드 → 서명칸 배치 → 발송이 완주되는가 | 🟩 **가능** (발송 완주만 미검증) | 세션 발급 `HTTP 201`. iframe 이 **5단계 위저드**를 정상 렌더: ① 문서 업로드(PDF, 최대 50MB) → ② 참여자 설정 → ③ 서명란 배치 → ④ 서명란 확인 → ⑤ 최종 확인. **설계가 전제한 흐름 그대로다.** 실제 발송까지는 실 계약 1건 + 실 메일이 나가므로 별도 승인 후 진행. |
| Q2 | 완료 postMessage 의 정확한 이벤트명과 payload 형태 (contract_id 포함 여부) | 🟨 **부분** | 수신한 `ready` 이벤트: `{source:'snowsign.embed', type:'snowsign.embed.ready', payload:{session_id, purpose:'contract_create', flows:['pdf_draft','pdf_send'], expires_at}}`. → **네임스페이스 `snowsign.embed.` 가정 확인**, **컨테이너 키 `payload` 가 실재**(둘 다 `lib/signing/embed-events.ts` 상수와 일치). 미확인: **완료** 이벤트의 정확한 어미와 `contract_id` 위치. 문서화되지 않은 `source` 필드가 있어 향후 `e.source` 대신 이 값으로도 필터할 수 있다. |
| Q3 | 임베드 세션의 `external_id` 가 `GET /v1/contracts/{id}` 응답에 되돌아오는가 | ⬜ **미확인** | 계약이 실제로 만들어져야 판정 가능. 초안(`pdf_draft`) 저장으로도 contract_id 가 생기면 메일 없이 확인할 수 있을 것으로 보인다(세션 flows 에 `pdf_draft` 가 함께 열려 있다). |
| Q4 | `iframe_url` 의 실제 오리진 호스트 | ✅ **`https://snowsign.jtsnowball.com`** | API 호스트(`api-snowsign.jtsnowball.com`)와 **다른 호스트**다 — TODOS 의 "API 호스트와 임베드 호스트가 같은지 미확인" 항목이 이걸로 해소된다. CSP `frame-src` 핀 값이자, 서버측 `iframe_url` 오리진 검증의 allowlist 값. |

**부수 확인**
- `allowed_origins` 에 `http://lvh.me:4599` 를 넣어도 거부되지 않는다(로컬 개발 오리진 사용 가능).
- 세션 수명은 두 가지다: `code_expires_at` 5분(iframe 최초 인계용 코드)과 payload 의 `expires_at` 약 1시간(세션 자체). 30분 리스(`EMBED_SEND_LEASE_MS`)는 이 1시간 안에 들어간다.
- iframe 은 sandbox 없이 렌더했다 — 앱이 거는 `sandbox` 최소 집합이 실제로 통하는지는 발송 완주 때 함께 확인해야 한다.

---

## 각 답이 코드에 미치는 영향

**Q1 실패 시** — 이 설계 전체가 성립하지 않는다. 임베드로 PDF 발송이 안 되면 남는
선택지는 앱 내 좌표 배치 에디터(`POST /v1/uploads` + `POST /v1/templates`)뿐이다.
여기서 멈추고 재설계한다.

**Q2** — `lib/signing/embed-events.ts` 의 `COMPLETION_SUFFIXES`·`CONTAINER_KEYS` 를
실측값으로 좁힌다. 지금은 형태를 모르는 상태의 보수적 추정이라 넓게 잡혀 있다.
이벤트에 contract_id 가 아예 없으면 Q3 자동 복구 경로가 유일한 수단이 된다.

**Q3** — 가장 중요하다. 갈림길:

- **되돌아온다** → `attachProviderContract` 가 `external_id === 'sc:<signingContractId>'`
  로 서버측 소유 검증을 할 수 있다. 고아(postMessage 유실)도 `listContracts` 자동
  매칭으로 조용히 복구되어 사용자 조작이 필요 없다.
- **안 돌아온다** → 소유 검증은 ACL + 바인딩 유일성(`provider_ref` 선점)만으로 한다.
  고아 복구는 자동화할 수 없으므로 리스 만료된 `awaiting_pg_template` 에서만 노출되는
  최소 복구 입력(계약 ID)을 UI 에 남긴다.

**Q4** — CSP `frame-src` 핀 값. `TODOS.md` 의 "iframe_url 오리진 미핀 + frame-src CSP
없음 (P2)" 항목이 "실제 운영 임베드 호스트 값이 필요하다"는 이유로 막혀 있었다 —
이 값이 그 잠금을 푼다. iframe `sandbox` 최소 권한 집합도 이 실행에서 실측한다
(무엇을 조이면 임베드가 깨지는지).
