# 공통 장기계약 부속합의서 전환

## 구현 범위

선정 → PG가 양측 회사 정보 입력·임시 저장 → 실제 PDF 확인 → 양측 전자서명 요청 → 기존 SnowSign 상태 동기화·계약 보관함.

- 본문은 `lib/contract-doc/agreement.ts`의 `AGREEMENT_VERSION`으로 고정한다. 사진을 참고한 공통 문안이며 PG별 조항 편집·PDF 업로드는 신규 발송에서 제공하지 않는다.
- 상호·사업자등록번호·주소·대표자만 PG가 입력한다. 계약 문서용 정보이며 워크스페이스 이름이나 사업자 프로필을 변경하지 않는다.
- 구매사 담당자는 견적 요청 작성자, PG 담당자는 발송하는 사용자다. 양측 010 휴대폰과 기존 본인인증 정책을 요구한다. 구매사 사전 승인 단계는 없다.
- 최종 수수료는 선정 견적에서 가져온다. 관리자 표준 요율에서 이를 차감해 할인 폭을 계산한다. 정률 할인 폭은 %p, 가상계좌는 원/건이다. 누락·음수 할인·유효하지 않은 견적은 발송을 차단한다. 기본 요율은 없다.
- PG별 기준은 별도 `admin-supporter-b`의 `/agreement-rates`에서 편집한다. 변경 전후는 관리자 감사 로그에 남는다. 현재 업종 추천의 예상 수수료 정책과 별개다.

## 배포 순서 — 이 작업에서 운영 DB 변경·실제 발송은 하지 않음

1. 운영자가 공통 문안 `2026-09-20-v1`(2년·독점 이용 예외·할인액 반환·상계·손해배상·원 계약 우선관계)을 확인한다. 제품 구현은 법률 효력 검증을 대신하지 않는다.
2. DB 백업과 대상 DB 확인 후 `scripts/migrations/long-term-agreements.sql`을 적용한다. 기존 테이블·계약·서명 상태는 변경하지 않는 추가 DDL이다. 재적용해도 기존 행을 지우지 않는다.
3. admin-supporter-b의 동일 작업 브랜치를 배포한다. PG별 결제수단·등급 표준 요율을 등록한다. 빈칸은 미등록, 0은 명시적 0이다. 일부 등급만 등록하면 해당 등급이 없는 견적의 발송은 차단된다.
4. bidit 앱을 배포한다. `LONG_TERM_AGREEMENTS_ENABLED=true`가 기본이며 `CONTRACT_TEMPLATES_ENABLED`는 그 반대다. 기존 템플릿 행을 삭제하지 않는다.
5. 선정된 테스트 견적에서 PG 저장·PDF 확인, 구매사의 초안 비노출, 양측 본인인증·서명, 완료본과 감사추적인증서의 보관함 등록을 확인한다. 실 서명 단계는 승인된 테스트 당사자로 운영자가 실행한다.

두 앱은 같은 `pg_agreement_rates` 테이블을 사용한다. 요율 키는 `결제수단[:등급]` 또는 `custom:구매사 입력 라벨`이다. 정률 저장 단위는 소수(2% = 0.02), 가상계좌는 정수 원이다. 두 레포의 결제수단·등급 어휘를 함께 유지해야 한다. DDL은 bidit이 소유한다.

## 불변식과 복구

- 저장은 계약 행 잠금 + revision 비교로 동료의 초안을 덮어쓰지 않는다. 유효한 발송 리스 또는 providerRef가 있으면 편집할 수 없다.
- 미리보기 stamp는 회사 정보·본문 버전·요율 버전·선정 견적·서명 담당자·행위자를 함께 묶는다. 발송 직전 PG 워크스페이스와 계약 행을 잠그고 재검증한다. 관리자는 같은 PG 워크스페이스 잠금을 사용한다.
- `prepared`는 외부 계약 생성 전에 저장한다. 발송 성공 시 동일 문서를 기존 `sent_document`에 providerRef와 원자적으로 기록한다. 보낸 문서 보기와 재생성은 이 스냅샷만 읽는다.
- 발송 응답이 유실되면 `발송 결과 확인하기`가 기존 providerRef를 조회한다. 이미 발송/완료면 같은 문서로 복구하며 새 계약을 만들지 않는다. 미발송 초안이면 기존 ref를 정리한 뒤 최신 미리보기를 요구한다. 조회 실패면 ref를 보존한다.
- 전환 전에 providerRef가 있던 기존 계약은 기존 관리 경로를 유지한다. providerRef가 없는 대기 라운드와 재발송으로 여는 새 라운드는 공통 합의서다. 기존에 외부 발송했지만 앱에 ref가 전혀 남지 않은 고아 계약은 자동 분류하지 않는다. 전환 전 운영자가 기존 복구 기능으로 연결해야 한다.
- 신규 공통 계약에 다른 PDF를 붙이는 우회도 막는다. 기존 임베드·템플릿·복구 스캔·임의 provider attach의 서버 게이트가 동일 정책을 따른다.
- PDF 미리보기와 보낸 문서는 해당 구매사·선정 PG만 조회한다. 발송 전 구매사는 회사 정보 초안·미리보기 stamp·PDF를 받지 않는다. 응답은 `private, no-store`, 렌더 예산은 기존 preview limiter를 공유한다.
- 조항형 발송에는 공급자 서명 마감이 없다. 기존 경과일 표시·30일 방치 알림을 유지하며 새 만료를 약속하지 않는다.

## 롤백

원칙은 새 발송을 잠시 중단하고 전진 수정한다. 테이블·prepared·sent_document·providerRef를 삭제하지 않는다. `LONG_TERM_AGREEMENTS_ENABLED=false`는 옛 PDF 신규 발송 경로를 다시 여는 정책 변경이므로 운영 확인 없이 긴급 플래그처럼 사용하지 않는다. 이미 보낸 공통 합의서의 완료·보관은 기존 서명 서비스가 계속 수행한다.

## 검증 진입점

- `pnpm test lib/contract-doc/__tests__/agreement.test.ts`
- `pnpm test lib/server/services/__tests__/agreement.test.ts`
- `pnpm test lib/server/services/__tests__/agreement-send.test.ts`
- `pnpm test components/deal-room/signing/__tests__/AgreementPanel.test.tsx`
- `pnpm test lib/db/__tests__/agreement-migration.test.ts`
- `pnpm e2e e2e/long-term-agreement.spec.ts` — 전용 테스트 DB 재시드, 외부 발송 없이 양측 화면·PDF·모바일 확인
- admin: `pnpm test lib/server/actions/admin/__tests__/agreementRates.test.ts`
