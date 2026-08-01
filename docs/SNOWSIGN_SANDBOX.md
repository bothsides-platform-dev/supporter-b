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

## 판정 (미실행 — 실 키 확보 후 채울 것)

| # | 질문 | 결과 | 근거 / 메모 |
|---|---|---|---|
| Q1 | `flows: ['pdf_send']` 임베드 세션이 발급되고 iframe 안에서 PDF 업로드 → 서명칸 배치 → 발송이 완주되는가 | ⬜ 미확인 | |
| Q2 | 완료 postMessage 의 정확한 이벤트명과 payload 형태 (contract_id 포함 여부) | ⬜ 미확인 | |
| Q3 | 임베드 세션의 `external_id` 가 `GET /v1/contracts/{id}` 응답에 되돌아오는가 | ⬜ 미확인 | |
| Q4 | `iframe_url` 의 실제 오리진 호스트 | ⬜ 미확인 | |

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
