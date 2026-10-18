# CS 보안 스캔 후속 조치 — 2026-10-18

대상: `0.39.0.1`, `fix/security-scan-completion`. 원본 작업을 보존한 별도 worktree에서 수정했다. 운영 배포와 운영 DDL 적용은 별도다.

## 범위와 판정

저장된 두 스캔 `68b59536-2f59-458d-a99c-edb35aac6d42`, `d28c1ea3-c658-470a-a0e9-b92aeca278b3`의 추적 목록은 중복 통합 후 28건이다. 원본 보고서의 occurrence/별칭은 더 많으므로 개수를 취약점 수로 합산하지 않는다. 아래는 구현 상태이며 CS 재검증 결과와 실제 실행한 검사는 뒤에 별도로 기록한다.

| Finding ID | 항목 | 처리 |
|---|---|---|
| `csf_1aa77dbce7271387b7401ca3` | Fresh SnowSign contract IDs can be rebound to a different buyer deal | 당사자 경계 수정 + 사용자 수용 잔여 위험 |
| `csf_0730c08957a2c7ee2c4edd25` | Embed contracts can complete without the buyer signer or required identity verification | 수정 · CS 재검증 fixed |
| `csf_57c464daed482fd8b7a53908` | The public Auth.js credentials callback bypasses the login throttle | 수정 · CS 재검증 fixed |
| `csf_aa67308652c62db31957365a` | Concurrent login failures evade the ten-attempt lock through lost updates | 수정 · CS 재검증 fixed |
| `csf_46d2153682bcc08de8615ce6` | Concurrent OTP sends bypass the per-phone SMS limit | 수정 · CS 재검증 fixed |
| `csf_0ea571f9fc118d151789fb27` | Realtime subscriptions ignore token workspace and effective membership state | 수정 · CS 재검증 fixed |
| `csf_3cd9c88ff480a5ead5827ecf` | Anonymous guest drafts can outpace bounded cleanup and leave permanent tombstones | 수정 · CS 재검증 fixed |
| `csf_dc7d4ff79b6eaacb44cb6495` | Authenticated users can create unlimited permanent unclaimed attachments | 수정 · CS 재검증 fixed |
| `csf_a839f4bb11c7d1feab3a20ca` | Guest-draft retention can permanently pin attacker credentials to a victim email | 수정 · CS 재검증 fixed |
| `csf_99d3508caf5cafa44b5cb2c7` | Victim email verification can activate attacker-chosen credentials | 수정 · CS 재검증 fixed |
| `csf_5cf88f9c26cfe82d0087509e` | A provider webhook can outrun the sent commit and permanently drop signing evidence | 수정 · CS 재검증 fixed |
| `csf_317891d92b51b1451c99ab2e` | Verified phone OTP receipts remain reusable indefinitely | 수정 · CS 재검증 fixed |
| `csf_44764b56c7b98dd7c918160d` | Workspace administration commits after concurrent admin revocation | 수정 · CS 재검증 fixed |
| `csf_53a95468e877cf94c0973e6f` | Pending PG members can search approved-workspace bid records | 수정 · CS 재검증 fixed |
| `csf_c25a075f2d28960e24d6d192` | Business-profile replacement commits after buyer-admin revocation | 수정 · CS 재검증 fixed |
| `csf_c54af8d978382df5f0d36507` | Signing webhook buffers up to 25 MB before authentication | 수정 · CS 재검증 fixed |
| `csf_6d45bbabc4887aa6bbfac75d` | Sentry telemetry can capture the full Slack webhook credential | 수정 · CS 재검증 fixed |
| `csf_db87ff9fdd3b0006e0e65b5c` | Public guest telemetry permits unbounded durable identities and Slack work over time | 수정 · CS 재검증 fixed |
| `csf_24e6c4b79f2b2b038fe6c1d5` | Public signup actions disclose registered email addresses | 완화 + 사용자 수용 잔여 위험 |
| `csf_71f7e109c4e4ec9c67a71f5c` | The public Axiom relay has no request-body deadline | 수정 · CS 재검증 fixed |
| `csf_8d6af61283768bf04e7a7db8` | Upload completion is not bound to the issuing workspace | 수정 · CS 재검증 fixed |
| `csf_1f567ba512e8d3367ce911ce` | Completed signing downloads omit the live PG approval gate | 수정 · CS 재검증 fixed |
| `csf_14360cbc3b90ae2ee7413576` | The public subscribe-proxy callback fails open when its secret is absent | 수정 · CS 재검증 fixed |
| `csf_ed1610e35a28b1ceafb2147b` | The unauthenticated Axiom relay has no aggregate rate limit | 수정 · CS 재검증 fixed |
| `csf_0de46718927a9a2a2c82ec4b` | Recipient email addresses and message metadata are copied into Sentry and Axiom | 수정 · CS 재검증 fixed |
| `csf_76a507208bbf67af4cc8e834` | Master authority is derived from email without retaining Google authentication provenance | 수정 · CS 재검증 fixed |
| `csf_50067129b9e1c7beaf34a43d` | A stale provider read can resurrect a terminal signing contract | 수정 · CS 재검증 fixed |
| `csf_b3b8bd1f51f2c51a3b491e72` | Channel.io identity proofs survive application session revocation | 완화 + 사용자 수용 잔여 위험 |

## 변경과 회귀 근거

- 인증: Auth.js 직접 callback과 로그인 액션에 같은 원자적 예산을 적용했다. 전화번호 발급과 비교 시도, 이메일 코드 비교도 원자적으로 제한한다. 전화 인증 proof는 용도·사용자·만료·단일 소비를 검증한다. `credentials-callback-rate-limit.test.ts`, `login-attempt.test.ts`, `sendPhoneOtp.test.ts`, `verifyPhoneOtp.test.ts`, `auth.test.ts`가 검증한다.
- 가입: 기존 미인증 계정의 초안이 공격자 비밀번호를 고정하지 않으며 이메일 인증은 발급 당시 주체와 현재 세션이 맞아야 한다. 활성화 시 기존 세션을 폐기한다. `guest-signup.test.ts`, `verifyFlipsEmailVerified.test.ts`가 검증한다.
- 전자서명: 관측·영속 참여자의 구매사/승인 PG 및 본인인증을 재검증한다. 조기 웹훅은 미완성 참여자 상태를 권위 상태로 승인하지 않고 후속 조회로 회복한다. 완료·취소 상태를 늦은 진행 응답으로 되돌리지 않는다. `contract-signing.test.ts`, `signing-sent-commit.test.ts`, `contract-archive.test.ts`, `agreement-reconciliation-race.test.ts`가 검증한다.
- 권한: 관리자 쓰기는 트랜잭션에서 권한을 다시 읽고 잠근다. 검색·문서 다운로드·실시간 구독은 현재 workspace와 PG 승인을 확인한다. 운영계정은 Google 로그인 출처를 요구한다. `workspace.test.ts`, `searchEntities.test.ts`, `download-handler.test.ts`, `presence-access.test.ts`, `master-login.test.ts`가 검증한다.
- 자원: 첨부 완료는 발급 workspace에 고정하고, 미연결 첨부·익명 초안·파일·이벤트는 DB 잠금 아래 총량을 제한한다. 삭제 실패분도 예산에 남긴다. `attachment-adapter.test.ts`, `archive-adapter.test.ts`, `guest-drafts.test.ts`, `guest-rfp.test.ts`가 검증한다.
- 수집 경계: 웹훅/Axiom 본문 크기·시간·전체 요청 예산, Centrifugo 비밀값 필수, 관측 로그 개인정보와 Slack 비밀 URL 마스킹을 적용했다. 각 route 테스트와 `scrubber.test.ts`, `logger.test.ts`가 검증한다.

## 사용자 수용 잔여 위험

- 가입 이메일 즉시 중복 안내는 유지한다. 분당 IP 60회·전체 300회 제한은 대량 조회를 완화하지만 저속 조회를 완전히 막지 않는다.
- 채널톡 상담 연동은 유지한다. 폐기된 세션에 새 memberHash를 발급하지 않으나 과거 발급된 고정 HMAC 값은 앱 세션과 독립적이다. 실제 유출 때 공급자 콘솔/서버 키 교체가 필요하다.
- 동일 당사자 간 다른 견적의 임베드 계약은 공급자 상관키 부재로 구분할 수 없는 경우가 있다. 당사자·본인인증 게이트를 유지하며 잔여 위험을 수용한다.
- 세 항목은 오탐이나 완전 해결로 분류하지 않는다. 상세 운영 경계는 [THREAT_MODEL §8](../THREAT_MODEL.md#8-cs-scan-후속-경계-2026-10-18).

## 배포 선행 조건

[Lightsail 런북](../DEPLOY_LIGHTSAIL.md)의 `20261018-phone-otp-proof.sql`, `20261018-upload-workspace.sql`을 앱 교체 전에 적용한다. 기존 미완료 전화 인증 및 workspace 미지정 업로드는 다시 시작해야 한다. 운영계정의 이전 비밀번호 세션은 Google 재로그인이 필요하다. Centrifugo와 앱의 proxy secret을 함께 설정한다.

## 검증 기록

- 전체 Vitest: 861개 파일 통과, 1개 파일 skip; 8,748개 테스트 통과, 3개 skip. 실패 0건.
- 이후 추가한 참여자 상태 경합: 먼저 signed → viewed 역행을 RED로 재현, DB 조건 추가 후 서비스/리포지토리 66개 테스트 GREEN. CS도 이 항목을 fixed로 재확인했다.
- TypeScript, 전체 lint, 변경 파일 lint, git diff --check 통과. webpack 프로덕션 빌드 통과.
- CS 개별 재검증: 26건 중 첫 판정 fixed 24건/잔여 2건. 참여자 경합 추가 수정 후 fixed 25건. 원계약 상관관계는 사용자 결정으로 잔여 위험을 수용했다. 이메일 조회·채널톡을 포함한 3건은 완전 해결이 아니다.
- 브라우저: 견적 작성·로그인·첨부 재시도·쿼터 표시·업종 재검증·PG 차단·관리자 권한 6건 통과. 신규·갱신 가입 및 다른 기기 복원 2건은 전용 포트(3317)의 `next start` 프로덕션 서버에서 모두 통과(41.4초). 총 8개 시나리오를 확인했다. dev 서버의 반복 재빌드 중 화면 초기화로 실패했던 신규 복원은 프로덕션 서버에서 재현되지 않았다.
- 외부 SMS/R2 전송은 기존 E2E stub을 사용했고 인증·가입·소유권·복원은 별도 로컬 PostgreSQL에서 실행했다. 운영 DB/스토리지·키 교체·배포는 수행하지 않았다.
- 원본 CS 개별 판정과 참여자 경합 후속 판정은 [검증 JSON](2026-10-18-cs-verification.json)에 보존했다. `finding-N`의 원본 ID는 `inputFindingIds` 순서로 대응한다.

### 원계약 상관관계 — 사용자 수용

당사자/본인인증 게이트는 잘못된 구매사와 제3자를 거부하지만, 공급자가 `external_id`를 반환하지 않으면 같은 당사자 간 다른 견적의 계약을 구분할 수 없다. CS는 이를 `still_vulnerable`로 판정했다. 사용자는 당사자·본인인증 검증을 유지하고 동일 당사자 사이 오연결 위험을 수용했다(2026-10-18). 임베드·복구 흐름은 유지한다.

`cs verify-fix --scan`은 저장된 원래 checkout을 우선하므로 그 실행 결과는 이 worktree의 최종 증거로 사용하지 않았다. 원본 finding을 개별 파일로 전달하여 출력의 repository가 이 worktree인지 확인했다.
