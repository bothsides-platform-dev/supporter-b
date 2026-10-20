# 영세 확인 구매사 자동 승인

## 현재 상태

구현은 기본 비활성이다. `BUYER_SOLE_AUTO_APPROVAL_ENABLED=true`일 때만 신규 구매사 가입·워크스페이스 생성 서비스가 보나페이에 조회한다. 기존 심사 대기는 변경하지 않는다. PG 가입·합류와 이메일·휴대폰 인증은 기존 절차를 따른다.

간이과세만으로 승인하지 않는다. 2026년 개인사업자·업력 6개월 미만 예외도 구현하지 않았다. 사업 시작일을 신뢰할 수 있게 조회하는 별도 수단을 확보한 뒤 검토한다.

## 확인한 사실과 미확인 항목

2026-10-20 [보나페이 공개 조회 화면](https://payweb.bona-pay.com/receipt/findGrade)의 HTML/스크립트를 읽었다. 화면은 `POST /receipt/getGrade.info`, form-urlencoded `bizRegNo`, 성공 코드 `RESULT_CODE=0000`를 사용한다. 결과 필드는 `BIZ_REG_NO`, `FROMDT`, `CORP_LEVEL`, `IS_DEFAULT_LEVEL`이며 조회 정보가 없으면 일반 기본 등급으로 표시한다고 안내한다.

이것은 **공식 운영 API 계약·무료 이용 허용의 증거가 아니다**. 아래는 아직 미확인이다.

- 서버 간 무료 운영 연동 허용, 호출량·차단 정책
- 보나페이 가맹점 외 사업자를 포함하는 조회 대상 범위
- 등급 데이터 원천·갱신 주기·`FROMDT` 의미와 최신성 보장
- 실제 영세 응답과 실제 미조회 응답의 필드 형식·값

자동 테스트의 영세·미조회 응답은 공개 화면의 필드명으로 만든 **합성 응답**이다. 실제 영세 사업자 응답을 관측했다고 해석하면 안 된다. 이번 구현 검증에서는 실제 사업자번호를 공급자에게 전송하지 않았다.

## 승인 경계

```text
인증된 휴대폰/로그인 세션
  → 액션의 국세청 서버 조회
  → 생성 서비스: 플래그 + buyer + 명시적 검증 성공 + 정상 영업
  → 보나페이 조회 (트랜잭션 밖, 3초, 재시도/캐시/리다이렉트 없음)
  → 성공 코드 + 번호 일치 + 영세 + 기본값 아님 + 유효 적용일
  → 한 DB 트랜잭션
      biz_profile sole/api_confirmed
      workspace active + 멤버십
      verification_application approved
      admin_audit_log + 가입/게스트 초안 연결
  → 커밋 후 기존 운영 알림: 자동 승인 완료
  → 이메일 인증/재로그인 → 홈 또는 저장한 견적
```

`FROMDT`는 `YYYYMMDD` 또는 `YYYY-MM-DD`만 파싱하며 실제 달력에 없는 날짜·미래 날짜를 거부한다. 최신성 보장 기준이 확인되지 않아 임의의 유효기간을 만들지 않았다. 공급자의 갱신 계약이 확인되면 활성화 전에 판정·테스트를 함께 조정한다.

영세 외·정보 없음·조회 실패는 자동 승인하지 않고 기존 심사 대기로 저장한다. `IS_DEFAULT_LEVEL=Y`는 정보 없음이다. 클라이언트가 보낸 등급과 출처는 자동 승인 근거로 사용하지 않는다. 외부 응답 전문은 저장하지 않는다.

자동 승인 감사는 기존 `admin_audit_logs`의 `entity_type=verification_application`, 해당 신청 ID에 연결한다. `actor=system:bona-pay`, `action=workspace.auto_approve`, `payload_json.after`에 공급자·정규화 사업자번호·조회 시각·적용일·판정·신청/워크스페이스 ID·승인 상태를 저장한다. 이 insert가 실패하면 전체 생성이 롤백된다.

자동 승인 직후에도 이메일 미인증 계정은 임시 가입이다. 기존 재가입 정리 경로는 `system:bona-pay` 승인·`sole/api_confirmed`·본인 단독 admin·견적 없음인 active 구매사에만 확장한다. 다른 멤버·기존 견적·수동 확인·정지 상태가 있으면 보존한다. 정확히 같은 게스트 초안 ID+HttpOnly 비밀값을 재제출한 응답 유실 복구는 기존 계정으로 로그인하도록 보존하며, 그 밖의 재가입은 기존 초안을 폐기하고 새 계정으로 교체한다. 워크스페이스 자동 승인이 미인증 비밀번호를 고정하는 근거가 되지 않게 한다.

## 배포 순서

1. 구매사 서비스의 플래그를 `false`로 유지한다. 미설정도 꺼짐이다.
2. 공유 DB에 `scripts/migrations/20261020-buyer-auto-approval.sql` 실행 후 **커밋**한다. `ALTER TYPE ... ADD VALUE IF NOT EXISTS`만 있으며 기존 데이터 UPDATE는 없다. 같은 트랜잭션에서 새 enum 값을 사용하지 않는다.
3. 관리자 서비스를 배포한다. `api_confirmed`를 ‘자동 확인’으로 표시하고 승인 상세의 처리 이력에서 자동 승인 근거를 보여준다.
4. 구매사 서비스를 배포한다. 플래그가 꺼진 채 기존 가입·심사 접수를 확인한다.
5. 아래 활성화 조건을 모두 확인한 뒤 운영 설정을 `true`로 바꾸고 앱을 재시작한다.

## 활성화 전 확인표

- [ ] 공급자에게 무료 서버 간 운영 이용·호출 조건을 확인하고 근거/확인일/담당자를 남긴다.
- [ ] 조회 대상과 갱신 주기, 적용일 의미를 확인한다.
- [ ] 이용 허용 범위의 실제 영세 사례를 기존 신뢰 가능한 등급 자료와 대조한다.
- [ ] 실제 미조회 사례가 `IS_DEFAULT_LEVEL=Y`로 구별되는지 확인한다.
- [ ] 영세 외·누락 필드·번호 불일치·장애·3초 타임아웃이 수동 심사로 남는지 확인한다.
- [ ] 실제 응답으로 파서 계약을 대조한다. 본 테스트 합성 응답과 실측 기록을 구분한다.
- [ ] 관리자 승인 완료 이력과 Slack/이메일 완료 표시, 이메일 인증 후 견적 복원을 스테이징에서 확인한다.

실측 기록은 민감한 원문을 이 문서에 붙이지 말고 보호된 운영 기록의 위치·대조 결과·확인일만 남긴다.

## 중지·복구

플래그를 `false`로 바꾸고 재시작하면 이후 생성은 기존 심사로 돌아간다. 이미 승인된 계정의 상태나 기존 대기 건을 일괄 변경하지 않는다. enum 값은 남겨 과거 기록을 계속 읽는다. 감사/가입 트랜잭션 오류는 가입 전체가 롤백되므로 기존 재시도 경로를 사용한다.

## 자동 검증

- `scripts/migrations/__tests__/buyer-auto-approval.test.ts`: enum DDL 재실행과 기존 대기 상태 보존
- `lib/server/services/__tests__/buyer-auto-approval.test.ts`: 가입/생성·보류·NTS 위조 방어·동일 트랜잭션·게스트 연결·이메일 게이트·기능 중지
- `lib/server/buyer-approval/bona-pay.test.ts`: 응답 분류·날짜·HTTP/JSON 실패·헤더/본문 타임아웃
- `lib/server/notifications/__tests__/auto-approved-signup.test.ts`: 완료 알림과 견적 요약
- `components/pending-approval/__tests__/EmailVerifyScreen.test.tsx`: 승인 상태 안내와 인증 후 견적 복귀
- 관리자 `components/__tests__/WorkspaceReviewInfo.test.tsx`, `lib/server/queries/admin/__tests__/autoApproval.test.ts`: 출처·감사 표시·승인/대기 목록
