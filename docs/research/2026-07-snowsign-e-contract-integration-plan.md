# 전자계약: 자체 서명 엔진 → 스노우싸인 Direct API 교체 플랜

- 작성: 2026-07-19
- 상태: 계획 확정(미착수). 브랜치 `feat/e-contract`에서 이어서 진행.
- 관련: [`docs/research/2026-07-e-contract-legal.md`](./2026-07-e-contract-legal.md)(자체구축 법적 근거 — 본 교체로 증거 모델이 스노우싸인 감사추적인증서로 이동하므로 법무 재확인 대상).

## Context — 무엇을·왜

현재 전자계약(v0.4.0.0)은 **자체 서명 엔진**이며, **`feat/e-contract` 브랜치에만 존재(dev 미머지, origin/dev보다 13커밋 앞섬, 검증 완료 2026-07-19)** 한다. 즉 자체 엔진은 아직 dev/prod 어디에도 배포되지 않았다. 엔진은 다음과 같다: 클라이언트 canvas/타이핑 서명 PNG → `contract_doc_signers.signature_image`(bytea) → 서버가 `composeFinalPdf`로 별지2(감사시트)를 합성 + SHA-256으로 무결성 검증. 이 구조는 `ContractService` 본문에 서명 방식·PDF 합성·상태머신이 한 덩어리로 묶여 있어(`Storage` 포트 같은 provider 추상화 없음) 외부 전자서명으로 교체가 어렵다.

**스노우싸인(snowsign) Public API로 전면 교체**한다. 스노우싸인이 서명식·최종 PDF·감사추적인증서·실명인증을 소유하고, 우리는 **별지1(계약 개요, 선정 조건·"본문 우선")만 서버에서 합성**해 업로드한다. 결과: 법적 신원(본인확인)이 강화되고, 서명 엔진 유지보수 부담이 사라진다.

## 확정 결정

1. **연동 방식 = Direct API** (Hosted Embed 아님). 발송 UX·별지1 유지, 서명필드는 우리가 생성한 서명블록에 고정 좌표로 배치.
2. **자체 서명 엔진 = 완전 폐기** (canvas·별지2·SHA·verify 삭제).
3. **테스트 = 스노우싸인 HTTP mock** (실 키 없이 green).
4. **기본 보안수단 = `identity_verification`**(본인확인). `users.phone` 재사용(가입 시 OTP 인증됨). **null-phone 서명자만 해당 참여자를 `email` 보안수단으로 자동 강등**(발송 차단 없음, 스노우싸인 참여자별 security_method 지원).
5. **브랜치 전략 = `feat/e-contract`에서 이어서 교체**. 미머지 브랜치 위에서 서명 엔진만 스노우싸인으로 바꾸고, 자체 엔진(canvas·별지2·SHA)은 **머지 전 제거** → dev엔 처음부터 스노우싸인 기반으로만 나감(자체 엔진은 영영 배포 안 됨).

## 브랜치

**기존 워크트리 `.claude/worktrees/feat-e-contract/`(브랜치 `feat/e-contract`)에서 계속 작업**한다. dev엔 계약 스캐폴딩(테이블·`ContractService`·UI 페이지·nav·딜룸카드·템플릿관리)이 아직 없으므로 dev 기준 새 브랜치는 낭비 — 이 브랜치의 재사용 스캐폴딩을 살리고 서명 엔진 내부만 교체한다. 자체 엔진 제거는 "배포된 코드 삭제"가 아니라 **"머지 전 미배포 코드 제거"** 라 안전.

## 목표 아키텍처 — 얇은 포트(테스트 경계)

프로덕션 구현이 스노우싸인 하나여도, `ContractService`에 HTTP를 직접 박으면 mock 테스트가 불가능하므로 얇은 포트를 둔다(스토리지 `getStorage()`/`__setStorageForTest`와 동일 논리).

```
lib/server/contracts/
  provider/
    types.ts                       # SigningProvider 포트 인터페이스
    index.ts                       # getSigningProvider() + __setSigningProviderForTest()
    snowsign/
      client.ts                    # SnowsignClient — 타입드 HTTP 래퍼 (X-API-Key, 429 재시도, success/error 봉투 매핑)
      snowsign-provider.ts         # SnowsignSigningProvider implements SigningProvider
    __fixtures__/fake-provider.ts  # FakeSigningProvider (ContractService 단위 테스트용)
```

- `ContractService` ← 생성자 DI로 `SigningProvider` 주입(repo 패턴과 동일). 단위 테스트는 `FakeSigningProvider`.
- `SnowsignSigningProvider` 테스트 → `SnowsignClient` mock. `SnowsignClient` 테스트 → `fetch` stub.

포트 메서드:

```ts
interface SigningProvider {
  prepare(input: PrepareInput): Promise<{ providerRef: string; basePdfSha256: string }>;
  syncStatus(ref: string): Promise<{ status: SnowsignStatus; signers: SignerStatus[] }>;
  finalize(ref: string): Promise<{ finalPdf: Buffer; auditCert: Buffer }>;
  cancel(ref: string, reason?: string): Promise<void>;
  remind(ref: string, participantRefs?: string[]): Promise<void>;
}
```

## 스노우싸인 API 매핑

| 우리 흐름 | 스노우싸인 | 비고 |
|---|---|---|
| 발송(prepare) | `POST /v1/uploads` → PUT PDF → `POST /v1/contracts`(`send_immediately:true`) | `integration.external_id = docId`(멱등), 반환 `contract_id`→`provider_ref` |
| 상태 동기 | `GET /v1/contracts/{id}/status` | pending/in_progress→`sent`, completed→완료 트리거 |
| 완료(finalize) | `GET /download` + `GET /audit-certificate` | URL TTL 1h → 서버가 즉시 fetch → R2 저장 |
| 회수 | `POST /v1/contracts/{id}/cancel` | 우리 `cancel`/`decline` |
| 리마인더 | `POST /v1/contracts/{id}/remind` | 신규 액션 |

상태 매핑: pending/in_progress→`sent`, completed→`completed`, cancelled→`canceled`, rejected→`declined`, expired→`expired`.

## 서명 필드 좌표 (Direct API 핵심)

- 스노우싸인 `signature_fields[]`는 **PDF.js pixel(scale=1, 좌상단 원점)**. pdf-lib은 point·좌하단 원점.
- `composeBasePdf`에 **결정적 서명블록 페이지 1장 추가**(PG 템플릿 페이지가 아니라 우리가 append한 고정 페이지 → 페이지 수 변동 무관).
- 변환: `page_number`=서명블록 페이지(1-base), `position_x=x_pt`, `position_y=pageHeight_pt − y_pt − height`(scale=1 → 1pt≈1px). `layout.ts`가 서명 박스 좌표를 반환하도록 노출.
- 참여자 매핑: buyer→role "구매사", pg→role "결제대행사"(동명 없음 → `role`로 매핑).
- **골든 테스트**: 좌표 계산은 고정 입력 → 고정 좌표 스냅샷으로 회귀 가드.

## 전화번호 (해결 완료 — 신규 UX 0)

- 서명자 2명은 모두 가입 유저 → **가입 시 OTP 인증된 `users.phone` 보유**(인프라 존재: `phone_otps`, `phoneOtpRepo.isVerified`, `sendPhoneOtpAction`/`verifyPhoneOtpAction`, `PhoneVerificationField`, `lib/utils/phone.ts` `normalizePhone`).
- `ContractService.send`에서 서명자 `user_id`→`users.phone` 조인(`getUserRepo()`), `participants[].phone`에 주입.
- 참여자별 security_method: **phone 있으면 `identity_verification`, null이면 `email`**.
- `contract_doc_signers.phone`·`security_method` 스냅샷 저장(감사 불변).

## 데이터 모델 변경

**추가(additive, 공유 DB라 수동 ALTER)**
- `contract_docs`: `provider_ref` text, `provider_status` text, `audit_cert_key` text.
- `contract_doc_signers`: `phone` text, `security_method` text.

**제거(미머지 브랜치라 파괴적 마이그레이션 불필요 — 스키마 정의에서 걷어내면 됨)**
- `contract_doc_signers`: `signature_image`(bytea), `consent_at`, `consent_text_version`, `signed_at⇔signature_image` CHECK 제약.
- ⚠ 공유 dev DB에는 이 브랜치가 `db:push`로 이미 올린 테이블/컬럼이 남아 있을 수 있음 → 스키마 정리 후 dev DB에도 반영(수동 ALTER 또는 재-push). prod엔 미배포라 무관.

## 폐기 대상 (엔진 철거)

```
components/contracts/SignaturePad.tsx · SignDialog.tsx · signature-pad-model.ts
components/contracts/IntegrityBadge.tsx (→ "스노우싸인 감사추적인증서" 링크로 대체)
lib/server/actions/contract/signContractAction.ts
lib/server/contracts/finalize.ts · pdf/audit-sheet.ts · hash.ts · verify.ts
CONTRACT_CONSENT_TEXTS / 별지2 관련 상수 (lib/types/contract-doc.ts)
+ 위 전부의 __tests__
ContractService.ensureFinalized 내 PNG-read+composeFinalPdf 블록 · getSignerImage · markSigned(이미지 쓰기)
```

## 유지·적응 대상

- **유지**: `composeBasePdf`(별지1)·compose/overview-sheet/layout/corpus/fonts/subset(+서명블록 추가), `template-validate.ts`, 상태머신·`contract_doc_events`·`notify()` 7종·ACL·다운로드 라우트·doc code 카운터·`resolveBuyerSigner`.
- **적응**: `ContractService.send`(→prepare), `sign`/`ensureFinalized`(→상태동기+finalize 다운로드), `cancel`/`decline`(→스노우싸인 cancel), `expire`(스노우싸인 expired 동기 또는 lazy), 다운로드 라우트(final=스노우싸인본 서빙), `ContractDocView`(서명 버튼 제거 → 상태·인증서 표시).

## 완료 감지 — 폴링 (webhook 없음)

- **lazy**: `loadContractDocDetail` 렌더 전 `provider.syncStatus`(기존 lazy-만료 훅 자리 재사용).
- **cron**: `/api/cron/sync-contracts` — 비종결(`sent`) 문서 폴링(rate 100/min 여유). completed면 `finalize`(다운로드→R2→`completed` 전이+notify, 멱등).

## 마이그레이션 단계 (TDD · 스노우싸인 mock)

0. 기존 워크트리 `.claude/worktrees/feat-e-contract/`에서 작업 + env `SNOWSIGN_API_KEY`/`SNOWSIGN_BASE_URL`(미설정 시 throw, R2 패턴).
1. **SnowsignClient + 포트** — mock fetch RED: uploads/contracts/status/download/audit-cert/cancel/remind 요청 shape + 에러코드(`QUOTA_EXCEEDED`/`UPLOAD_EXPIRED`/`PDF_REJECTED`…) 매핑. `SigningProvider` + `FakeSigningProvider`.
2. **스키마 additive + send 재배선** — 서명블록 추가 + 좌표 변환 + 서명자 phone 조인 + 참여자별 security_method + `provider.prepare`.
3. **상태 동기 + finalize** — 폴링(lazy+cron), 다운로드→R2→completed.
4. **엔진 철거** — 위 폐기 대상 삭제, 컬럼 제거, 다운로드 라우트/UI 적응.
5. **발송폼·라이프사이클** — cancel/remind 배선, `QUOTA_EXCEEDED` 사용자 노출. (phone 필드는 불필요 — users.phone 재사용.)

## 리스크·확인 필요

- **법적 근거 전환**: 증거가 우리 §3 동의문+별지2 → 스노우싸인 감사추적인증서로 이동. 자체구축을 §3 약정 근거로 리서치했으므로(`docs/research/2026-07-e-contract-legal.md`) **법무 확인 권장**(대개 더 강함).
- **prod 데이터**: 해소됨 — 자체 엔진은 dev/prod 미배포(미머지 브랜치). 파괴적 컬럼 DROP·데이터 마이그레이션 불필요. 공유 dev DB의 `db:push` 잔재만 정리(위 데이터 모델 절 참조).
- **폴링 지연**: 완료가 즉시 아님(cron 주기만큼). 실사용 허용 확인.
- **quota**: 발송 시 `QUOTA_EXCEEDED` 처리.

## 검증 (end-to-end)

- **단위**: `pnpm test`로 신규 client/provider/service + 철거 후 스위트 green(삭제된 테스트 제거). `SnowsignClient`=fetch stub, `SnowsignSigningProvider`=client mock, `ContractService`=`FakeSigningProvider`.
- **통합**: `FakeSigningProvider`로 발송→상태동기→완료→다운로드 전체 상태머신 검증(PGlite).
- **좌표 골든**: 서명블록 좌표 변환 스냅샷 테스트.
- **실연동(선택)**: 테스트 조직 `SNOWSIGN_API_KEY`로 발송 → 이메일/모바일 본인확인 서명 → 폴링 완료 → final+인증서 다운로드 확인. e2e는 키 없으면 skip(R2 패턴) 또는 mock 서버.
