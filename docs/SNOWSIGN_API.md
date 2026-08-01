# SnowSign Public API 레퍼런스

> 이 문서는 스노우싸인(SnowSign)이 제공하는 Public API 개발 가이드 원문 사본이다. **이 저장소 코드가 아니라 외부 서비스(SnowSign)의 API 스펙**을 기술한다 — 엔드포인트·요청/응답 스키마·에러코드가 바뀌면 SnowSign 쪽 변경이지 이 레포의 변경이 아니다.
>
> **이 프로젝트에서의 사용처**: 이 레포는 이 Public API의 클라이언트다. 선정(award) 후 전자서명 흐름 전체 설명은 `CLAUDE.md`의 "Domain Context" → "선정 후 전자서명 (SnowSign Templates)" 절 참고. 실제 연동 코드는 `lib/server/signing/` (`snowsign-client.ts` — 얕은 `SnowSignClient` 파사드, `webhook.ts`, `download-handler.ts`, `observability.ts`)와 이를 감싸는 `lib/server/services/contract-signing.ts`(`ContractSigningService`)에 있다. 이 문서에서 쓰이는 필드(예: `signature_fields`, `variables`, `security.method`)는 우리 쪽 템플릿 등록·계약서 생성 호출 페이로드를 만들 때 그대로 참고한다.
>
> | 항목 | 값 |
> |---|---|
> | Base URL | `https://api-snowsign.jtsnowball.com/public` |
> | 인증 | `X-API-Key` 헤더 (조직 설정 → API 키에서 발급, 최초 생성 시에만 값 노출) |
> | 원문 최종 수정 | 2026-07-23 (문서 버전 1.7) |

## 목차

- [개요](#개요)
- [인증](#인증)
- [API 목록](#api-목록)
- [Hosted Embed](#hosted-embed)
- [계약서 API](#계약서-api)
  - [계약서 목록 조회](#계약서-목록-조회)
  - [계약서 상세 조회](#계약서-상세-조회)
  - [계약서 상태 조회](#계약서-상태-조회)
  - [템플릿 계약서 생성](#템플릿-계약서-생성)
  - [PDF 업로드 세션 생성](#pdf-업로드-세션-생성)
  - [PDF 업로드 진단](#pdf-업로드-진단)
  - [PDF 계약서 생성](#pdf-계약서-생성)
  - [계약서 발송](#계약서-발송)
  - [계약서 취소](#계약서-취소)
  - [리마인더 발송](#리마인더-발송)
  - [계약서 다운로드](#계약서-다운로드)
  - [감사추적인증서 다운로드](#감사추적인증서-다운로드)
  - [계약서 일괄 다운로드](#계약서-일괄-다운로드)
  - [감사추적인증서 일괄 다운로드](#감사추적인증서-일괄-다운로드)
- [템플릿 API](#템플릿-api)
  - [PDF 템플릿 생성](#pdf-템플릿-생성)
  - [템플릿 목록 조회](#템플릿-목록-조회)
  - [템플릿 상세 조회](#템플릿-상세-조회)
  - [템플릿 원본 파일 다운로드](#템플릿-원본-파일-다운로드)
- [에러 처리](#에러-처리)
- [Rate Limiting](#rate-limiting)
- [샘플 코드](#샘플-코드)
- [부록](#부록)

---

## 개요

스노우싸인 Public API를 통해 외부 시스템에서 전자계약 기능을 연동할 수 있습니다.

| 항목 | 값 |
|------|------|
| Base URL | `https://api-snowsign.jtsnowball.com/public` |
| 프로토콜 | HTTPS |
| 응답 형식 | JSON (UTF-8) |
| 인증 방식 | `X-API-Key` 헤더 |

---

## 인증

### API Key 발급

1. 스노우싸인 웹 콘솔 → **조직 설정** → **API 키**
2. **새 API 키** → 키 이름과 사용 목적 입력 → 즉시 활성화
3. API Key 확인

> ⚠️ API Key는 최초 생성 시에만 확인할 수 있습니다. 안전한 곳에 보관하세요.

### 인증 방법

모든 API 요청에 `X-API-Key` 헤더를 포함합니다.

```http
X-API-Key: YOUR_API_KEY
```

---

## API 목록

### Hosted Embed

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/v1/embed-sessions` | 외부 서버가 PDF/템플릿/AI 계약 생성 iframe 세션 발급 |

### 계약서

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| GET | [/v1/contracts](#계약서-목록-조회) | 계약서 목록 조회 |
| GET | [/v1/contracts/{id}](#계약서-상세-조회) | 계약서 상세 조회 |
| GET | [/v1/contracts/{id}/status](#계약서-상태-조회) | 계약서 상태 조회 |
| POST | [/v1/templates/{id}/create-contract](#템플릿-계약서-생성) | 템플릿 기반 계약서 생성 |
| POST | [/v1/uploads](#pdf-업로드-세션-생성) | PDF 업로드 세션 생성 |
| POST | [/v1/uploads/{id}/diagnostics](#pdf-업로드-진단) | 업로드 PDF 사전 진단(선택) |
| POST | [/v1/contracts](#pdf-계약서-생성) | 업로드 PDF 기반 계약서 생성. `send_immediately=true`이면 즉시 발송 |
| POST | [/v1/contracts/{id}/send](#계약서-발송) | 계약서 발송 |
| POST | [/v1/contracts/{id}/cancel](#계약서-취소) | 계약서 취소 |
| POST | [/v1/contracts/{id}/remind](#리마인더-발송) | 리마인더 이메일 발송 |
| GET | [/v1/contracts/{id}/download](#계약서-다운로드) | 완료된 계약서 PDF 다운로드 |
| GET | [/v1/contracts/{id}/audit-certificate](#감사추적인증서-다운로드) | 감사추적인증서 다운로드 |
| POST | [/v1/contracts/bulk-download](#계약서-일괄-다운로드) | 여러 계약서 PDF 일괄 다운로드 |
| POST | [/v1/contracts/bulk-audit-certificates](#감사추적인증서-일괄-다운로드) | 감사추적인증서 일괄 다운로드 |

### 템플릿

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | [/v1/templates](#pdf-템플릿-생성) | 업로드 PDF 기반 템플릿 생성 |
| GET | [/v1/templates](#템플릿-목록-조회) | 템플릿 목록 조회 |
| GET | [/v1/templates/{id}](#템플릿-상세-조회) | 템플릿 상세 조회 |
| GET | [/v1/templates/{id}/download](#템플릿-원본-파일-다운로드) | 템플릿 원본 파일 다운로드 |

---

## Hosted Embed

Hosted Embed는 외부 ERP/그룹웨어 화면 안의 iframe에서 스노우싸인 계약 생성 흐름을 제공하는 방식입니다. 외부 서버는 API Key로 단기 Embed Session을 만들고, 브라우저에는 `iframe_url`만 전달합니다. 스노우싸인 API Key는 브라우저, iframe URL, postMessage payload에 노출하지 않습니다.

구현 순서와 샘플 코드는 [Hosted Embed 개발 가이드](./hosted-embed-guide.md)를 참고하세요. *(원문 링크 — 이 레포에는 해당 파일 없음. 필요 시 SnowSign 콘솔/담당자에게 원문 요청.)*

지원 흐름:
- PDF 업로드 계약 생성/즉시 발송
- 템플릿 단건 계약 생성/발송
- 템플릿 대량 발송 spreadsheet UI
- AI 문서 작성 후 PDF 계약 생성/즉시 발송

기본 흐름:

1. 외부 서버가 `POST /v1/embed-sessions`를 `X-API-Key`로 호출합니다.
2. 스노우싸인이 `iframe_url`을 반환합니다.
3. 외부 서비스가 브라우저에 `iframe_url`을 내려 iframe을 표시합니다.
4. 스노우싸인 iframe 안에서 계약 생성 화면이 실행됩니다.
5. 생성/발송 결과는 `snowsign.embed.*` postMessage 이벤트로 parent window에 전달됩니다.

### Embed Session 생성

```http
POST /v1/embed-sessions
X-API-Key: YOUR_API_KEY
Content-Type: application/json
```

```json
{
  "purpose": "contract_create",
  "allowed_origins": ["https://erp.example.com"],
  "flows": ["template_bulk"],
  "external_system": "customer-erp",
  "external_id": "ERP-2026-00123"
}
```

`external_system + external_id` 또는 `reference_id`는 같은 업무 요청의 iframe 세션이 중복 생성되지 않도록 하는 식별자로도 사용됩니다. 서로 다른 사용자가 같은 API key로 동시에 열 수 있도록 사용자/계약/주문 단위의 고유 값을 넣어주세요.

flows:

- PDF 초안 작성: `pdf_draft`
- PDF 작성 및 발송: `pdf_send`
- 템플릿 초안 작성: `template_draft`
- 템플릿 작성 및 발송: `template_send`
- 템플릿 대량 발송: `template_bulk`
- AI 문서 초안 작성: `ai_draft`
- AI 문서 작성 및 발송: `ai_send`
- 전체: `all`

전체 흐름을 허용하려면 `flows: ["all"]`만 전달합니다.

**Response**

```json
{
  "success": true,
  "data": {
    "session_id": "embed-session-uuid",
    "iframe_url": "https://app.snowsign.jtsnowball.com/embed/contracts/new?...",
    "code_expires_at": "2026-06-27T12:00:00Z"
  }
}
```

---

## 계약서 API

외부 ERP/그룹웨어에서 PDF 문서를 스노우싸인 계약/템플릿 생성에 연결할 때는 업로드 세션을 사용합니다. API Key는 서버에만 보관하고, 브라우저 SDK에는 노출하지 마세요.

기본 흐름:

1. ERP 서버가 `POST /v1/uploads`로 `upload_id`와 업로드 정보를 발급받습니다.
2. 브라우저 또는 ERP 서버가 발급받은 업로드 정보로 PDF를 업로드합니다.
3. ERP 서버가 `document_upload_id`와 필드 위치 정보를 계약/템플릿 생성 API에 전달합니다.
4. 스노우싸인이 업로드된 PDF를 최종 검증한 뒤 계약서 또는 템플릿을 생성합니다.

### 계약서 목록 조회

`GET /v1/contracts`

**Query Parameters**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| page | integer | N | 페이지 번호 (기본값: 1) |
| per_page | integer | N | 페이지당 항목 수 (기본값: 20, 최대: 100) |
| status | string | N | 상태 필터 (draft, pending, in_progress, completed, cancelled, expired, rejected) |

**Response**

```json
{
  "success": true,
  "data": [
    {
      "contract_id": "uuid-string",
      "title": "업무 위탁 계약서",
      "status": "in_progress",
      "email_issue": true,
      "email_issue_count": 1,
      "created_at": "2025-01-06T10:00:00Z",
      "sent_at": "2025-01-06T10:05:00Z",
      "completed_at": null
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "per_page": 20,
      "total_items": 45,
      "total_pages": 3
    }
  }
}
```

### 계약서 상세 조회

`GET /v1/contracts/{contract_id}`

**Response**

```json
{
  "success": true,
  "data": {
    "contract_id": "uuid-string",
    "title": "업무 위탁 계약서",
    "description": "2025년 프로젝트 관련 업무 위탁 계약",
    "status": "in_progress",
    "email_issue": true,
    "email_issue_count": 1,
    "signing_order": "sequential",
    "participants": [
      {
        "name": "홍길동",
        "email": "hong@example.com",
        "phone": "010-1234-5678",
        "status": "signed",
        "signed_at": "2025-01-06T14:30:00Z",
        "security_method": "identity_verification",
        "mobile_alimtalk_enabled": true,
        "locale": "en",
        "email_delivery": {
          "status": "delivered",
          "attempted_at": "2025-01-06T10:05:00Z",
          "event_at": "2025-01-06T10:05:10Z",
          "failure_reason": null,
          "attempt_count": 1,
          "unresolved_issue": null
        }
      },
      {
        "name": "김철수",
        "email": "kim@example.com",
        "phone": null,
        "status": "pending",
        "signed_at": null,
        "security_method": "password",
        "mobile_alimtalk_enabled": false,
        "locale": "ko",
        "email_delivery": {
          "status": "bounced",
          "attempted_at": "2025-01-06T10:05:00Z",
          "event_at": "2025-01-06T10:05:12Z",
          "failure_reason": "수신자 이메일 주소가 존재하지 않습니다. (5.1.1)",
          "attempt_count": 1,
          "unresolved_issue": {
            "status": "bounced",
            "event_at": "2025-01-06T10:05:12Z",
            "failure_reason": "수신자 이메일 주소가 존재하지 않습니다. (5.1.1)"
          }
        }
      }
    ],
    "variables": {
      "계약금액": "3,000,000원",
      "계약기간": "2026-04-01 ~ 2027-03-31"
    },
    "integrity_hash": null,
    "created_at": "2025-01-06T10:00:00Z",
    "sent_at": "2025-01-06T10:05:00Z",
    "completed_at": null,
    "cancelled_at": null,
    "cancelled_reason": null,
    "expires_at": "2025-01-31T23:59:59Z"
  }
}
```

`failure_reason`은 SMTP 진단 원문이나 수신자 주소를 노출하지 않고 표준 상태 코드로 정규화한 사용자용 메시지입니다.

---

### 계약서 상태 조회

`GET /v1/contracts/{contract_id}/status`

**Response**

```json
{
  "success": true,
  "data": {
    "contract_id": "uuid-string",
    "status": "in_progress",
    "email_issue": true,
    "email_issue_count": 1,
    "participants_status": {
      "total": 2,
      "signed": 1,
      "pending": 1
    }
  }
}
```

---

### 템플릿 계약서 생성

`POST /v1/templates/{template_id}/create-contract`

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| title | string | Y | 계약서 제목 |
| description | string | N | 계약서 설명 |
| participants | array | Y | 참여자 목록 (역할 매핑) |
| variables | object | N | 템플릿 변수 값. 텍스트 변수는 문자열, 날짜 변수는 ISO 날짜/연월 문자열, 체크박스 변수는 boolean |
| signing_order | string | N | 서명 순서 (템플릿 기본값 사용 시 생략) |

**participants 항목**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| name | string | Y | 참여자 이름 |
| email | string | Y | 참여자 이메일 |
| phone | string | N | 참여자 휴대폰 번호. 휴대폰 간편인증 사용 시 필수 |
| mobile_alimtalk_enabled | boolean | N | 모바일 알림톡 발송 여부. 생략 시 템플릿 역할 정책 사용 |
| locale | string | N | `ko` 또는 `en`. 생략 시 템플릿 역할 언어 사용 |
| role | string | Y | 템플릿에 정의된 역할명 (예: "근로자", "회사") |
| security | object | 조건부 | 템플릿 역할이 비밀번호 보호이면 필수. `{ "method": "password", "value": "..." }`로 서명 비밀번호를 전달합니다. 이메일/간편인증 역할에는 전달하지 않습니다. |

**variables 사용법**

- 동일한 변수명으로 여러개 배치할 수 있으며, 하나의 값을 전달하면 모두 동일하게 적용됩니다.
- 텍스트 변수는 `variables` 객체에 `{ "변수명": "치환할 값" }` 형식으로 전달합니다.
- 날짜 변수는 `date_precision`이 `day`이면 `YYYY-MM-DD`, `month`이면 `YYYY-MM` 형식으로 전달합니다.
- 체크박스 변수는 `{ "변수명": true }` 또는 `{ "변수명": false }`로 전달합니다.

**Request 예시**

```json
{
  "title": "홍길동 근로계약서",
  "participants": [
    { "name": "홍길동", "email": "hong@example.com", "phone": "010-1234-5678", "role": "근로자", "mobile_alimtalk_enabled": true, "locale": "en" },
    { "name": "스노우싸인(주)", "email": "hr@snowsign.io", "role": "회사", "security": { "method": "password", "value": "1234" } }
  ],
  "variables": {
    "계약시작일": "2025-02-01",
    "개인정보동의": true,
    "급여": "3,500,000원"
  }
}
```

**Response (201)**

```json
{
  "success": true,
  "data": {
    "contract_id": "uuid-string",
    "title": "홍길동 근로계약서",
    "status": "draft"
  },
  "message": "계약서가 생성되었습니다."
}
```

---

### PDF 업로드 세션 생성

`POST /v1/uploads`

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| purpose | string | Y | `contract_document` 또는 `template_document` |
| filename | string | Y | 원본 파일명 |
| content_type | string | Y | `application/pdf` |
| size_bytes | integer | Y | 업로드 예정 파일 크기. 최대 50MB |

**Response**

```json
{
  "success": true,
  "data": {
    "upload_id": "upl_abc123",
    "upload_url": "https://...",
    "fields": {
      "key": "...",
      "Content-Type": "application/pdf"
    },
    "max_size_bytes": 52428800,
    "allowed_content_types": ["application/pdf"],
    "expires_at": "2026-06-11T04:00:00Z"
  }
}
```

**정책**

- 업로드 세션은 10분 동안 유효합니다.
- 응답의 `upload_url`과 `fields`는 PDF 업로드 요청에 그대로 사용합니다.

### PDF 업로드 진단

`POST /v1/uploads/{upload_id}/diagnostics`

계약/템플릿 생성 전에 PDF 경고를 사용자에게 보여주고 싶은 경우에만 호출합니다. 계약/템플릿 생성 API는 이 API 호출 여부와 관계없이 업로드된 PDF를 다시 검증합니다.

**Response**

```json
{
  "success": true,
  "data": {
    "upload_id": "upl_abc123",
    "pdf": {
      "upload_policy": "allow",
      "page_count": 2,
      "render_profile": "fontFace",
      "warnings": [],
      "errors": []
    }
  }
}
```

---

### PDF 계약서 생성

`POST /v1/contracts`

업로드 PDF와 필드 위치 정보로 계약서를 생성합니다. `send_immediately=true`이면 생성 후 즉시 발송합니다.

**Request Body 주요 필드**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| title | string | Y | 계약서 제목 |
| document_upload_id | string | Y | 업로드 세션 ID |
| send_immediately | boolean | N | true이면 계약 생성 후 즉시 발송. 기본값 false |
| participants | array | Y | 참여자 목록 |
| signature_fields | array | Y | 입력칸/서명칸 위치 목록 |
| variables | object | N | 변수 필드 값 |
| integration | object | N | 외부 시스템 metadata |

대부분의 경우 참여자는 `role` 하나로 필드와 매핑할 수 있습니다. 같은 역할명이 2명 이상이면 구분이 모호하므로 `key`와 `role_name`을 명시하세요.

`participants[].locale`은 이메일과 서명 화면 언어이며 `ko` 또는 `en`을 사용합니다. 생략하면 `ko`입니다.

`signature_fields` 좌표는 PDF.js `getViewport({ scale: 1 })` 기준 pixel 좌표입니다. 원점은 페이지 좌상단이며, `page_number`는 1부터 시작합니다.

**signature_fields 항목 주요 필드**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| participant 또는 participant_key | string | 조건부 | 참여자 역할명 또는 참여자 key. `type: "variable"`에는 사용하지 않습니다. |
| type | string | Y | `signature`, `stamp`, `name`, `text`, `date`, `checkbox`, `variable` |
| page_number | integer | Y | PDF 페이지 번호. 1부터 시작 |
| position_x / position_y | number | Y | PDF.js pixel 좌표 |
| width / height | number | Y | 입력칸 크기 |
| position_unit | string | N | `pixel`만 지원 |
| is_required | boolean | N | 필수 입력 여부. 생략 시 true. `signature`/`stamp`/`name`은 항상 true, `variable`은 false, `text`/`date`/`checkbox`만 false 지정 가능 |
| font_size | integer | N | 텍스트/날짜/변수 텍스트 PDF 표시 폰트 크기. 1~72 |
| text_align | string | N | 텍스트 정렬. `left`, `center`, `right` 중 하나. `name`, `text`, `date`, 텍스트/날짜 `variable`에 적용되며 서명/체크박스에는 저장되지 않습니다. |
| placeholder_text | string | N | 텍스트 입력 안내 문구. 날짜 입력칸에는 저장하지 않습니다. |
| variable_name | string | 조건부 | `type: "variable"`일 때 필수 |
| variable_value_type | string | N | 변수 값 타입. `text`, `checkbox`, `date` 중 하나. 기본값 `text` |
| date_precision | string | N | 날짜 입력/날짜 변수 정밀도. `day` 또는 `month` |
| date_format_pattern | string | N | 날짜 표시 형식. 예: `YYYY년 MM월 DD일`, `YYYY-MM-DD`, `YYYY/MM` |
| fill_background | boolean | N | 날짜/변수 표시 시 PDF 배경을 흰색으로 가릴지 여부 |

**Request 예시**

```json
{
  "title": "외주 계약서 - 홍길동",
  "document_upload_id": "upl_abc123",
  "signing_order": "parallel",
  "send_immediately": true,
  "message": "서명 부탁드립니다.",
  "participants": [
    {
      "role": "근로자",
      "name": "홍길동",
      "email": "hong@example.com",
      "phone": "010-1234-5678",
      "security": { "method": "identity_verification" },
      "mobile_alimtalk_enabled": false,
      "locale": "en"
    }
  ],
  "signature_fields": [
    {
      "participant": "근로자",
      "type": "signature",
      "page_number": 2,
      "position_x": 410,
      "position_y": 710,
      "width": 120,
      "height": 50,
      "position_unit": "pixel",
      "is_required": true
    },
    {
      "type": "variable",
      "variable_name": "contract_amount",
      "variable_value_type": "text",
      "page_number": 1,
      "position_x": 180,
      "position_y": 240,
      "width": 120,
      "height": 18,
      "fill_background": true,
      "text_align": "right"
    }
  ],
  "variables": {
    "contract_amount": "3,000,000원"
  },
  "integration": {
    "external_system": "customer-erp",
    "external_id": "ERP-2026-0001",
    "sdk_version": "1.0.0"
  }
}
```

**Response (201)**

```json
{
  "success": true,
  "data": {
    "contract_id": "uuid-string",
    "title": "외주 계약서 - 홍길동",
    "status": "pending",
    "sent_at": "2026-06-11T03:20:00Z"
  }
}
```

`send_immediately`를 생략하거나 `false`로 보내면 초안만 생성됩니다.

### 계약서 발송

`POST /v1/contracts/{contract_id}/send`

> ⚠️ 발송 시 월간 계약 사용량이 차감됩니다.

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| message | string | N | 참여자에게 전달할 메시지 |

**Response**

```json
{
  "success": true,
  "data": {
    "contract_id": "uuid-string",
    "status": "pending",
    "sent_at": "2025-01-06T10:05:00Z"
  },
  "message": "계약서가 발송되었습니다."
}
```

---

### 계약서 취소

`POST /v1/contracts/{contract_id}/cancel`

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| reason | string | N | 취소 사유 |

**Response**

```json
{
  "success": true,
  "data": {
    "contract_id": "uuid-string",
    "status": "cancelled"
  },
  "message": "계약서가 취소되었습니다."
}
```

---

### 리마인더 발송

`POST /v1/contracts/{contract_id}/remind`

서명 대기 중인 참여자에게 리마인더 이메일을 발송합니다.

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| message | string | N | 참여자에게 전달할 메시지 |
| participant_uuids | array | N | 특정 참여자에게만 발송할 참여자 UUID 목록 |

**Response**

```json
{
  "success": true,
  "message": "리마인더가 발송되었습니다."
}
```

---

### 계약서 다운로드

`GET /v1/contracts/{contract_id}/download`

완료된 계약서 PDF의 다운로드 URL을 발급합니다. URL은 1시간 동안 유효합니다.

**Response**

```json
{
  "success": true,
  "data": {
    "download_url": "https://...",
    "filename": "홍길동_업무위탁계약서.pdf",
    "expires_at": "2025-01-06T11:00:00Z"
  }
}
```

> ⚠️ 계약서 상태가 `completed`인 경우에만 다운로드 가능합니다.

---

### 감사추적인증서 다운로드

`GET /v1/contracts/{contract_id}/audit-certificate`

완료된 계약서의 감사추적인증서 PDF 다운로드 URL을 발급합니다.

**Response**

```json
{
  "success": true,
  "data": {
    "download_url": "https://...",
    "filename": "홍길동_업무위탁계약서_감사추적인증서.pdf",
    "expires_at": "2025-01-06T11:00:00Z"
  }
}
```

---

### 계약서 일괄 다운로드

`POST /v1/contracts/bulk-download`

여러 계약서의 PDF 다운로드 URL을 한 번에 발급합니다.

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| contract_ids | array | Y | 계약서 ID 목록 (최대 50건) |

**Request 예시**

```json
{
  "contract_ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Response**

```json
{
  "success": true,
  "data": [
    {
      "contract_id": "uuid-1",
      "download_url": "https://...",
      "filename": "홍길동_계약서.pdf",
      "error": null
    },
    {
      "contract_id": "uuid-2",
      "download_url": null,
      "filename": null,
      "error": "계약서가 아직 완료되지 않았습니다."
    }
  ]
}
```

---

### 감사추적인증서 일괄 다운로드

`POST /v1/contracts/bulk-audit-certificates`

여러 계약서의 감사추적인증서 다운로드 URL을 한 번에 발급합니다.

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| contract_ids | array | Y | 계약서 ID 목록 (최대 50건) |

**Response**:

```json
{
  "success": true,
  "data": [
    {
      "contract_id": "uuid-1",
      "download_url": "https://...",
      "filename": "홍길동_감사추적인증서.pdf",
      "error": null
    },
    {
      "contract_id": "uuid-2",
      "download_url": null,
      "filename": null,
      "error": "계약서가 아직 완료되지 않았습니다."
    }
  ]
}
```

---

## 템플릿 API

### PDF 템플릿 생성

`POST /v1/templates`

업로드 PDF와 역할/필드 위치 정보로 스노우싸인 템플릿을 생성합니다.

**Request Body 주요 필드**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| name | string | Y | 템플릿명 |
| document_upload_id | string | Y | 업로드 세션 ID |
| signing_order | string | N | `parallel` 또는 `sequential` |
| deadline_days | integer | N | 기본 마감 기한 |
| signers | array | Y | 역할 목록 |
| signature_fields | array | N | 입력칸/서명칸 위치 목록 |
| integration | object | N | 외부 시스템 metadata |

대부분의 경우 템플릿 역할은 문자열 배열로 만들 수 있습니다. 역할 언어를 지정하려면 `{ "role": "...", "locale": "ko|en" }` 형식을 사용하며 기본값은 `ko`입니다. 같은 역할명이 중복되면 `key`와 `role_name`을 명시하세요.

`signature_fields` 항목은 PDF 계약서 생성 API와 동일하게 `is_required`, `text_align`, `font_size`, 날짜 메타데이터, 변수 메타데이터를 사용할 수 있습니다. `is_required`는 `text`/`date`/`checkbox`에서만 false 지정 가능하며, `text_align`은 `left`, `center`, `right` 중 하나이고 `name`, `text`, `date`, 텍스트/날짜 `variable`에 적용됩니다.

**Request 예시**

```json
{
  "name": "표준 외주계약서",
  "document_upload_id": "upl_template_abc",
  "signing_order": "parallel",
  "deadline_days": 14,
  "signers": [{ "role": "근로자", "locale": "en" }],
  "signature_fields": [
    {
      "role": "근로자",
      "type": "signature",
      "page_number": 2,
      "position_x": 410,
      "position_y": 710,
      "width": 120,
      "height": 50,
      "position_unit": "pixel",
      "is_required": true
    },
    {
      "role": "근로자",
      "type": "date",
      "page_number": 1,
      "position_x": 180,
      "position_y": 240,
      "width": 120,
      "height": 24,
      "date_precision": "day",
      "date_format_pattern": "YYYY-MM-DD",
      "text_align": "center"
    }
  ],
  "integration": {
    "external_system": "customer-erp",
    "external_id": "ERP-TEMPLATE-001",
    "sdk_version": "1.0.0"
  }
}
```

**Response (201)**

```json
{
  "success": true,
  "data": {
    "template_id": "uuid-string",
    "name": "표준 외주계약서"
  }
}
```

### 템플릿 목록 조회

`GET /v1/templates`

**Query Parameters**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| page | integer | N | 페이지 번호 |
| per_page | integer | N | 페이지당 항목 수 |

**Response**

```json
{
  "success": true,
  "data": [
    {
      "template_id": "uuid-string",
      "name": "근로계약서 양식",
      "description": "정규직 근로계약서 표준 양식",
      "category": "HR",
      "signing_order": "sequential",
      "deadline_days": 7,
      "signers": [
        { "role_name": "근로자", "signing_order": 1, "security_method": "easy_cert", "mobile_alimtalk_enabled": true, "locale": "en" },
        { "role_name": "회사", "signing_order": 2, "security_method": "password", "mobile_alimtalk_enabled": false, "locale": "ko" }
      ]
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "per_page": 20,
      "total_items": 5,
      "total_pages": 1
    }
  }
}
```

---

### 템플릿 상세 조회

`GET /v1/templates/{template_id}`

**Response**

```json
{
  "success": true,
  "data": {
    "template_id": "uuid-string",
    "name": "근로계약서 양식",
    "description": "정규직 근로계약서 표준 양식",
    "category": "HR",
    "signing_order": "sequential",
    "deadline_days": 7,
    "signers": [
      { "uuid": "signer-uuid-1", "role_name": "근로자", "signing_order": 1, "security_method": "easy_cert", "mobile_alimtalk_enabled": true, "locale": "en" },
      { "uuid": "signer-uuid-2", "role_name": "회사", "signing_order": 2, "security_method": "password", "mobile_alimtalk_enabled": false, "locale": "ko" }
    ],
    "signature_fields": [
      {
        "uuid": "field-uuid-1",
        "role_name": "근로자",
        "type": "signature",
        "page_number": 1,
        "position_x": 100.0,
        "position_y": 500.0,
        "width": 150.0,
        "height": 50.0,
        "is_required": true,
        "label": null,
        "display_order": 1,
        "date_precision": null,
        "date_format_pattern": null,
        "fill_background": null,
        "text_align": null
      }
    ],
    "variables": [
      {
        "name": "계약시작일",
        "label": "계약시작일",
        "value_type": "date",
        "default_value": null,
        "is_required": false,
        "date_precision": "day",
        "date_format_pattern": "YYYY년 MM월 DD일",
        "fill_background": true,
        "text_align": "center"
      },
      {
        "name": "개인정보동의",
        "label": "개인정보동의",
        "value_type": "checkbox",
        "default_value": null,
        "is_required": false,
        "date_precision": null,
        "date_format_pattern": null,
        "fill_background": false,
        "text_align": null
      },
      {
        "name": "급여",
        "label": "급여",
        "value_type": "text",
        "default_value": "3,000,000원",
        "is_required": false,
        "date_precision": null,
        "date_format_pattern": null,
        "fill_background": false,
        "text_align": "right"
      }
    ]
  }
}
```

`signers[].security_method`는 템플릿 역할에 저장된 서명 보안 정책입니다. 값은 `email`, `password`, `easy_cert` 중 하나이며, 값이 없으면 `email`과 동일하게 처리됩니다.
`signers[].mobile_alimtalk_enabled`는 템플릿 역할 기반 계약 생성 시 해당 참여자에게 모바일 알림톡을 보낼지 여부입니다.
`signers[].locale`은 역할의 기본 이메일·서명 화면 언어입니다.
`signature_fields`에는 `type: "variable"` 필드가 제외됩니다. 변수 목록은 `variables`에 동일 변수명 중복 제거 후 반환됩니다.
`signature_fields[].is_required`는 `signature`/`stamp`/`name`이면 항상 true이고, `text`/`date`/`checkbox`이면 저장된 필수 여부입니다.
`variables[].is_required`는 변수 값이 서명자 입력 대상이 아니므로 항상 false입니다.
`signature_fields[].text_align`과 `variables[].text_align`은 `left`, `center`, `right`, `null` 중 하나입니다. 서명/체크박스처럼 텍스트 정렬 대상이 아닌 항목은 `null`입니다.
`variables[].value_type`은 `text`, `checkbox`, `date` 중 하나입니다. 날짜 변수는 `date_precision`, `date_format_pattern`, `fill_background`, `text_align` 메타를 함께 사용합니다.

---

### 템플릿 원본 파일 다운로드

`GET /v1/templates/{template_id}/download`

템플릿 원본 PDF 파일의 임시 다운로드 URL을 반환합니다. URL은 발급 후 1시간 동안 유효합니다.

**Response**

```json
{
  "success": true,
  "data": {
    "download_url": "https://s3.amazonaws.com/...",
    "filename": "근로계약서 양식.pdf",
    "expires_at": "2025-01-06T11:00:00+00:00"
  }
}
```

**Errors**: `TEMPLATE_NOT_FOUND`, `TEMPLATE_FILE_NOT_FOUND`

---

## 에러 처리

### 에러 응답 형식

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "에러 메시지"
  },
  "meta": {
    "timestamp": "2025-01-06T10:00:00Z"
  }
}
```

### HTTP 상태 코드

| 코드 | 설명 |
|------|------|
| 200 | 성공 |
| 201 | 생성 성공 |
| 400 | 잘못된 요청 |
| 401 | 인증 실패 |
| 403 | 권한 없음 또는 사용량 초과 |
| 404 | 리소스 없음 |
| 429 | 요청 제한 초과 |
| 500 | 서버 오류 |

### 주요 에러 코드

| 코드 | 설명 |
|------|------|
| API_KEY_REQUIRED | API Key 누락 |
| INVALID_API_KEY | 유효하지 않은 API Key |
| VALIDATION_ERROR | 요청 파라미터 검증 실패 |
| QUOTA_EXCEEDED | 월간 사용량 한도 초과 |
| UPLOAD_NOT_FOUND | 업로드 세션을 찾을 수 없음 |
| UPLOAD_EXPIRED | 업로드 세션이 만료됨 |
| PDF_REJECTED | 지원하지 않는 PDF |
| CONTRACT_NOT_FOUND | 계약서를 찾을 수 없음 |
| TEMPLATE_NOT_FOUND | 템플릿을 찾을 수 없음 |
| INVALID_CONTRACT_STATUS | 현재 상태에서 수행할 수 없는 작업 |

---

## Rate Limiting

| 항목 | 제한 |
|------|------|
| API 호출 | 100 requests / minute (API Key 당) |
| 사용 중인 업로드 세션 | API Key당 3개 |
| 사용 중인 업로드 세션 선언 용량 | API Key당 150MB |
| 업로드 세션 유효 시간 | 10분 |

제한 초과 시 `429` 상태 코드가 반환됩니다.

---

## 샘플 코드

### cURL

```bash
# 계약서 목록 조회
curl -X GET "https://api-snowsign.jtsnowball.com/public/v1/contracts" \
  -H "X-API-Key: YOUR_API_KEY"

# PDF 업로드 세션 생성
curl -X POST "https://api-snowsign.jtsnowball.com/public/v1/uploads" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"purpose":"contract_document","filename":"contract.pdf","content_type":"application/pdf","size_bytes":1234567}'

# 계약서 발송
curl -X POST "https://api-snowsign.jtsnowball.com/public/v1/contracts/{contract_id}/send" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "계약서 검토 부탁드립니다."}'
```

### Python

```python
import requests

API_KEY = "YOUR_API_KEY"
BASE_URL = "https://api-snowsign.jtsnowball.com/public/v1"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# 계약서 목록 조회
response = requests.get(f"{BASE_URL}/contracts", headers=headers)
contracts = response.json()["data"]

# 계약서 발송
contract_id = "CONTRACT_ID"
response = requests.post(
    f"{BASE_URL}/contracts/{contract_id}/send",
    headers=headers,
    json={"message": "계약서 검토 부탁드립니다."}
)
print(response.json())
```

### JavaScript (Node.js)

```javascript
const API_KEY = 'YOUR_API_KEY';
const BASE_URL = 'https://api-snowsign.jtsnowball.com/public/v1';

const headers = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json'
};

// 계약서 목록 조회
const response = await fetch(`${BASE_URL}/contracts`, { headers });
const { data: contracts } = await response.json();

// 계약서 발송
const contractId = 'CONTRACT_ID';
await fetch(`${BASE_URL}/contracts/${contractId}/send`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ message: '계약서 검토 부탁드립니다.' })
});
```

---

## 부록

### 계약서 상태

| 상태 | 설명 |
|------|------|
| draft | 초안 - 아직 발송되지 않음 |
| pending | 대기 중 - 발송됨, 서명 대기 |
| in_progress | 진행 중 - 일부 참여자 서명 완료 |
| completed | 완료 - 모든 참여자 서명 완료 |
| cancelled | 취소됨 |
| expired | 만료됨 |
| rejected | 거절됨 |

### 참여자 상태

| 상태 | 설명 |
|------|------|
| pending | 서명 대기 |
| viewed | 문서 열람 |
| signed | 서명 완료 |
| rejected | 거절 |

### 서명 필드 타입

| 타입 | 설명 |
|------|------|
| signature | 서명란 |
| name | 이름 필드 |
| text | 텍스트 입력 |
| date | 날짜 입력 |
| checkbox | 체크박스 |
| stamp | 인감 도장 |
| variable | 템플릿 변수 (API로 값 주입, 서명자 입력 불가) |

---

*원문 최종 수정: 2026-07-23*
*원문 문서 버전: 1.7*
