# ADR 0001 — 배포 아키텍처: 단일 Always Free VM 자체 호스팅

- **상태**: Accepted (2026-05-21)
- **결정자**: yeonseong
- **관련 산출물**: [`docs/DEPLOY_OCI.md`](../DEPLOY_OCI.md) (실행 런북), `docker-compose.prod.yml`, `ecosystem.config.cjs`, `deploy/Caddyfile`, `scripts/deploy/*`

## 컨텍스트

v0 비공개 1:N RFP 플랫폼(buyer ↔ PG)을 처음 운영 환경에 올린다. **최우선 가치는 비용 최소화**(월 $0 지향). 트래픽은 초대 기반 소수 사용자(구매사 + PG 영업담당) 규모로 낮다.

배포 방식 선택을 강제하는 **앱-특화 제약**은 다음과 같다. 모두 코드에서 확인됨:

1. **SSE 상시 연결** — 인앱 알림이 `app/api/notifications/stream/route.ts`(`runtime='nodejs'`)의 long-lived 스트림이다. 장기 연결을 유지할 **상시 실행 서버**가 필요하다.
2. **첨부 = Postgres bytea** — 파일 바이트가 `attachment_blobs` 테이블에 저장되고 `app/api/files/[id]`가 DB에서 직접 서빙한다(외부 오브젝트 스토어 없음 — 의도된 설계, CLAUDE.md). DB 용량이 첨부와 함께 증가한다.
3. **Node 런타임 필수** — Auth.js v5(bcrypt) + Drizzle/postgres-js. 순수 edge 경로가 없다(`runtime='nodejs'` 일괄).
4. **상태 보존 Postgres 필수** — stateful.

## 결정

**단일 OCI Compute Ampere A1(Always Free) 인스턴스에 자체 호스팅한다.**

- 앱: 네이티브 **Node 22 + PM2**(`next start`, fork 1) — 상시 서버
- DB: 같은 인스턴스의 **Postgres 16 Docker** 컨테이너, `127.0.0.1`만 바인딩
- TLS/프록시: **Caddy**(Let's Encrypt 자동 발급/갱신), 80→443, 443→127.0.0.1:3000
- 백업: nightly `pg_dump` → **OCI Object Storage**(Always Free 10GB) — 이 아키텍처의 유일한 치명적 실패모드를 막는 안전망
- 리전: **ap-chuncheon-1 / ap-seoul-1**(KR 지연 최소화)
- 비용: **월 $0**(+도메인 ~$1/mo). Resend·Sentry 무료 티어.

## 검토한 대안

비용 최소화 기준으로 원점에서 3안을 비교했다.

| | A. Always Free VM (채택) | B. PaaS/서버리스 | C. 저가 유료 VM |
|---|---|---|---|
| 월 비용 | **$0** | $20~45 | $5~7 |
| SSE 상시연결 | ✅ | ❌ 함수 실행시간 제한 | ✅ |
| bytea 첨부 | ✅ 블록스토리지 = 싼 용량 | ❌ 무료 DB 0.5GB 초과 | ✅ |
| 상업 이용 | ✅ | ❌ Vercel Hobby 비상업 전용 | ✅ |

### B. PaaS/서버리스 (Vercel + 관리형 Postgres) — 기각

비용 최소화에서 **더 비싸면서 동시에 기능적으로도 부적합한** 드문 케이스다:

1. **SSE** — Vercel 함수는 long-lived 스트림에 부적합/고비용. 상시 서버가 맞다.
2. **bytea 첨부** — Neon/Supabase 무료 DB 용량(~0.5GB)을 첨부가 금방 초과. 늘리면 유료(≈$19~25/mo). bytea를 오브젝트 스토어로 옮기는 건 의도된 앱 설계를 바꾸는 별개 작업이라 범위 밖.
3. **상업 ToS** — Vercel Hobby는 비상업 전용. 상업 제품은 Pro($20/mo~) 강제 → "무료" 불성립.

### C. 저가 유료 VM (Hetzner / DigitalOcean) — 폴백으로만 채택

아키텍처는 A와 동일(상시 Node + 같은 노드 Postgres)하므로 제약은 모두 만족한다. 다만 유료이고 Hetzner는 EU 리전이라 KR 지연이 있다. **A1 용량(`Out of host capacity`) 확보가 끝내 실패할 때의 유료 폴백**으로만 의미가 있다(월 $5~7).

> 그 외: GCP e2-micro 무료는 1GB·US 전용으로 너무 약하고, AWS 프리티어는 12개월 한정, Fly.io 무료 할당은 축소됨. 무료 상시 VM은 OCI A1이 사실상 유일한 합리적 선택.

## 결과 (Consequences)

**장점**
- 월 $0로 모든 앱 제약(SSE·bytea·Node 런타임·stateful DB)을 충족.
- 첨부가 DB에 있어 **DB 덤프 1개 = 전체 백업** — 백업이 단순.

**단점 / 리스크와 완화**
- **단일 노드 SPOF** — v0엔 수용. RTO/RPO는 백업 주기(nightly)로 정의. → §완화: 백업 1급화.
- **모든 상태가 부트볼륨 1곳** — 가장 큰 리스크. → nightly `pg_dump → Object Storage` + OCI 부트볼륨 자동 백업(2중). 복구 리허설 문서화.
- **A1 용량 추첨** — → AD 변경/오프피크 재시도, 최후엔 x86 micro 또는 C안(유료 VM) 폴백.
- **x86 micro 폴백 시 빌드 OOM**(1GB+bytea+Sentry 소스맵) — → GitHub Actions(무료)에서 빌드 후 `.next` 아티팩트만 rsync, 온박스 재빌드 회피.
- **단일 인스턴스 관측 사각** — → PM2 logrotate + 무료 uptime 핑(UptimeRobot/curl cron).
- **SSE 헤드룸** — fork 1개로 동시 수천 연결까지 v0엔 충분. 재시작 시 전 연결 끊김(클라이언트 EventSource 자동 재연결로 흡수). 클러스터 확장 시엔 Postgres LISTEN/NOTIFY 등 공유 버스 필요(현재 YAGNI).

## 향후 재검토 트리거

다음 중 하나가 발생하면 이 결정을 다시 본다:
- 동시 사용자/SSE 연결이 단일 fork 헤드룸을 위협
- 첨부 누적으로 부트볼륨 용량 압박 → 첨부를 Object Storage로 분리하는 앱 변경 검토
- 가용성 SLA 요구 → 다중 노드 + 관리형 Postgres로 이행
