# 배포 런북 — AWS Lightsail + Caddy (Amazon Linux 2023)

단일 Lightsail VM에 앱·DB·리버스프록시를 모두 올리는 **자체 호스팅** 경로다.

> **위치**: 이 문서가 **현행 라이브 배포 절차**다. 라이브 운영은 이 Lightsail 자체 호스팅으로 돌아간다.

## 아키텍처

```
인터넷 ──443──▶ Caddy (systemd, 자동 HTTPS/Let's Encrypt) ──┬─▶ 127.0.0.1:3000
                                                            │   Next.js (PM2: `next start`)
                                                            │         │
                                                            │   127.0.0.1:5432
                                                            │   Postgres 16 (docker compose)
                                                            │         ▲
                  /connection/* (wss 업그레이드) ───────────┴─▶ 127.0.0.1:8000
                                                                Centrifugo (docker compose)
                                                                  │ subscribe proxy
                                                                  └─(host.docker.internal)→ 앱 /api/centrifugo/subscribe
```

- **앱**: 네이티브 `next start`, PM2 가 감독 (`ecosystem.config.cjs`).
- **DB**: 같은 박스의 Docker Postgres (`docker-compose.prod.yml`), **`127.0.0.1` 에만 바인딩** → 외부 노출 없음. 앱은 `DATABASE_URL` 로 접속.
- **실시간(채팅)**: 같은 박스의 Docker Centrifugo (`docker-compose.prod.yml`, `deploy/centrifugo/config.yaml`), **`127.0.0.1:8000` 에만 바인딩**. 브라우저는 Caddy 의 `wss://<도메인>/connection/websocket` 로만 접속(직접 노출 없음). 앱은 `127.0.0.1:8000/api` 로 publish. 메시지 영속은 전적으로 Postgres(자사 보관) — Centrifugo 는 fanout 만, 아무것도 저장 안 함. 단일 PM2 fork → Memory engine, **Redis 불필요**(멀티노드 확장 시에만 Redis/Nats engine 도입).
- **프록시/TLS**: Caddy 가 도메인으로 Let's Encrypt 인증서를 자동 발급·갱신, 80→443 리다이렉트, 25MB 업로드 허용, `/connection/*` 를 Centrifugo 로 reverse_proxy(WS 업그레이드 투명 처리) (`deploy/Caddyfile`).
- **방화벽**: **Lightsail 콘솔 방화벽**만 사용. 호스트 방화벽(ufw/firewalld) 미설치 — 아래 §방화벽 참조.

## 사양 결정 (확정)

| 항목 | 값 | 근거 |
|---|---|---|
| OS | **Amazon Linux 2023** | glibc 2.34 → Node 22 공식 바이너리 네이티브 실행 (AL2의 glibc 우회 불필요) |
| 플랜 | **2GB RAM** ($10~12/mo) | 운영 ≈ DB 200MB + 앱 300MB + OS/Docker/Caddy 400MB ≈ 900MB, 여유 |
| swap | **2GB** | `next build` 피크(>1GB) 흡수. 2GB 박스라 thrashing 거의 없음 |
| 빌드 | **서버에서 직접** | bootstrap 후 deploy.sh 가 git pull→build. `--max-old-space-size=1536` 로 OOM 방지 |

## 사전 준비 (콘솔)

1. **Lightsail 인스턴스 생성**: 블루프린트 **Amazon Linux 2023**, 플랜 **2GB**. SSH 키 등록.
2. **고정 IP 연결**: Networking → Create static IP → 인스턴스에 attach (연결돼 있는 동안 무료).
3. **⚠️ 콘솔 방화벽 — 가장 흔한 함정**: 인스턴스 → **Networking → IPv4 Firewall** 에서
   - `SSH 22` (기본 존재 확인)
   - `HTTP 80` (기본 존재 확인 — Caddy ACME HTTP 챌린지/리다이렉트에 필요)
   - **`HTTPS 443` 추가** ← 이걸 안 열면 사이트가 안 뜬다.
4. **DNS**: 도메인 `A` 레코드를 위 **고정 IP** 로. (Caddy 시작 전에 전파돼 있어야 ACME 챌린지 성공.)
   - 확인: `dig +short your-domain.com` → 고정 IP 가 나와야 함.

## 서버 프로비저닝 & 첫 배포

```bash
# 1) SSH 접속 (Lightsail AL2023 기본 사용자: ec2-user)
ssh -i ~/Downloads/LightsailDefaultKey.pem ec2-user@<STATIC_IP>

# 2) 레포 클론
sudo dnf install -y git
git clone <REPO_URL> bidit && cd bidit
git checkout <배포브랜치>      # 예: main

# 3) 1회 프로비저닝 — swap, Node22(공식 바이너리), pnpm, Docker, PM2, Caddy(systemd)
bash scripts/deploy/lightsail-bootstrap.sh
#    Docker 그룹 반영을 위해 한 번 재접속(또는 `newgrp docker`).
exit && ssh -i ... ec2-user@<STATIC_IP> && cd bidit

# 4) Caddy 도메인 지정 후 기동
sudo sed -i 's/your-domain.com/<YOUR_DOMAIN>/' /etc/caddy/caddy.env
sudo systemctl enable --now caddy
sudo systemctl status caddy          # active (running) 확인. 인증서 발급 로그: journalctl -u caddy -f

# 5) 운영 환경변수
cp .env.production.example .env.production
$EDITOR .env.production               # 아래 §환경변수 참조

# 6) 빌드 + 릴리스
bash scripts/deploy/lightsail-deploy.sh

# 7) 재부팅 후에도 살아남게
pm2 startup                           # 출력된 sudo 명령을 그대로 실행
pm2 save
```

## 환경변수 (`.env.production`)

`.env.production.example` 를 채운다. 핵심:

- `DATABASE_URL` — 같은 박스 Postgres: `postgresql://supporter_b:<POSTGRES_PASSWORD>@127.0.0.1:5432/supporter_b`
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — `docker-compose.prod.yml` 가 읽음. `DATABASE_URL` 의 자격증명과 **반드시 일치**.
- `AUTH_SECRET` — `openssl rand -base64 32`
- `AUTH_TRUST_HOST=true` — 프록시 뒤에서 Auth.js 가 호스트를 신뢰하도록
- `NEXT_PUBLIC_BASE_URL=https://<YOUR_DOMAIN>` — **빌드 타임에 인라인**되므로 deploy(빌드) 전에 설정
- **Centrifugo(채팅)** — `CENTRIFUGO_TOKEN_HMAC_SECRET`, `CENTRIFUGO_API_KEY` 는 `openssl rand -base64 48` 로 강하게 생성. **이름 브리지 주의**: 이 값들은 `docker-compose.prod.yml` 가 컨테이너에 v6 환경변수명(`CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY` / `CENTRIFUGO_HTTP_API_KEY`)으로 다시 주입한다 — **한 번만 설정하면 앱과 컨테이너가 같은 값을 공유**. `CENTRIFUGO_HTTP_API_URL=http://127.0.0.1:8000/api`, `NEXT_PUBLIC_CENTRIFUGO_WS_URL=wss://<YOUR_DOMAIN>/connection/websocket`(빌드 타임 인라인 — deploy 전에 설정). 컨테이너의 `allowed_origins` 는 `APP_DOMAIN` 에서 자동 도출.
- `AXIOM_TOKEN` / `AXIOM_DATASET` — 둘 다 설정하면 운영 로그(pino)가 Axiom으로 전송된다. 미설정 시 `pm2 logs bidit` 으로만 확인.
- **마스터/운영자 계정 (Google OAuth 전용)** — `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`(Google OAuth 클라이언트, 승인된 리디렉션 URI = `https://supporter-b.com/api/auth/callback/google` 1개), `MASTER_ACCOUNT_EMAILS`(쉼표로 구분된 운영자 Google 이메일 allowlist — 복수 가능), `NEXT_PUBLIC_MASTER_OAUTH_ENABLED=true`(숨겨진 `/login/ops` 라우트 활성화 — **빌드 타임 인라인**, deploy 전 설정). 라우트는 이 플래그가 true이고 `AUTH_GOOGLE_ID` 도 설정됐을 때만 렌더(아니면 404). 운영자는 `/login/ops` 주소를 직접 입력해 Google로만 로그인하며, allowlist에 없는 Google 계정은 거부된다. **보안 경계는 라우트 404가 아니라 allowlist default-deny** — `AUTH_GOOGLE_ID` 가 설정된 한 OAuth 콜백 엔드포인트는 플래그와 무관하게 존재하지만 allowlist 이메일만 로그인 완료 가능. 기능을 완전히 끄려면 `AUTH_GOOGLE_ID` 를 비운다. **시드 스크립트 불필요** — 최초 로그인 시 users 행이 자동 생성된다. `AUTH_GOOGLE_ID` 가 비어 있으면 Google 프로바이더 자체가 비활성. 스키마는 `is_master` 컬럼 없이 env allowlist 로만 판정하므로 추가 DDL 은 `workspaces_status_idx`(additive) 뿐.
- `RESEND_*`, `SENTRY_*`, `SOLAPI_*` 등 — 사용하는 것만

## 갱신 배포 (이후 매번)

```bash
cd bidit && bash scripts/deploy/lightsail-deploy.sh
```
git pull → install → DB 기동 대기 → build → `pm2 reload` (무중단 reload). Caddy 는 건드리지 않음.

> 스키마 변경 시: 배포 **전에** `pnpm db:push` 로 수동 적용(계획 검토 — additive 면 적용, DROP/데이터 영향 구문은 중단). deploy 스크립트는 스키마를 자동 동기화하지 않는다. (migrate 정식 복귀는 추후 과제)
>
> enum **값 rename** 등 `db:push` 가 안전하게 못 하는 변경은 `docs/migrations/*.sql` 에
> 커밋된 스크립트를 **`db:push` 보다 먼저** psql 로 적용한다. 예: v0.2.35.0 의
> `merchant_grade` 영세 값 `small`→`sole` 통일은
> `docs/migrations/rename-merchant-grade-small-to-sole.sql` 을 먼저 실행해야 push 가
> enum diff 를 보지 않는다(미적용 시 push partial-fail + 기존 'small' row 고립).
>
> **v0.2.54.0 one-shot migration**: 칸반 '선정 완료' 컬럼이 '마감'으로 통합됨. 기존 워크스페이스에 남아 있는 `lifecycle_key='awarded'` 컬럼을 정리하려면 배포 후 1회 실행:
> ```bash
> cd bidit && tsx scripts/remove-awarded-kanban-columns.ts
> ```
> 멱등 스크립트 — 재실행 안전. 카드 FK는 `ON DELETE SET NULL` 이라 `resolveCardColumn` 이 lifecycle 에서 컬럼을 재도출해 자동 복구된다.
>
> **DB 샘플 시딩 시스템 제거 (virtual-sample-onboarding stage 3)**: 온보딩 샘플 체험이
> DB 시딩(`rfps.is_sample`/`workspaces.is_demo`/`workspaces.sample_seeded_at`)에서
> 클라이언트 fixture(`lib/onboarding/fixtures.ts`)로 전환됨 — 3개 컬럼이 DROP된다.
> 배포 순서(반드시 이 순서로):
> 1. `docs/migrations/2026-07-cleanup-sample-data.sql` 을 psql 로 먼저 실행 — 기존 시더가
>    남긴 샘플 RFP/데모 워크스페이스/데모 유저/데모 biz_profile 을 정리(DML only).
> 2. `pnpm db:push` — `rfps.is_sample`/`workspaces.is_demo`/`workspaces.sample_seeded_at`
>    3개 컬럼 DROP(계획에 다른 additive 변경이 섞여 있어도 이 DROP 들은 의도된 것이므로 승인).
> 3. 평소대로 배포.

## 운영

| 작업 | 명령 |
|---|---|
| 앱 로그 | `pm2 logs bidit` |
| 앱 상태/재시작 | `pm2 status` / `pm2 reload bidit` |
| Caddy 로그/리로드 | `journalctl -u caddy -f` / `sudo systemctl reload caddy` |
| DB 셸 | `docker compose -f docker-compose.prod.yml exec pg psql -U supporter_b` |
| DB 백업 | `docker compose -f docker-compose.prod.yml exec -T pg pg_dump -U supporter_b supporter_b > backup-$(date +%F).sql` |
| Centrifugo 로그 | `docker compose -f docker-compose.prod.yml logs -f centrifugo` |
| Centrifugo 재시작 | `docker compose -f docker-compose.prod.yml restart centrifugo` (config.yaml 변경 후) |
| swap 확인 | `swapon --show` / `free -h` |
| 롤백 | `git checkout <이전-sha> && bash scripts/deploy/lightsail-deploy.sh` |

## 방화벽 — 호스트 방화벽을 두지 않는 이유

자체호스팅 시 흔히 iptables 를 손대지만 **Lightsail 은 불필요**하다:

- **Lightsail 콘솔 방화벽**(Networking 탭)이 AWS 엣지에서 Security Group 처럼 필터링한다 = 이게 방화벽이다.
- Amazon Linux 2023 은 ufw 가 없고(Debian 계열 도구), firewalld 도 Lightsail 이미지에서 기본 비활성. nftables 기본 정책은 ACCEPT 라 수동 룰 삽입도 불필요.
- 외부 리스너는 Caddy(80/443, 의도적 공개)와 SSH(22, 콘솔에서 관리)뿐. Postgres 는 `127.0.0.1` 바인딩이라 외부에서 보이지 않는다 → 호스트 방화벽이 추가로 막을 대상이 없다.

→ §사전준비 3번(콘솔에서 443 열기)만 하면 끝. 호스트 방화벽 설치 단계는 의도적으로 없다.

## Centrifugo (실시간 채팅)

`docker-compose.prod.yml` 의 `centrifugo` 서비스가 `pg` 와 함께 뜬다 (`docker compose -f docker-compose.prod.yml up -d` 가 둘 다 기동). 운영 시 따로 챙길 것:

- **포트 노출 없음**: `127.0.0.1:8000` 바인딩이라 Lightsail 콘솔 방화벽에 **8000 을 열지 않는다**. 외부는 오직 Caddy `wss://<도메인>/connection/websocket` 로만 도달.
- **subscribe proxy = 보안 경계**: 컨테이너가 구독 시도마다 앱(`host.docker.internal:3000/api/centrifugo/subscribe`)을 server↔server 로 호출해 워크스페이스 멤버십 ACL 로 허용/거부한다. 이 경로는 공개 노출 대상이 **아니다**(Caddy 미경유). `host.docker.internal` 는 compose 의 `extra_hosts: host-gateway` 로 Linux/Lightsail 에서 호스트로 매핑됨.
- **config.yaml 변경 후 재시작 필요**: `deploy/centrifugo/config.yaml` 은 read-only 마운트라 컨테이너 재시작(`docker compose -f docker-compose.prod.yml restart centrifugo`)으로 반영.
- **시크릿은 env 만**: config.yaml 에는 시크릿 없음(Centrifugo 는 `${VAR}` 보간 안 함). `.env.production` 의 `CENTRIFUGO_*` 를 compose 가 v6 키명으로 주입. §환경변수 참조.

### 로컬 dev — Centrifugo 한 컨테이너

운영 compose 는 Postgres+Centrifugo 를 묶지만 로컬 dev 에서는 **Centrifugo 만** 따로 띄우면 된다 (앱은 `pnpm dev`, DB 는 기존 로컬 방식). 운영 config 를 재사용해 한 줄로 기동:

```bash
docker run --rm -p 127.0.0.1:8000:8000 \
  -v "$PWD/deploy/centrifugo/config.yaml:/centrifugo/config.yaml:ro" \
  -e CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY=dev-secret \
  -e CENTRIFUGO_HTTP_API_KEY=dev-api-key \
  -e CENTRIFUGO_CLIENT_ALLOWED_ORIGINS=http://localhost:3000 \
  --add-host host.docker.internal:host-gateway \
  centrifugo/centrifugo:v6 centrifugo -c /centrifugo/config.yaml
```

그리고 `.env.local` 에:

```
CENTRIFUGO_TOKEN_HMAC_SECRET=dev-secret
CENTRIFUGO_API_KEY=dev-api-key
CENTRIFUGO_HTTP_API_URL=http://127.0.0.1:8000/api
NEXT_PUBLIC_CENTRIFUGO_WS_URL=ws://localhost:8000/connection/websocket
```

> macOS Docker Desktop 은 `host.docker.internal` 가 기본 지원되어 subscribe proxy 가 `localhost:3000` 의 `pnpm dev` 앱에 바로 닿는다. env 가 미설정이면 앱은 publish 를 no-op 으로 안전하게 건너뛴다(테스트/오프라인 모드) — 채팅 영속은 동작하고 라이브 fanout 만 비활성.

## 이메일 큐 주기 flush (outbox cron)

앱은 액션 커밋 직후 outbox 를 즉시 flush(`after()` post-commit)한다. 하지만 채팅 알림 메일은 폭주 방지를 위해 윈도우가 끝나는 미래 시각으로 **지연 예약**(scheduled_at)되며, 그 시점엔 보통 어떤 액션도 돌고 있지 않다 → post-commit flush 가 그 행을 집어 보낼 수 없다. 그래서 **매 1분 crontab** 이 `POST /api/cron/flush-outbox` 를 쳐서 (1) 일반 pending 메일과 (2) due 가 된 chat 다이제스트를 비운다. 라우트는 발송 시점에 본문을 재계산하므로 그 사이 수신자가 온라인이 되거나 다 읽었으면 발송을 취소한다.

### 일괄 발송(batch) + rate-limit 회피

Resend 기본 한도는 **초당 2요청**이라 한 RFP 초대(PG 여러 곳 × 담당자)나 입찰 도착 fan-out 이 메일을 건당 연속 발사하면 다수가 429 로 실패했다. 일반 outbox flush 는 이제 청구한 행 전체를 Resend **batch.send**(콜당 최대 100통, rate-limit 상 **1요청**)로 묶어 보낸다 → N통 fan-out 이 ceil(N/100) 콜로 줄어든다. 실패 행은 일시 오류(429/5xx/네트워크)면 **지수 백오프**로 재예약·재시도하고, 영구 오류(잘못된 주소·미인증 발신 도메인·검증 실패)면 즉시 `failed` 로 종결한다(잔여 시도 낭비 방지). 코알레스되는 chat/team 다이제스트는 발송 시 본문을 재계산해야 해 단건 발송을 유지하되 동일한 백오프/분류를 적용한다.

튜닝 env(전부 선택, 기본값 안전): `EMAIL_BATCH_SIZE`(기본 100, 100 상한) · `EMAIL_BATCH_INTERVAL_MS`(기본 600 — 한 flush 내 배치 콜 사이 간격) · `EMAIL_RETRY_BASE_MS`(기본 30000) · `EMAIL_RETRY_CAP_MS`(기본 1800000). 별도 워커 프로세스는 불필요 — 기존 post-commit + 1분 cron 토폴로지 그대로다. 추가 헤드룸이 필요하면 Resend 대시보드에서 rate-limit 상향을 요청하면 된다.

> **메일 실패는 인앱 알림에 영향 없음.** 도메인 이벤트는 인앱 알림 행과 outbox 메일 행을 같은 트랜잭션에서 함께 커밋하고, 발송 실패 처리(`markResult`)는 `outbox_entries` 만 갱신한다 → 메일이 끝내 실패해도 사용자의 인앱 알림·읽음 상태는 그대로 유지된다(회귀 테스트 `email-failure-decoupling.test.ts` 로 고정).

crontab 에 1분 주기로 등록 (`crontab -e`). 시크릿은 **crontab 상단에 한 줄로 정의**해야 cron 이 명령 환경으로 export 하고 안쪽 셸이 이를 펼친다. `flock -n` 로 감싸 **이전 tick 의 flush 가 아직 안 끝났으면 이번 tick 은 건너뛴다** — chat/team 다이제스트 처리기는 lease 없이 due 행을 읽으므로, 1분 안에 안 끝나는 대량 drain 이 다음 cron 과 겹치면 같은 다이제스트가 두 번 발송될 수 있다(일반 flush 는 SKIP-LOCKED+lease 로 안전):

```cron
CRON_SECRET=붙여넣을-시크릿
* * * * * flock -n /tmp/flush-outbox.lock curl -fsS -XPOST localhost:3000/api/cron/flush-outbox -H "x-cron-secret: $CRON_SECRET" >/dev/null 2>&1
```

> **주의 — cron 은 셸 프로필도 `.env.production` 도 읽지 않는다.** 시크릿은 위처럼 **crontab 상단 한 줄**(또는 `/etc/cron.d/` 파일 상단의 `CRON_SECRET=...`)로 정의한다. ⚠️ `* * * * * CRON_SECRET=… curl … -H "x-cron-secret: $CRON_SECRET"` 처럼 **명령 줄 앞에 인라인 대입**하는 형태는 동작하지 않는다 — POSIX 셸은 대입을 적용하기 *전에* `$CRON_SECRET` 를 (아직 비어 있는) 현재 환경으로 펼치므로 빈 헤더가 간다. 빈 값이면 라우트가 fail-closed 로 401 → **메일이 조용히 안 나간다**(우회는 안 되지만 flush 도 안 됨). 정 인라인 대입이 싫고 변수도 안 쓰고 싶으면 헤더에 시크릿 리터럴을 직접 박아도 된다(시크릿은 어차피 같은 호스트 `.env.production` 에 있다). 값은 `.env.production` 의 `CRON_SECRET` 와 **동일**해야 하고, 헤더 이름은 `x-cron-secret` 로 라우트와 정확히 일치시킬 것.

## 채팅 활성화 — 기존 운영 서버 마이그레이션 체크리스트

`feat+realtime-chat` 이 `main` 에 처음 머지·배포될 때 한 번만 필요한 추가 작업. 일반 `lightsail-deploy.sh` 단독으로는 부족하다 — Centrifugo 시크릿, DB 스키마 4개 신규 테이블, Caddyfile `/connection/*` 라우트, crontab 이 모두 새로 생겼기 때문.

### 선행: 로컬에서 dev → main PR 머지

```bash
# /ship 스킬 또는 gh pr create
```

### 1. 서버 — `.env.production` 에 신규 변수 추가

> **⚠️ 반드시 deploy 스크립트 실행 전에 완료** — `NEXT_PUBLIC_CENTRIFUGO_WS_URL` 은 빌드 타임 인라인이라 값이 없으면 WS 연결이 안 됨. `CENTRIFUGO_TOKEN_HMAC_SECRET` / `CENTRIFUGO_API_KEY` 누락 시 `docker compose up` 이 `:?` 오류로 실패.

```bash
# 서버에서 강한 시크릿 생성
CENTRIFUGO_TOKEN_HMAC_SECRET=$(openssl rand -base64 48)
CENTRIFUGO_API_KEY=$(openssl rand -base64 48)
CRON_SECRET=$(openssl rand -base64 32)

# .env.production 에 추가 (값 채워 넣기)
CENTRIFUGO_TOKEN_HMAC_SECRET=<위에서 생성>
CENTRIFUGO_API_KEY=<위에서 생성>
CENTRIFUGO_HTTP_API_URL=http://127.0.0.1:8000/api
NEXT_PUBLIC_CENTRIFUGO_WS_URL=wss://supporter-b.com/connection/websocket
CRON_SECRET=<위에서 생성>
```

### 2. 서버 — DB 스키마 push (deploy 전, pm2 reload 전)

git pull 로 새 스키마 코드를 받기 전에도 아래처럼 배포 직전 수동으로 실행하거나, git pull 후 deploy 스크립트 내 빌드 단계 전에 별도 실행한다.

```bash
set -a; . ./.env.production; set +a
pnpm db:push
```

아래 변경이 모두 **additive** (데이터 손실 없음) — 전부 Yes:

| 변경 | 타입 |
|---|---|
| `chat_conversations` 테이블 신규 | 추가 |
| `chat_messages` 테이블 신규 | 추가 |
| `chat_conversation_reads` 테이블 신규 | 추가 |
| `chat_message_templates` 테이블 신규 | 추가 |
| `attachments.chat_message_id` nullable 컬럼 + 인덱스 추가 | 추가 |
| `attachments` CHECK 제약 교체 (`chat_message_id` 포함으로 완화) | DROP+ADD; 기존 데이터는 `NULL` → 제약 통과 |
| `outbox_event` 열거형에 `'chat.message'` 추가 | 추가 |

### 3. 서버 — deploy 스크립트 실행

```bash
bash scripts/deploy/lightsail-deploy.sh
```

스크립트 내부에서 자동 처리:
- `git pull`
- `docker compose -f docker-compose.prod.yml up -d` → **pg + Centrifugo 컨테이너 동시 기동** (Centrifugo 는 이 배포에서 최초 기동)
- `NEXT_PUBLIC_CENTRIFUGO_WS_URL` 인라인 포함 `next build`
- `pm2 reload`

### 4. 서버 — Caddyfile 업데이트 + 리로드

운영 서버의 `/etc/caddy/Caddyfile` 은 채팅 추가 이전 버전이라 `/connection/*` → 8000 라우트가 없다. `git pull` 로 받은 레포 버전으로 교체:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

추가된 블록:
```
handle /connection/* {
    reverse_proxy 127.0.0.1:8000   # WebSocket → Centrifugo
}
```

### 5. 서버 — crontab 등록 (chat 다이제스트 이메일)

```bash
crontab -e
```

```cron
CRON_SECRET=<.env.production 의 CRON_SECRET 와 동일한 값>
* * * * * flock -n /tmp/flush-outbox.lock curl -fsS -XPOST localhost:3000/api/cron/flush-outbox -H "x-cron-secret: $CRON_SECRET" >/dev/null 2>&1
```

> `CRON_SECRET=` 는 **명령줄 앞 인라인이 아닌 상단 한 줄**로 정의. 인라인 방식은 빈 값으로 펼쳐져 401이 됨 — §이메일 큐 주기 flush 참조.

### 6. 검증

```bash
# Centrifugo 정상 기동 확인
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs centrifugo

# 브라우저 DevTools → Network → WS 탭 → /connection/websocket 101 Switching Protocols 확인
# 채팅 메시지 전송 후 새로고침 없이 상대방 화면에 즉시 수신되는지 확인
```

문제 발생 시 §트러블슈팅의 "채팅 메시지가 실시간으로 안 옴" 항목 참조.

## partner.supporter-b.com 서브도메인 (PG 호스트 라우팅) 롤아웃

`partner.supporter-b.com` 은 **별도 프로세스 없이** 동일한 `:3000` Next.js 앱이 서빙한다. PM2 앱을 새로 띄우지 않아도 된다 — Caddy 가 두 호스트를 한 블록에서 처리한다.

### 1. DNS — deploy 전에 선행 필수

도메인 DNS 에 A 레코드를 추가한다:

```
partner.supporter-b.com  A  <Lightsail 고정 IP>
```

> **⚠️ Caddy 리로드 전에 레코드가 전파돼 있어야 한다.** Caddy 는 호스트별로 Let's Encrypt ACME 챌린지를 시도하므로, `dig +short partner.supporter-b.com` 이 고정 IP 를 반환하는 것을 확인한 뒤 Caddy 를 리로드할 것.

### 2. `.env.production` 에 신규 변수 추가

> **⚠️ `NEXT_PUBLIC_*` 는 빌드 타임 인라인** — 값 변경 후 `pnpm build` 없이 `pm2 reload` 만 해서는 반영 안 됨. `AUTH_COOKIE_DOMAIN` 은 런타임 변수라 restart 만으로 충분.
>
> **⚠️ `AUTH_COOKIE_DOMAIN` 설정은 기존 사용자 전원을 1회 로그아웃** 시킨다. Caddy 리로드·DNS 컷오버와 같은 시점에 진행할 것.

```bash
# 런타임 변수 (restart 로 반영)
AUTH_COOKIE_DOMAIN=.supporter-b.com

# 빌드 타임 변수 (변경 후 반드시 pnpm build 재실행)
NEXT_PUBLIC_BUYER_ORIGIN=https://supporter-b.com
NEXT_PUBLIC_PARTNER_ORIGIN=https://partner.supporter-b.com
```

### 3. Caddyfile 교체 + 리로드

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

`git pull` 로 받은 `deploy/Caddyfile` 은 메인 블록 주소가 `{$APP_DOMAIN}, partner.{$APP_DOMAIN}` 로 바뀌어 있다. `admin.{$APP_DOMAIN}` 블록은 그대로다.

> ⚠️ 호스트 라우팅은 Caddy 가 업스트림으로 원본 `Host` 헤더를 그대로 전달하는 데 의존한다(Caddy v2 `reverse_proxy` 기본 동작). `header_up Host {upstream_hostport}` 같은 설정을 추가하면 앱이 `127.0.0.1:3000` 을 호스트로 보게 되어 라우팅이 조용히 멈춘다(에러 없이 리다이렉트 안 됨). 기본 동작을 유지할 것.

### 4. 배포 (빌드 포함)

```bash
bash scripts/deploy/lightsail-deploy.sh
```

`NEXT_PUBLIC_BUYER_ORIGIN` / `NEXT_PUBLIC_PARTNER_ORIGIN` 이 `.env.production` 에 설정된 상태에서 빌드돼야 한다.

### 5. 수동 확인 체크리스트

배포 후 아래를 직접 확인한다:

- [ ] PG 계정으로 `supporter-b.com/home` 접속 → `partner.supporter-b.com/home` 으로 307 리다이렉트되고 로그인 유지
- [ ] 두 워크스페이스를 가진 유저가 워크스페이스 전환 시 서브도메인 간 이동 후 로그인 유지
- [ ] `supporter-b.com` / `partner.supporter-b.com` 양쪽에서 채팅 실시간 수신 정상 동작
- [ ] RFP 초대 이메일의 링크가 `partner.supporter-b.com` 도메인을 가리킴

## Node 설치 (Amazon Linux 2023)

AL2023 은 glibc 2.34 라 **공식 Node 22 바이너리가 그대로 실행된다** (AL2의 `GLIBC_2.28 not found` 문제 없음). bootstrap 은 nodejs.org 공식 `linux-x64` tarball 을 `/usr/local` 에 설치한다.

- 버전 변경: `NODE_VERSION=22.x.x bash scripts/deploy/lightsail-bootstrap.sh`
- 참고: AL2023 기본 저장소의 `nodejs20` 패키지는 Node 20 이라 쓰지 않는다 (이 앱은 Node 22 기준).
- 만약 인스턴스를 구형 **Amazon Linux 2**(glibc 2.26)로 만들었다면 공식 바이너리는 실행 안 되니, AL2023 으로 재생성하거나 bootstrap §3 을 nodejs.org **비공식 `glibc-217` 빌드** URL 로 바꿔야 한다.

## 트러블슈팅

- **사이트 안 뜸 / TLS 안 됨**: 콘솔 방화벽 443 열렸는지(가장 흔함), `dig` 가 고정 IP 가리키는지, `journalctl -u caddy` 의 ACME 에러 확인.
- **`node` 못 찾음 / 버전 이상**: `which node`(=`/usr/local/bin/node`), `node -v`(v22) 확인. AL2023 이 아니라 구형 AL2 면 `GLIBC_2.28 not found` 가 날 수 있다 → §Node 설치.
- **빌드 중 OOM/멈춤**: `swapon --show` 로 swap 확인. `NODE_BUILD_HEAP_MB=1280 bash scripts/deploy/lightsail-deploy.sh` 로 더 낮춰 재시도.
- **`docker: permission denied`**: bootstrap 후 재접속(또는 `newgrp docker`)으로 docker 그룹 반영.
- **DB 접속 실패**: `DATABASE_URL` 의 자격증명이 `.env.production` 의 `POSTGRES_*` 와 일치하는지, 컨테이너가 떴는지(`docker compose -f docker-compose.prod.yml ps`) 확인.
- **채팅 메시지가 실시간으로 안 옴(새로고침해야 보임)**: (1) `journalctl`/`docker compose logs centrifugo` 에 `namespace not found` 면 config 의 `chat` 네임스페이스 누락 — 채널은 `chat:conversation:<id>` 라 첫 콜론 앞 `chat` 네임스페이스가 정의돼 있어야 한다. (2) 구독이 전부 거부되면 subscribe proxy 가 앱에 못 닿는 것 — `host.docker.internal` 매핑(`extra_hosts: host-gateway`)과 앱이 3000 에 떠 있는지 확인. (3) WS 연결 자체가 안 되면 Caddy `/connection/*` 라우트와 `NEXT_PUBLIC_CENTRIFUGO_WS_URL`(빌드 타임 인라인 — 바뀌면 재빌드) 확인. (4) `allowed_origins` 불일치(브라우저 Origin ≠ `https://<APP_DOMAIN>`)면 연결 거부 — `APP_DOMAIN` 확인.
