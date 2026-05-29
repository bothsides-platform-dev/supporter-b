# ADR 0002 — 배포 아키텍처: Vercel (icn1)

- **상태**: Accepted (2026-05-29) — supersedes [ADR 0001](./0001-deployment-architecture.md)
- **결정자**: yeonseong
- **관련 산출물**: [`vercel.json`](../../vercel.json) (region 고정)

> **갱신 (2026-05-30)**: OCI 자산을 폴백으로 보존하던 결정을 뒤집고 **전부 제거**했다. Vercel 로 완전 전환돼 자체호스팅 폴백이 더는 필요치 않다는 판단. 삭제 대상: `docker-compose.prod.yml`, `ecosystem.config.cjs`, `deploy/Caddyfile`, `scripts/deploy/*`(`bootstrap.sh`/`deploy.sh`/`oci-a1-retry.sh`), `.env.production.example`, `docs/DEPLOY_OCI.md`. 자체호스팅 결정의 역사적 맥락은 [ADR 0001](./0001-deployment-architecture.md) 에만 남는다. 재호스팅이 필요해지면 git 히스토리에서 복원.

## 컨텍스트

[ADR 0001](./0001-deployment-architecture.md) 은 비용 최소화($0)를 위해 단일 OCI Always Free VM 자체 호스팅을 채택했다. 그러나 **실제 라이브 배포는 Vercel** 로 운영되고 있다 (`vercel.json` 존재, `regions: ["icn1"]`). 당시 OCI 런북(`docs/DEPLOY_OCI.md`, 이후 제거됨)이 운영 현실과 어긋나 있어, 에이전트·기여자가 잘못된 OCI 런북을 현행으로 오인하는 문제를 바로잡는다.

이 ADR은 **현 운영 환경을 사실대로 기록**하는 것이 목적이다.

## 결정

**Vercel 에 배포한다.**

- 플랫폼: **Vercel**
- 리전: **`icn1`(서울)** 로 고정 — `vercel.json` 의 `regions`. 미지정 시 `iad1`(US-East)에서 실행돼 KR 지연이 커지므로 명시 고정이 필수다.
- DB: postgres-js (`DATABASE_URL`) — provider 는 레포에 고정돼 있지 않음(환경변수로 주입).
- OCI 자산(`docker-compose.prod.yml`, `ecosystem.config.cjs`, `deploy/Caddyfile`, `scripts/deploy/*`, `docs/DEPLOY_OCI.md`)은 **제거**한다 (위 2026-05-30 갱신 참조). 자체호스팅이 다시 필요하면 ADR 0001 의 맥락 + git 히스토리에서 복원한다.

## 트레이드오프 (ADR 0001 의 제약 재확인)

ADR 0001 은 Vercel 을 기각하며 세 가지 앱-특화 제약을 들었다. 서버리스 모델로 옮긴 지금 이 제약들이 어떻게 충족되는지는 **현 인프라 기준으로 검증·유지해야 한다**:

1. **SSE 상시 연결** — `app/api/notifications/stream/route.ts` 의 long-lived 스트림은 서버리스 함수 실행시간 한도와 충돌할 수 있다. 함수 maxDuration / 스트리밍 동작을 확인할 것.
2. **첨부 = Postgres bytea** — `attachment_blobs` 용량이 DB 플랜 한도를 넘지 않는지 모니터링.
3. **Node 런타임** — 라우트는 `runtime='nodejs'` 일괄이므로 edge 강제는 없다.

## 향후 재검토 트리거

- SSE 함수 타임아웃 / 첨부 용량 압박이 실측되면 자체 호스팅(ADR 0001 폴백) 또는 첨부 오브젝트 스토어 분리를 재검토한다.
