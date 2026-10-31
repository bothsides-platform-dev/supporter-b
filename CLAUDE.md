# CLAUDE.md

서포트비는 `buyer`(구매사)가 견적을 요청하고 `pg`(결제대행사 영업담당)가 견적을 보내는 플랫폼이다. Next.js App Router·React·TypeScript·Drizzle/Postgres를 쓰며 패키지 매니저는 pnpm이다. 버전은 `package.json`, Node는 `mise.toml`에서 확인한다.

## 작업 원칙

- 사용자 언어로 답하고 명령·식별자는 원문을 유지한다. 기존 사용자 변경을 보존하고 요청 범위에 집중한다.
- 승인된 작업은 필요한 로컬 수정·worktree·검증·관련 실패 수정까지 진행한다. 통상적인 구현 선택은 저장소에서 해결하고, 의도가 결과를 크게 바꾸거나 승인 범위를 넘을 때만 묻는다. 기존 승인을 반복해서 묻지 않는다.
- 변경 동작과 위험에 맞춰 검증한다. TDD는 실패 재현이나 복잡한 규칙·경계 조건을 명확히 하는 데 도움이 될 때 적용한다. 상세 기준과 명령은 [작업 흐름](docs/agents/workflow.md)을 따른다.
- 사용자가 지정한 스킬은 적용하고, 그 외에는 작업에 도움이 될 때 선택한다. 완료 시 결과·실행한 검사·남은 장애를 알리고 관찰과 추정을 구분한다.

## 핵심 제품·보안 경계

- **봉인 입찰**: 구매사의 워크스페이스 ID allowlist(`rfp_allowed_pg`)가 입찰 자격을 통제한다. PG는 서로의 존재와 경쟁사 수를 볼 수 없으며 `Bid.competitorCount`는 의도적으로 없다.
- **공개 범위**: 오픈 게시판은 [공개 필드 화이트리스트](docs/agents/product-rules.md#공개-필드-화이트리스트)만 제공한다. `OpportunityListing` 필드 추가는 정보 공개 경계를 넓히는 제품 결정이다.
- **PG 비공개 필드**: `hidden_from_pg`는 `loadPgRfpDetail`의 `PG_STRIP`이 서버에서 fail-closed 제거한다. 화면에서 숨기는 것으로 대체하지 않는다.
- **서버 권한**: 화면 게이트는 쓰기 경계가 아니다. 워크스페이스·PG 승인 상태는 요청마다 DB에서 확인하고, 견적 접수 기간은 `BidService.submit`이 RFP 행 잠금 안에서 재검증한다.
- **신규 요청**: 업종별 관리자 정책으로 한 PG에 맞춤 상담을 요청한다. 게시판·추가 초대·참여 수락을 차단하고 기존 발송 1:N 견적은 보존한다.
- **신규 계약**: 당사자는 주식회사 노온과 구매사다. 선정 PG는 이용 대상·수수료 조건으로만 기록하고, 기존 `pg_buyer` 계약은 내부 보존하며 사용자 표면에서 숨긴다.

## 작업별 문서

해당 작업의 문서와 관련 절만 읽는다. 구현 동작은 코드·테스트로 확인하고, 제품·화면 결정은 아래 제품 규칙과 `SCREEN_DESIGN.md`의 확정 결정을 따른다. 확정 결정과 충돌하면 멈추고 묻는다. `docs/superpowers/**`는 과거 계획이므로 코드로 재확인한다.

| 읽을 때 | 문서 |
|---|---|
| 수정·검증·worktree·PR·CI·버전·문서 관리 | [작업 흐름](docs/agents/workflow.md) |
| 견적·공개 범위·PG 매칭·선정·계약 규칙 변경 | [제품 규칙](docs/agents/product-rules.md) |
| 라우트·인증·권한·호스트·SEO·별도 레포 연동 변경 | [라우팅](docs/agents/routing.md) |
| 액션·서비스·DB·알림·스토리지·실시간 변경 | [서버](docs/agents/server.md) |
| 화면·사용 흐름·라우트 추가 | [화면 설계](SCREEN_DESIGN.md) |
| UI·폼·토큰·타이포·색·모션 변경 | [디자인](DESIGN.md) — 공통 규칙과 §9 예외 확인 |
| 사용자에게 보이는 한국어 문구 작성 | [UX 문구](UX_WRITING.md) |
| 도메인 용어·이름·설계 결정 정리 | [용어집](CONTEXT.md), [도메인 문서 사용법](docs/agents/domain.md) |
| 신뢰 경계 변경 | [위협 모델](docs/THREAT_MODEL.md) — 같은 PR에서 해당 절과 AR-N 갱신 |
| 튜토리얼·코치마크 변경 | [튜토리얼](docs/agents/tutorial.md) |
| DDL·기능 플래그 배포 | [제품 규칙](docs/agents/product-rules.md)의 해당 런북 — 새 DDL은 앱 배포보다 먼저 적용 |
| 운영·스테이징 배포 | [Lightsail](docs/DEPLOY_LIGHTSAIL.md), [스테이징](docs/STAGING.md) |
| 로컬 설정·실행·비밀값 검사 | [README](README.md) |
| 이슈·스펙 게시·트리아지 | [GitHub Issues](docs/agents/issue-tracker.md), [라벨](docs/agents/triage-labels.md) |

## 진입점 유지

Claude Code는 이 파일을, Codex는 상대 심링크 `AGENTS.md → CLAUDE.md`로 같은 내용을 읽는다. **지침은 `CLAUDE.md`에서만 고친다.** `AGENTS.md`에 쓰면 원문을 덮어쓰거나 심링크를 사본으로 바꿀 수 있다. 공통 지침은 **8KiB 이하**로 유지하고 작업별 상세는 링크로 연결한다.

**Codex 절단 확인**: `project_doc_max_bytes` 상한에서 문서가 잘릴 수 있다. 마지막 줄이 `END`를 담은 HTML 주석 센티널인지 확인하고, 없으면 `rtk proxy cat "$(rtk proxy git rev-parse --show-toplevel)/CLAUDE.md"`로 원문을 다시 읽는다. 센티널 리터럴은 파일 끝에 한 번만 둔다. Claude Code는 뒤에 다른 지침을 붙이므로 이 검사를 건너뛴다.

<!-- CLAUDE.md: END -->
