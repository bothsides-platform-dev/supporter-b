# 배포 런북 — AWS Lightsail + Caddy (Amazon Linux 2023)

단일 Lightsail VM에 앱·DB·리버스프록시를 모두 올리는 **자체 호스팅** 경로다.

> **위치**: 이 문서가 **현행 라이브 배포 절차**다. 라이브 운영은 이 Lightsail 자체 호스팅으로 돌아간다.

## 아키텍처

```
인터넷 ──443──▶ Caddy (systemd, 자동 HTTPS/Let's Encrypt) ──▶ 127.0.0.1:3000
                                                              Next.js (PM2: `next start`)
                                                                    │
                                                              127.0.0.1:5432
                                                              Postgres 16 (docker compose)
```

- **앱**: 네이티브 `next start`, PM2 가 감독 (`ecosystem.config.cjs`).
- **DB**: 같은 박스의 Docker Postgres (`docker-compose.prod.yml`), **`127.0.0.1` 에만 바인딩** → 외부 노출 없음. 앱은 `DATABASE_URL` 로 접속.
- **프록시/TLS**: Caddy 가 도메인으로 Let's Encrypt 인증서를 자동 발급·갱신, 80→443 리다이렉트, 25MB 업로드 허용(`deploy/Caddyfile`).
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
- `RESEND_*`, `SENTRY_*`, `SOLAPI_*` 등 — 사용하는 것만
- `AXIOM_TOKEN` / `AXIOM_DATASET` — 둘 다 설정하면 운영 로그(pino)가 Axiom으로 전송된다. 미설정 시 `pm2 logs bidit` 으로만 확인.

## 갱신 배포 (이후 매번)

```bash
cd bidit && bash scripts/deploy/lightsail-deploy.sh
```
git pull → install → DB 기동 대기 → migrate → build → `pm2 reload` (무중단 reload). Caddy 는 건드리지 않음.

## 운영

| 작업 | 명령 |
|---|---|
| 앱 로그 | `pm2 logs bidit` |
| 앱 상태/재시작 | `pm2 status` / `pm2 reload bidit` |
| Caddy 로그/리로드 | `journalctl -u caddy -f` / `sudo systemctl reload caddy` |
| DB 셸 | `docker compose -f docker-compose.prod.yml exec pg psql -U supporter_b` |
| DB 백업 | `docker compose -f docker-compose.prod.yml exec -T pg pg_dump -U supporter_b supporter_b > backup-$(date +%F).sql` |
| swap 확인 | `swapon --show` / `free -h` |
| 롤백 | `git checkout <이전-sha> && bash scripts/deploy/lightsail-deploy.sh` |

## 방화벽 — 호스트 방화벽을 두지 않는 이유

자체호스팅 시 흔히 iptables 를 손대지만 **Lightsail 은 불필요**하다:

- **Lightsail 콘솔 방화벽**(Networking 탭)이 AWS 엣지에서 Security Group 처럼 필터링한다 = 이게 방화벽이다.
- Amazon Linux 2023 은 ufw 가 없고(Debian 계열 도구), firewalld 도 Lightsail 이미지에서 기본 비활성. nftables 기본 정책은 ACCEPT 라 수동 룰 삽입도 불필요.
- 외부 리스너는 Caddy(80/443, 의도적 공개)와 SSH(22, 콘솔에서 관리)뿐. Postgres 는 `127.0.0.1` 바인딩이라 외부에서 보이지 않는다 → 호스트 방화벽이 추가로 막을 대상이 없다.

→ §사전준비 3번(콘솔에서 443 열기)만 하면 끝. 호스트 방화벽 설치 단계는 의도적으로 없다.

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
