# 공통 장기합의서 발송 프로토콜 감사 — 2026-10-02

## 확인된 결론과 수정 결과

상태: **DONE_WITH_CONCERNS** — 요청한 한 원인 수정·검증 완료, 독립 결함은 아래에 명시.

**외부로 보낸 문서 A와 다른 문서 B를 `sent_document`에 기록하는 경합을 재현하고, 생성 결과의 바인딩에서 리스 검증이 빠진 원인 한 건을 수정했다.** 만료된 작업 A가 외부 생성 응답을 기다리는 동안 B가 저장·준비하면, A의 ref가 B의 prepared와 연결될 수 있었다. 발송 응답까지 유실되면 복구가 B를 보낸 문서로 확정했다. 계약 증거가 다른 회사 정보·요율 판본으로 바뀔 수 있어 이번 수정 대상으로 선정했다.

공통 합의서의 `bindDraftRef`에 준비 당시 `claimedAt` 정확일치 CAS를 추가했다. `saveDraft`는 성공한 저장과 같은 계약 행 잠금 트랜잭션에서 만료된 발송 토큰도 무효화한다. B가 저장만 하고 새 리스를 취득하지 않는 경우까지 A를 **외부 발송 전에** 차단한다. 레거시 발송과 제품 확정 결정은 바꾸지 않았다.

서비스 회귀의 RED → GREEN을 직접 확인했다. 격리 PostgreSQL 16.14에서도 실제 두 Drizzle repository를 호출해 save-first/bind-first 양쪽 잠금 순서를 확인했다. 전체 프로토콜의 중복 발송 방지를 증명한 수정은 아니다.

독립 원인 두 가지도 입증했으나 이번 한 건 수정에는 포함하지 않았다: **웹훅이 sent 커밋을 앞질러 문서·참여자를 누락**, **오래된 조회가 completed를 in_progress로 역행**. 이 네 가지 실행 변형은 명시적인 예상 실패 테스트(`it.fails`)로 남겼다. 정상 통과나 해결로 집계하지 않는다.

작업 위치는 `.worktrees/fix-agreement-dispatch-race`, 브랜치는 `fix/agreement-dispatch-race`다. 원본 dev 작업트리와 관리자 저장소는 보존했다. 감사 단계에서는 운영 DB, 실제 SnowSign 발송·취소, 배포, PR 생성을 수행하지 않았다. 이후 사용자가 별도로 요청한 `/ship` 단계의 공개·검증 결과는 PR에 기록한다.

## 재현 실행 순서와 근거

### 실제 발송 경로와 영속 경계

진입은 `agreementActions.sendAgreementAction` → `ContractSigningService.sendAgreement` → `ContractDispatch.dispatch` → `SigningDispatch.dispatchComposed`다. 아래는 실행 코드의 보장이며 외부 API의 미문서 보장을 포함하지 않는다.

| 단계 | 고정되는 값·트랜잭션 경계 | 실패 후 영속 상태·복구 |
|---|---|---|
| 저장·미리보기 | saveDraft는 계약 행 FOR UPDATE 안에서 revision·awaiting·ref 부재·활성 리스를 검사한다. load의 stamp는 계약 ID·revision·actor·회사 정보·본문·수수료표·rateVersion·선정 bid ID·담당자를 묶는다. 미리보기 읽기 전체는 잠금 TX가 아니다. PDF 라우트는 stamp를 재비교한다. | 저장 실패는 롤백, 낡은 revision은 거부. prepare가 발송 직전 다시 검증한다. **수정:** 성공한 만료 후 저장은 기존 리스 토큰도 같은 TX에서 NULL로 만든다. |
| 리스 취득 | awaiting + 미취득/5분 초과 조건의 단일 UPDATE가 claimedAt/By를 쓴다. 이후 계약을 재조회한다. 공통 합의서는 강제 이어받기를 받지 않는다. | 경합은 SEND_HELD_BY_TEAMMATE. 반납은 claimedAt 정확일치 CAS. 공통 서버 발송에는 임베드처럼 heartbeat가 없다. |
| 기존 ref 프로브 | 기존 ref가 있으면 외부 상태부터 조회한다. pending/in_progress 및 공통 합의서 completed는 복구로 분기한다. draft/그 밖의 알려진 종결 상태는 expected ref + awaiting CAS로 지운다. draft 취소는 best-effort다. | 조회 실패/알 수 없는 상태면 ref 보존·중단. 정리 이후 보통 recover stamp는 prepare에서 거부되어 새 미리보기가 필요하다. **원래 미리보기 stamp를 가진 낡은 탭의 직접 재시도는 내용이 여전히 같으면 계속 진행할 수 있다.** |
| 잠금·판본 검증 | AgreementService.prepare TX에서 PG workspace → 계약 행 순서로 잠근다. 리스 토큰·소유자·유효기간과 잠금 뒤 읽은 stamp를 검증한다. 관리자 요율 저장도 같은 PG workspace를 잠근다. | 요율·초안·담당자·actor 변경은 차단, 호출자가 리스 반납. 관리자와 발송의 교차 프로세스 잠금은 소스 검토 범위다. 이번 PostgreSQL 실측은 아래 save/bind 경합이다. |
| prepared 저장 | 위 TX 안에서 재검증한 snapshot을 draft.prepared에 쓰고 TX를 끝낸다. | 이후 실패에도 prepared는 남는다. 불변 행은 아니다. ref가 없고 리스가 만료되면 저장이 지우고 다음 prepare가 덮어쓸 수 있다. |
| PDF 렌더·업로드 | DB TX 밖에서 같은 snapshot으로 글리프 검사·PDF 렌더·업로드. 먼저 캡처한 provider 수신자의 name/email/phone과 snapshot.signers를 모두 비교한다. | 불일치면 AGREEMENT_CHANGED, 오류면 중단·리스 반납. ref는 아직 없다. 업로드 슬롯은 소비 여부에 따라 반납/TTL 처리한다. |
| 외부 계약 생성 | 업로드 ID·캡처한 수신자·인증 phone·렌더한 서명칸·externalId를 전달한다. send_immediately는 생략한다. DB TX 밖이다. | 응답 유실이면 provider ID를 저장하지 못한다. 문서상 기본은 draft이므로 생성 응답 유실만으로 중복 발송이라 단정할 수 없다. create 멱등성은 확인되지 않았다. |
| providerRef 저장 | 원래 awaiting + ref NULL 조건으로 ref·origin을 한 UPDATE에 썼다. **수정:** 공통 합의서는 준비 당시 claimedAt도 같아야 한다. | 다른 리스 취득 또는 성공한 저장의 토큰 무효화 뒤에는 CONTRACT_BUSY. 생성한 draft 취소를 best-effort 시도하며 이 ref로 send를 호출하지 않는다. |
| 외부 발송 | DB TX 밖에서 sendContract(ref). 그 전에 ref는 영속되어 있다. | 응답/네트워크 오류면 ref·prepared 보존, 자기 리스 반납. 외부 성공 여부는 불명확하며 재시도는 기존 ref부터 조회한다. |
| 로컬 sent 커밋 | confirmCreated TX에서 awaiting + claimedAt CAS로 ref·status·sentAt·origin·렌더 snapshot을 sent_document에 쓰고 참여자·감사·알림도 함께 쓴다. | 중간 실패는 전체 롤백되어 awaiting+ref+prepared가 남는다. CAS 패배는 현재 상태/ref에 따라 best-effort 보상 취소 또는 기존 바인딩 보존으로 처리한다. |
| 웹훅·폴링·복구 | 웹훅은 서명 검증 뒤 ref로 provider를 재조회한다. 폴링도 같은 reconcile을 사용한다. 재시도의 bindDispatchedContract는 현재 prepared를 읽어 bindObserved로 발송을 원자 확정한다. | cron 대상은 sent/in_progress이며 awaiting은 자동 발송 복구 대상이 아니다. **미수정:** 일반 reconcile은 발송 확정 전 상태만 바꿀 수 있고, 오래된 in_progress patch는 종결 상태를 덮어쓴다. |

핵심 위치(모두 `lib/server/` 아래): `services/agreement.ts:63,222`, `repositories/drizzle/agreement.ts:122`, `services/signing-dispatch.ts:563,790`, `services/signing-sent-commit.ts:105,154`, `repositories/drizzle/signing-contract.ts:419`, `services/signing-reconciliation.ts:63,416`.

문서/주석과 코드의 차이:

- `LONG_TERM_AGREEMENT_ROLLOUT.md:27`의 동일 문서·ref 원자 기록은 sent 커밋 자체에 대해서는 맞다. 그 전에 prepared/ref가 다른 작업에서 조합되거나 reconcile이 상태만 바꾸는 경로까지 보호하지는 않았다.
- `AgreementService.prepare`의 “Once prepared”는 메모리 snapshot에는 성립하지만 저장 행을 불변으로 만드는 제약은 없다.
- ref NULL CAS는 다른 ref의 덮어쓰기를 막을 뿐 리스 소유권을 증명하지 않았다. 이번 수정은 공통 합의서에 그 조건을 추가한다.
- rollout의 “미발송 초안이면 최신 미리보기를 요구”는 일반 recover stamp 흐름에 성립한다. 원래 stamp를 일회성으로 폐기하는 코드는 없다. 아래 지연 경로는 원래 stamp의 재전송을 전제로 한다.

### A. 입증·수정: 만료된 생성 결과가 다른 prepared와 결합

진입점은 선정 PG의 sendAgreementAction과 저장 액션이다. 같은 사람의 두 탭만으로도 성립한다. 미선정 권한, DB 변조, 관리자 권한은 필요 없다.

1. A가 D1(구매사 상호 `계약상호`)을 확인하고 발송한다. 리스 취득 → prepared D1 → 렌더 후 외부 생성 응답을 기다린다.
2. 리스가 만료된다. B가 revision 1로 상호 `새 계약상호`를 저장하여 revision 2가 된다. B가 발송을 시작해 D2를 prepared에 쓴 뒤 업로드 세션 단계에서 실패하고 리스를 반납한다.
3. A의 생성 응답이 돌아온다. 수정 전 bindDraftRef는 ref NULL만 보고 D1의 ref를 받아들여 A가 D1을 외부로 발송한다.
4. 발송 응답이 유실되어 sent 커밋은 실행되지 않는다. awaiting + D1 ref + D2 prepared가 남는다.
5. 결과 확인 재시도가 D1 ref의 pending을 관측하고, 현재 D2 prepared를 sent_document로 확정한다.

최초 재현의 실제 실패는 `expected '계약상호', received '새 계약상호'`였다. 외부로 전달한 PDF 입력은 A이고 B는 외부 업로드에 도달하지 않았는데 보낸 문서 기록은 B다. PDF/외부 효과는 mock이며 서비스·Drizzle·PGlite 상태 전이를 실행했다.

최종 회귀는 올바른 경계인 **3번에서 차단**을 요구한다. B가 준비 후 실패한 경우와 **저장만 한 경우** 모두 수정 전 CONTRACT_BUSY 대신 SNOWSIGN_NETWORK를 반환하며 RED였다(외부 send까지 도달). 수정 후 A send 0회, A draft 취소 시도, B prepared 보존, B 재시도의 정상 발송·snapshot 일치까지 GREEN이다. 저장만 한 경우도 필요한 이유는 saveDraft가 prepared를 지우면서 A의 만료된 토큰은 그대로 남겼기 때문이다.

단일 HTTP 요청이 5분 걸린다는 가정은 사용하지 않는다. 최종 테스트는 실제 서비스의 이전 발송 실패로 남은 draft ref와 유효한 원래 stamp를 만든 뒤, 다음 시간으로 Date만 전진시킨다.

| A의 호출 | 해당 구간 | 리스 취득 후 누적 |
|---|---:|---:|
| 기존 draft 조회 | 75초 | 75초 |
| 기존 draft 취소 | 75초 | 150초 |
| prepare | 이때 유효 리스 확인 | 150초 |
| 업로드 세션 생성 | 75초 | 225초 |
| PDF 업로드 | 50초 | 275초 |
| 새 계약 생성 | 26초 | 301초 |

클라이언트는 시도당 15초, 429 재시도 3회 및 최대 10초 대기로 API 호출당 최대 약 90초를 허용하고 업로드는 60초 제한이다. 개별 구간은 코드의 예산 안에 있고 전체 dispatch deadline/heartbeat는 없다. 따라서 금지된 타임아웃을 가정하지 않은 도달 가능한 시간 창이다. **실제 SnowSign이 이 지연/429 조합을 발생시켰다는 관측은 아니다.** 순서는 deferred promise로 제어하며 sleep은 없다. 코드: `signing/snowsign-client.ts:513,550,563,573`, `signing/upload-bytes.ts`.

기존 테스트는 활성 리스의 저장 거부, 낡은 stamp, 단독 응답 유실 복구를 검증했지만 생성 응답 보류 중 리스 만료 → 성공한 저장 → 다른 prepared → 늦은 바인딩을 연결하지 않았다.

잠금 근거도 실제 PostgreSQL에서 확인했다. `2026-10-02-agreement-postgres-locks.ts`는 격리 tmpfs 컨테이너·랜덤 loopback 포트에서 실제 Drizzle 저장소를 호출한다. barrier와 pg_blocking_pids로 상대 작업의 transactionid lock 대기를 확인한 뒤 해제했다.

- B save 선행: A bind가 B를 기다림 → B revision 2/token NULL 커밋 → A bind false, ref NULL.
- A bind 선행: B save가 A를 기다림 → A ref 커밋 → B save 거부, D1 prepared/revision 1 유지.

PostgreSQL 16.14, read committed에서 둘 다 통과했다. 이 두 저장소 연산의 직렬화 검증이며 관리자 요율 경합·모든 서비스 경합·외부 SnowSign 실측으로 확장하지 않는다. 테스트 컨테이너는 삭제했다.

### B. 입증·미수정: 선착 웹훅이 문서·참여자를 누락

1. A가 prepared/ref를 저장하고 외부 발송한다. 응답은 대기 중이다.
2. B(웹훅)가 같은 ref를 재조회해 in_progress 또는 completed를 받는다.
3. reconcile은 참여자 0명·sent_document 없음인 상태에서 상태만 전이한다.
4. A의 confirmCreated는 awaiting CAS에 실패한다. 같은 ref의 진행/완료 계약이므로 보상 취소도 생략한다.
5. 문서·참여자는 누락되고 AgreementService.load는 legacy로 판정한다. 통상 재시도는 ALREADY_SENT 게이트에 막힌다.

변형: 외부 성공 직후 참여자 insert 실패로 로컬 TX가 롤백된 뒤 정상 웹훅이 도착해도 같다. 테스트는 insert 한 번만 실패시켜 실제 롤백 후 확인했다. 빠른 서명/웹훅 역전이나 일시적인 DB 오류만 있으면 되며 공격자 권한은 필요 없다.

깨지는 불변식은 비순차 도착 시 문서·참여자 보존이다. 코드: `services/signing-reconciliation.ts:63,152`, `services/signing-sent-commit.ts:105`. 기존 테스트는 sent 커밋 후 웹훅을 호출하거나 응답 유실 후 웹훅 없이 self-heal만 호출했다. 새 reconciliation-race 파일의 세 예상 실패가 재현한다. **이번 패치로 해결하지 않았다.**

### C. 입증·미수정: 낡은 폴링이 완료 상태를 역행

1. 정상 발송된 합의서에서 A가 sent를 읽고 provider 조회를 기다린다.
2. B가 completed를 조회해 ensureFinalized를 커밋한다.
3. A가 앞선 시점의 in_progress 응답으로 돌아온다.
4. patchContract는 WHERE id만 사용하여 completed를 in_progress로 되돌린다.

코드: `services/signing-reconciliation.ts:152`, `repositories/drizzle/signing-contract.ts:325`. `TODOS.md:437`의 지적을 현 코드·일반 실패 테스트로 재확인한 뒤 it.fails로 보존했다. 완료 표시가 역행하며 다음 completed 관측에서 완료 처리·알림이 재진입할 여지가 있다. 기존 순차 멱등 테스트에는 두 조회의 완료 순서를 뒤집는 barrier가 없었다. **이번 패치로 해결하지 않았다.**

### 반례를 찾지 못한 경계

- **정상 리스 안의 동료 저장·발송:** 계약 행 잠금/revision CAS, 활성 lease/ref 저장 거부, prepare의 토큰·소유자·현재 stamp 재검증이 낡은 탭을 막는다. 이번 수정은 만료 뒤 생성 응답이 돌아오는 틈을 닫는다.
- **관리자 요율 변경:** admin-supporter-b `lib/server/actions/admin/agreementRates.ts:24`는 PG workspace FOR UPDATE → version CAS → rates/version 전체 upsert → 감사를 한 TX에서 처리한다. prepare도 같은 PG 행을 잠근다. 관리자가 먼저면 stamp 불일치, 준비가 먼저면 이전 판 전체가 snapshot에 고정된다. 선정 견적의 정상 submit/award도 RFP 잠금·상태 게이트를 거쳐 기존 선정 bid를 바꾸지 않는다. 교차 저장소 잠금 실측은 하지 않았다.
- **담당자 변경:** prepare 전후 캡처값이 다르면 name/email/phone 비교로 차단한다. 비교 후에는 snapshot 메타와 provider 수신자에 캡처값을 쓴다. PDF에는 회사·대표자 및 역할별 서명칸이 인쇄되고 개인 담당자 정보는 확인 화면·snapshot 메타·provider 수신자에 쓰인다. 대표자와 서명담당자의 동일성을 새 제품 요구로 만들지 않았다.
- **초안·공급자 ID 노출:** context ACL은 구매사/선정 PG로 제한한다. 발송 전 구매사에는 parties/signers/stamp/snapshot을 반환하지 않아 PDF 라우트도 403이다. 구매사의 signing 응답은 서비스에서 providerRef와 template ID를 제거한다. 이 경계와 PDF 결정성의 기존 세 파일 27개 테스트도 통과했다.

## 수정한 파일 및 검증 결과

- `lib/server/services/signing-dispatch.ts`: 공통 합의서 바인딩에 발송 토큰 전달.
- `lib/server/repositories/types.ts`, `drizzle/signing-contract.ts`: bindDraftRef의 토큰 CAS 옵션·DB 조건.
- `lib/server/repositories/drizzle/agreement.ts`: 성공한 만료 후 저장의 토큰/소유자 무효화.
- `lib/server/services/__tests__/agreement-expired-lease.test.ts`: 두 회귀, 누적 시간·barrier·A send 미호출 및 B 문서 발송.
- `lib/server/services/__tests__/agreement-reconciliation-race.test.ts`: 독립 결함 네 예상 실패와 레거시 완료 복구 한 정상 테스트.
- `lib/server/repositories/drizzle/__tests__/signing-contract.test.ts`: A 만료 → B 리스 재취득 → A bind 거부·반납 뒤 B 리스 보존 → B bind 성공의 추가 회귀.
- `docs/audits/2026-10-02-agreement-postgres-locks.ts`: 실제 PostgreSQL 양방향 잠금 재현.
- 이 문서: 단계별 표·반례·근거·한계.

| 검증 명령/범위 | 결과 |
|---|---|
| `rtk proxy pnpm test lib/server/services/__tests__/agreement-expired-lease.test.ts` | RED: 두 건 모두 CONTRACT_BUSY 대신 SNOWSIGN_NETWORK. GREEN: 2 passed. |
| `rtk proxy pnpm test lib/server/repositories/drizzle/__tests__/signing-contract.test.ts` | 추가 회귀의 바인딩 구현을 수정 전으로 되돌려 RED(`expected false, received true`) 확인 후 복원. GREEN: 61 passed. |
| 관련 agreement/send/lease/sent-commit/repository/새 경합 8파일 | 106 passed, **4 expected fail**. |
| `rtk proxy pnpm exec tsx docs/audits/2026-10-02-agreement-postgres-locks.ts` | PostgreSQL 16.14 실제 repo 두 순서 모두 통과, 컨테이너 삭제. |
| `rtk proxy pnpm tsc --noEmit` | 통과. PostgreSQL 스크립트 추가 후에도 통과. |
| `rtk proxy pnpm lint` | 통과. 추가 PostgreSQL 스크립트의 ESLint도 통과. |
| `rtk proxy pnpm test -- --maxWorkers=4` | 감사 종료 시 exit 0. 812파일 통과·1파일 skip, **8,252 passed · 4 expected fail · 3 skipped** (201.35초). 위 추가 회귀 이전 결과이며 이후 최종 트리 검증은 PR에 기록한다. 예상 실패는 위 B/C의 미해결 재현이다. |

## 남은 위험·가정·미검증 경계

1. **웹훅 선착/커밋 실패의 문서 유실과 종결 상태 역행은 재현된 미해결 결함이다.** B/C를 이번 수정의 보호 범위로 해석하면 안 된다. 기존 손상 행도 자동 복구하거나 운영 데이터를 백필하지 않았다.
2. **바인딩 이후 리스 만료·프로브·clear 경합:** A가 ref 저장 후 send 중 멈추고 B가 재취득하여 draft를 조회하면 clear/cancel 경로로 갈 수 있다. clearDraftRefIf는 expected ref와 awaiting만 검사한다. draft 관측 뒤 이전 send가 늦게 성공할 수 없는지는 외부 보장이 필요하다. 로컬의 clear 소유권 검증·미확정 시도/ref 이력 보존은 개선할 수 있지만 원격 중복 방지는 provider 멱등성/취소 순서 보장이나 운영 대사 없이는 완결할 수 없다.
3. **생성 응답 유실:** externalId는 전달하지만 create 멱등성 키라는 근거는 없다. ID를 못 받으면 재시도에서 원격 초안이 추가될 수 있다. 초안 중복과 실제 서명 요청 중복을 구분해야 하며 관측·운영 복구가 필요하다.
4. **취소·재발송:** 로컬 active→canceled CAS는 동시 상태 변경을 제한하지만 cancel 실패가 로컬 canceled를 되돌리지는 않는다. resend는 새 라운드를 열 수 있다. 이전 원격 계약의 종결이나 send/cancel의 원자 순서는 미검증이다. 이번 회귀도 취소 시도만 확인하며 외부 취소 성공을 보장하지 않는다.
5. **거절/취소된 미확정 발송:** awaiting+ref에서 원격 declined/canceled/expired를 관측하면 ref 정리·재작성 경로를 탄다. 원래 prepared의 발송 이력을 영구 보존한다는 보장은 없다.
6. **검증 범위:** 서비스 경합은 PGlite와 provider/PDF mock이다. 실제 PDF 결정성·글리프 관련 기존 테스트와 실제 PostgreSQL save/bind 잠금은 별도로 실행했다. 실제 SnowSign 발송·취소·지연 분포, 관리자와 앱 사이의 PostgreSQL 잠금, 모든 취소/재발송 조합의 자동 재현은 수행하지 않았다.

외부 근거는 원문 사본 `docs/SNOWSIGN_API.md:583`(send_immediately 생략 시 draft), `:587`(send), `:612`(cancel), `:1155`(상태 의미), 과거 실측 `docs/SNOWSIGN_SANDBOX.md:142`(웹훅 수신), `:205`(draft 취소 HTTP 200)다. 생성/발송 멱등성·조회 선형화·동시 취소의 현재 보장을 대신하지 않는다. 임베드 세션의 external_id 중복 방지 실측을 createContract 멱등성으로 전용하지 않았다.

지침·스킬: AGENTS.md의 심링크 대상 CLAUDE.md를 센티널까지 읽었고 `/investigate`, `superpowers:test-driven-development` 본문 및 writing-good-tests를 읽었다. TDD 스킬은 기본 목록에는 없었으나 로컬 superpowers 6.4.1 캐시에서 찾았다. 인접 admin-supporter-b에는 AGENTS.md/CLAUDE.md를 발견하지 못했고 읽기 전용으로 조사했다.
