# 계약서 템플릿 재사용 — 설계

날짜: 2026-08-03
관련 이력: v0.4.1.0(최초 도입) → v0.4.37.0(폐지, PR#465) → 본 문서(재도입)

## 배경

`CLAUDE.md`의 "선정 후 전자서명" 절대로, 현재는 재사용 계약서 템플릿이 없다. PG가 선정된 딜룸의
계약 탭에서 스노우싸인 임베드(iframe)를 열어 **건마다** 자사 계약서 PDF를 올리고 서명칸을
배치해 그 자리에서 발송한다.

이전(v0.4.1.0)에는 템플릿 기능이 있었지만 v0.4.37.0에서 폐지됐다. 폐지 커밋 메시지는
"스노우싸인 Public API에 템플릿을 만드는 임베드 flow가 없다"를 이유로 든다. 실제로 옛
`createTemplateEmbedSession`은 `flows:['template_draft']`가 PG의 iframe 안에서 새 템플릿을
만들어줄 거라 가정했는데, 이 가정은 실 API로 검증된 적이 없었다. v0.4.37.0의 실측
(`docs/SNOWSIGN_SANDBOX.md`)은 `flows:['pdf_send']`(건별 계약 생성/발송)만 검증했고, Public API
문서의 Hosted Embed 절을 다시 읽어보면 지원 흐름 4가지(PDF 업로드 계약 생성/발송, 템플릿 단건
계약 생성/발송, 템플릿 대량 발송, AI 문서 계약 생성/발송) 전부가 "계약서를 만드는" 흐름이지
"템플릿을 만드는" 흐름이 아니다. 즉 임베드로 템플릿을 만들 방법은 애초에 없었다.

이 문서는 임베드에 기대지 않고, **우리가 직접 PDF 서명칸 배치 에디터를 만들어**
`POST /v1/templates`를 직접 호출하는 방식으로 템플릿 기능을 재도입한다.

## 목표

- PG가 자사 표준 계약서를 워크스페이스에 여러 개 등록해두고, 견적마다 어떤 것을 쓸지 고를 수
  있다(v0.4.1.0과 동일한 모델).
- award 후에도 PG의 명시적 확인 클릭을 유지한다 — 자동 발송은 하지 않는다(제품 결정, 아래
  "확정 결정" 참조).
- 등록된 템플릿이 없거나 이번만 다른 문서를 보내고 싶은 경우를 위해, 기존 건별 임베드 발송
  경로는 그대로 남긴다(폴백).

## 확정 결정 (질의응답 요약)

| 질문 | 결정 |
|---|---|
| 스노우싸인 콘솔(Public API 밖의 자체 대시보드)에 템플릿 빌더가 있는지 확인하고 그걸 쓸까? | **아니다** — 콘솔 여부와 무관하게 우리가 직접 PDF 필드 배치 에디터를 만든다 |
| 재구축 범위 | **v0.4.1.0과 동일** — 워크스페이스당 템플릿 여러 개 + 견적별 선택(`bids.signing_template_id`) |
| award 시 연결된 템플릿이 있으면 자동 발송할까? | **아니다** — 여전히 PG가 확인 클릭. 옛 설계가 명시적으로 배제한 이유(변수 매핑이 그 딜에 안 맞을 수 있음)를 존중 |
| 에디터 배치 방식 | **완전한 드래그앤드롭**(클릭 배치 대신) — 필드를 자유롭게 드래그·리사이즈 |

## 핵심 통찰 — 우리가 에디터를 소유하면 역할 매핑이 사라진다

옛 모델은 PG가 스노우싸인에서 임의 역할명으로 템플릿을 만들면, 그 역할명을 buyer/pg에 매핑하는
별도 단계(`roleMapping: Record<string, Party>`, `linkTemplate`)가 있었다. 이제 우리가 직접
에디터로 필드를 배치하므로, 필드를 놓는 시점에 "구매사 서명" 또는 "PG사 서명" 둘 중 하나로만
태그하면 된다 — 매핑 단계 자체가 사라진다.

`role` 문자열 값은 내부 코드가 아니라 **참여자에게 노출되는 라벨**일 가능성이 높다 — API 예시가
`"role": "근로자"`처럼 사람이 읽는 한국어를 쓰고 있고, 서명 화면·이메일에 역할명이 그대로
비칠 수 있다. 그래서 `signers`는 항상 `[{role:'구매사'}, {role:'PG사'}]` 고정(내부 판별은
`SigningParticipantRole`('buyer'/'pg')을 우리 쪽 데이터에서 따로 들고 있고, API로 나가는 `role`
문자열만 한글 라벨로 분리).

변수 치환(`variables`)은 이번 범위에서 뺀다 — 계약금액 등은 서명 시점에 참여자가 직접 채우는
`text` 필드로 충분하고, 서버가 RFP 데이터를 계약서 텍스트에 주입하는 건 필요해지면 나중에 얹을
수 있는 결이라 지금은 YAGNI.

## 아키텍처

```
[PG] 템플릿 관리 화면 (/contract-templates, 신규 — quote-templates 와 유사한 top-level PG 라우트)
   → PDF 업로드 (SnowSign POST /v1/uploads, purpose=template_document
     → 브라우저가 직접 presigned PUT, 우리 서버는 바이트를 안 거침)
   → pdf.js 렌더링 + 드래그앤드롭 필드 배치
     (타입: signature/name/date/text, 각각 buyer|pg 태그)
   → 저장 시 서버 액션이 POST /v1/templates 호출 (signers 고정)
   → 성공하면 pg_signing_templates 행 1개 생성 (snowsignTemplateId 링크)

[PG] BidWizard — 견적 작성 시 워크스페이스 템플릿 중 선택(선택적) → bids.signing_template_id

[award 시점] onAward — 기존과 동일하게 항상 awaiting_pg_template 생성 (자동발송 없음, 불변)

[PG] 딜룸 계약 탭 — awaiting_pg_template 상태:
   - 낙찰 견적에 signingTemplateId 가 있으면:
     "연결된 템플릿으로 보내기" 액션 (신규, 임베드 없음)
     → POST /v1/templates/{id}/create-contract
       (participants: buyer=rfp.createdBy 연락처, pg=현재 actor 연락처)
     → POST /v1/contracts/{id}/send
     → 성공 시 markSentIfAwaiting + participant 행 직접 기록
       (우리가 보낸 값 그대로 — GET 재조회로 미러링할 필요 없음)
   - "계약서 올리기"(기존 건별 임베드)는 항상 그대로 남아있음 — 폴백
```

### 아키텍처적 이득 — 이 경로엔 리스(lease) 시스템이 필요 없다

건별 임베드 경로는 iframe을 열어두고 있는 "시간"이 있어서 리스·하트비트·강제 이어받기·고아
복구 전체가 필요했다(`docs/SNOWSIGN_SANDBOX.md`, CLAUDE.md "선정 후 전자서명" 참조). 템플릿
발송은 버튼 클릭 → 서버 액션이 API 2회 호출 → 응답으로 끝나는 순간적 작업이라 세션을 붙들고
있는 시간이 없다. 두 동료가 동시에 "연결된 템플릿으로 보내기"를 눌러도, 기존
`signing_contracts`의 CAS 전이(`markSentIfAwaiting` 류)가 그대로 막아준다 — 늦게 도착한 쪽은
에러를 받을 뿐, 새 동시성 인프라가 필요 없다.

## 데이터 모델

### `pg_signing_templates` (부활, 단순화)

```
id, workspaceId, snowsignTemplateId, name, createdBy, createdAt
```

옛 스키마 대비 `roleMapping`·`variableMapping` 컬럼을 뺐다(역할이 배치 시점에 고정되고 변수를
안 쓰므로). 제약: `unique(workspaceId, snowsignTemplateId)` + `index(workspaceId)`.

### `bids.signing_template_id` (부활)

nullable FK → `pg_signing_templates.id`, `ON DELETE SET NULL`(템플릿이 삭제돼도 이미 제출된
견적은 안 깨짐, 사전 선택만 풀림).

### 제약 — SnowSign 템플릿 API는 수정(PUT/PATCH)이 없다

Public API 문서 목차에 템플릿 생성/목록/상세/원본 다운로드뿐, 수정 엔드포인트가 없다. 한번 만든
템플릿의 필드 배치를 바꿀 방법이 없다 — "수정"은 사실상 새 템플릿을 다시 만들고 옛 링크를
삭제하는 것과 같다. `deleteTemplate`는 하드 삭제이며 우리 쪽 링크 행만 지운다(스노우싸인 원본은
고아로 남되 무해 — 옛 설계와 동일한 트레이드오프).

## 에디터 UI

### 신규 의존성

이 프로젝트엔 현재 PDF 렌더링·드래그/리사이즈 라이브러리가 전무하다(package.json 확인 완료).
이번 기능은 두 가지를 새로 들여온다:

- **PDF 렌더링**: `pdfjs-dist`(또는 `react-pdf`) — 스노우싸인 API 스펙 자체가 "PDF.js
  `getViewport({ scale: 1 })` 기준 pixel 좌표"를 요구하므로 선택의 여지가 없다.
- **드래그·리사이즈**: `react-rnd`(검증된 소형 라이브러리). 손으로 짜면(포인터 이벤트 + 경계
  클램핑 + 리사이즈 핸들) 코드량·버그 표면이 커져서, 검증된 라이브러리를 새 의존성으로 들이는
  쪽을 택했다.

### 좌표 변환

- 각 PDF 페이지를 `scale: 1`의 canvas로 그리고, 그 위에 절대 위치 HTML 레이어로 필드 박스를
  얹는다. 박스의 `x, y, width, height`가 곧 API가 요구하는 `position_x, position_y, width,
  height`(픽셀, 좌상단 원점) — 별도 환산 없이 그대로 전송.
- 여러 페이지는 세로 스크롤 리스트. 필드가 속한 페이지의 인덱스+1이 `page_number`(1부터).
- 배치 UX: 툴바에서 타입(서명/이름/날짜/텍스트) + 소속(구매사/PG사)을 고르면 현재 보고 있는
  페이지 중앙에 기본 크기 박스가 생기고, 드래그로 옮기고 모서리 핸들로 리사이즈.
- 기본 크기(API 예시 기준): signature 120×50, name/text 140×24, date 120×24.
- 필수 여부: `signature`/`name`은 API가 항상 `is_required=true`로 강제하므로 토글 UI를 안 둔다.
  `date`/`text`도 MVP는 항상 필수로 고정(선택적 필드 토글은 범위 밖).
- 저장 전 검증: 구매사 필드 ≥1, PG사 필드 ≥1(그 중 서명 가능한 타입이 최소 하나씩) — 옛
  `roleMapping` 완전성 체크의 대체.

## 참여자(서명자) 연락처 소싱

- **구매사 서명자**: `userRepo.findContactById(rfp.createdBy)` — 기존 건별 임베드 패널이 이미
  보여주는 것과 동일한 조회, 그대로 재사용.
- **PG사 서명자**: "연결된 템플릿으로 보내기"를 클릭한 현재 `actor`의 연락처
  (`userRepo.findContactById(actor.userId)`).

트레이드오프: 기존 건별 임베드는 PG가 화면에서 서명자를 직접 타이핑했으므로 실제 서명자가
클릭한 사람과 다를 수 있었다(담당자가 승인만 하고 대표가 서명하는 경우 등). 템플릿 경로는 이
자유도를 "클릭한 사람 = 서명자"로 고정한다. 서명자 선택 드롭다운은 범위 밖(필요해지면 후속으로
추가 가능한 결).

## 발송 실패의 부분 상태 처리

템플릿 발송은 `POST /v1/templates/{id}/create-contract`(초안 생성) →
`POST /v1/contracts/{id}/send`(발송) 2단계다(템플릿 기반 생성 API에는 `send_immediately` 옵션이
없다 — 항상 초안 생성 후 별도 발송 필요). create는 성공했는데 send가 실패하면 스노우싸인 쪽엔
미발송 초안이 남고 로컬엔 아직 기록이 없는 상태가 될 수 있다.

방지책:
- create-contract 성공 직후 **즉시** `providerRef`(=contract_id)를 로컬에 기록한다(상태는
  `awaiting_pg_template` 유지).
- "보내기" 재시도 시, 이미 `providerRef`가 있으면 create를 다시 부르지 않고 그 draft에 곧바로
  send만 호출한다.
- 이렇게 하면 네트워크 재시도가 스노우싸인 쪽에 초안 계약을 여러 개 쌓는 것을 막는다.

## 에러 처리

- **발송 시점에 템플릿이 이미 삭제됨**: `ON DELETE SET NULL`로 `bids.signing_template_id`가
  자동으로 null이 되고, 뷰모델이 그 필드가 없으면 "연결된 템플릿으로 보내기" 액션을 안 보여준다
  — 별도 방어 코드 불필요, 폴백은 항상 있는 "계약서 올리기".
- **쿼터 초과 등 스노우싸인 에러**: 기존 `SnowSignError` 코드 매핑을 그대로 재사용.
- **업로드 후 템플릿 생성 실패**: 스노우싸인 업로드 세션은 10분 뒤 자체 만료 — 우리 쪽 정리
  작업 불필요.

## 테스트 전략 (TDD 하드룰 적용)

1. **순수 함수** — 필드 상태(타입·소속·좌표) → `signature_fields` payload 변환, 템플릿
   완전성 검증. RED 먼저, 유닛 테스트로 커버.
2. **서비스 레이어** — `ContractSigningService`에 `createTemplate`/`sendFromTemplate`/
   `renameTemplate`/`deleteTemplate` 추가. PGlite + mock `SnowSignClient`, 기존
   `contract-signing.test.ts` 패턴. create-then-send 부분 실패 후 재시도 시 중복 draft가 안
   쌓이는지도 여기서 검증.
3. **리포지토리** — `pg_signing_templates` PGlite 테스트. 옛 `pg-signing-template.test.ts`
   (v0.4.37.0에서 삭제됨, `git show e4aee283^:lib/server/repositories/drizzle/__tests__/
   pg-signing-template.test.ts`로 참고 가능)의 케이스를 상당 부분 재활용.
4. **뷰모델** — `signing-view-model.ts`의 기존 8상태×2역할 매트릭스 테스트에 "템플릿 연결
   여부에 따른 액션 노출" 케이스 추가.
5. **에디터 드래그/리사이즈** — 순수 리듀서(드래그 델타 → 새 사각형, 페이지 경계 클램핑)는
   유닛 테스트. 포인터 이벤트 배선 자체는 얇게 유지하고, 실제 시각 동작은 브라우저 수동 QA로
   확인(프로젝트 관례 — CLAUDE.md "UI or frontend changes" 규칙).
6. **e2e** — 기존 건별 임베드 경로는 스노우싸인 임베드 세션 스텁이 없어 e2e가 막혀 있었다
   (TODOS.md). 이 템플릿 에디터는 iframe이 전혀 없다 — PDF 렌더링이 pdf.js로 완전히 로컬이라
   스텁 없이 "저장"·"보내기" API 호출만 mock하면 e2e가 성립한다. 기존 경로보다 테스트 비용이
   낮다.

## 범위 밖 (이번엔 안 함)

- 변수 치환(`variables`)
- 기존 템플릿 필드 수정(API에 수정 엔드포인트 없음 — 재생성만 가능)
- 서명자 선택 드롭다운(클릭한 사람 고정)
- 선택적 필드 토글(`is_required` 커스터마이즈)
- `stamp`/`checkbox` 필드 타입
- 템플릿 복제 도우미
- 워크스페이스 간 템플릿 공유/갤러리

## 재활용 가능한 옛 코드 (참고용, `git show e4aee283^`)

- `lib/server/repositories/drizzle/pg-signing-template.ts` + 테스트 — 리포지토리 CRUD 대부분
  그대로 쓸 수 있다(단, `roleMapping`/`variableMapping` 컬럼 제거 반영).
- `lib/server/actions/signing/{renameSigningTemplateAction,deleteSigningTemplateAction,
  listSigningTemplatesAction}.ts` — 이름변경/삭제/목록 액션은 로직이 거의 그대로 재사용 가능.
- `linkSigningTemplateAction`/`getSigningTemplateDetailAction`은 **재사용 안 함** — "외부에서
  만든 템플릿을 링크"하는 옛 모델 전용이라, 이번엔 "우리 에디터로 만들고 바로 등록"으로
  대체된다.
- `createTemplateEmbedSession`은 **재사용 안 함** — 애초에 실 API로 검증되지 않은 잘못된
  가정 위에 있었다(위 "배경" 참조).
