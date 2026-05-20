# OCI 배포 런북 — bidit (Supporter B)

Oracle Cloud Infrastructure **Compute 인스턴스**에 네이티브(Node + PM2)로 배포하고,
Postgres는 같은 인스턴스의 Docker 컨테이너, HTTPS는 도메인 + Caddy 자동 TLS로 띄운다.

| 항목 | 선택 |
|---|---|
| 인스턴스 | Ampere A1 (ARM, Always Free) — Ubuntu 24.04. 용량 부족 시 x86 micro 폴백 |
| 앱 실행 | 네이티브 Node 22 + PM2 (`next start`) |
| DB | 같은 인스턴스 Postgres 16 컨테이너 (`docker-compose.prod.yml`, 127.0.0.1 바인딩) |
| 프록시/TLS | Caddy — 도메인으로 Let's Encrypt 자동 발급/갱신 |
| 이메일 | Resend **미인증 상태로 배포** → 초대/가입 메일 미발송 (추후 DNS 인증) |

> 산출물: `scripts/deploy/bootstrap.sh`, `scripts/deploy/deploy.sh`, `ecosystem.config.cjs`,
> `docker-compose.prod.yml`, `deploy/Caddyfile`, `.env.production.example`.

---

## 사전 준비물

- OCI 계정(테넌시) + 결제/Always Free 등록 완료
- SSH 키페어 (`ssh-keygen -t ed25519`) — 공개키를 인스턴스 생성 시 등록
- 도메인 1개 (DNS A 레코드를 직접 편집할 수 있어야 함)
- 이 리포 접근권 (private repo → **GitHub deploy key** 권장, 아래 4단계)

---

## 1. 네트워크 + 인스턴스 생성 (OCI 콘솔)

### 1-1. 예약 공인 IP (먼저 확보)
`Networking → Reserved public IPs → Reserve public IP address`로 IP를 하나 예약한다.
**중요**: `NEXT_PUBLIC_BASE_URL`은 빌드 타임에 박히므로 IP/도메인이 바뀌면 재빌드가 필요하다.
예약 IP는 인스턴스를 지워도 유지되므로 도메인 A 레코드를 안정적으로 가리킬 수 있다.

### 1-2. VCN
`Networking → Virtual Cloud Networks → Start VCN Wizard → "VCN with Internet Connectivity"`.
인터넷 게이트웨이 + 퍼블릭 서브넷이 자동 생성된다.

### 1-3. 보안 목록 (Ingress 규칙)
서브넷의 Security List에 다음 인그레스 규칙(Source `0.0.0.0/0`, TCP) 추가:

| 포트 | 용도 |
|---|---|
| 22 | SSH (기본 존재) |
| 80 | HTTP → HTTPS 리다이렉트 + Let's Encrypt ACME 챌린지 |
| 443 | HTTPS |

> 5432(Postgres)·3000(앱)은 **절대 열지 않는다.** 컨테이너는 127.0.0.1 바인딩이고
> 앱은 Caddy 뒤에 있다.

### 1-4. Compute 인스턴스
`Compute → Instances → Create instance`:
- Image: **Canonical Ubuntu 24.04**
- Shape: **VM.Standard.A1.Flex** (예: 2 OCPU / 12GB — Always Free 한도 내). 
  `Out of host capacity` 에러가 흔하다 → 다른 가용 도메인/리전으로 재시도하거나,
  임시로 `VM.Standard.E2.1.Micro`(x86, 1GB) 폴백 (이 경우 스왑 필수 — 부트스트랩이 처리).
- SSH key: 위에서 만든 **공개키** 등록
- Networking: 1-2에서 만든 VCN/퍼블릭 서브넷, **public IP 할당**
- 생성 후: 1-1의 예약 IP를 이 인스턴스의 VNIC에 연결(`...VNIC → Edit → No public IP 후 Reserved IP 지정`)

### 1-5. DNS
도메인 관리 콘솔에서 **A 레코드** → 예약 공인 IP. (Caddy가 인증서를 받으려면
도메인이 IP로 해석되어야 하므로 다음 단계 전에 전파 확인: `dig +short your-domain.com`)

---

## 2. 접속 + deploy key (클론 **전**)

private repo이므로 클론하기 전에 deploy key부터 등록한다. 안 그러면 클론이
`Permission denied (publickey)`로 실패한다.

```bash
ssh -i ~/.ssh/your_key ubuntu@<예약공인IP>

ssh-keygen -t ed25519 -C "oci-bidit-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```
출력된 공개키를 GitHub repo → `Settings → Deploy keys → Add deploy key`에 등록(읽기 전용이면 충분).
PAT 파일을 디스크에 두는 것보다 범위가 좁아 안전하다.

---

## 3. 클론 + 부트스트랩

```bash
git clone git@github.com:bothsides-platform-dev/bidit.git
cd bidit

bash scripts/deploy/bootstrap.sh
# docker 그룹 반영을 위해 한 번 재로그인하거나:
newgrp docker
```

`bootstrap.sh`가 하는 일: 4GB 스왑, Node 22, pnpm 9(corepack), Docker+compose, PM2,
Caddy 설치 + **iptables 80/443 오픈**(OCI Ubuntu의 기본 차단 우회).

**부트스트랩 직후 방화벽 순서 검증 (필수)** — Ubuntu 24.04는 iptables-nft를 쓰고
인그레스 체인 레이아웃이 22.04와 다를 수 있다. ACCEPT 규칙이 REJECT보다 **위**에 있어야 한다:

```bash
sudo iptables -L INPUT --line-numbers
```
`ACCEPT tcp dpt:80` / `dpt:443`이 `REJECT ... icmp-host-prohibited` 줄보다 위에 없으면,
REJECT를 맨 뒤로 밀어준다:
```bash
sudo iptables -D INPUT <REJECT-라인번호>
sudo iptables -A INPUT -j REJECT --reject-with icmp-host-prohibited
sudo netfilter-persistent save
```

---

## 4. 환경 변수 + 배포

```bash
cp .env.production.example .env.production
nano .env.production
```

반드시 채울 값:
- `POSTGRES_PASSWORD` / `DATABASE_URL` — 같은 강한 비밀번호로 일치시킬 것
- `AUTH_SECRET` — `openssl rand -base64 32`
- `AUTH_TRUST_HOST=true` — (이미 기본값) **지우지 말 것**, 없으면 로그인이 `UntrustedHost`로 깨짐
- `AUTH_URL` / `NEXT_PUBLIC_BASE_URL` / `APP_DOMAIN` — 모두 `https://your-domain.com`
- `NTS_SERVICE_KEY` — 국세청 사업자번호 조회 (RFP 생성에 필수)
- `RESEND_*` — 지금은 비워두거나 미인증 값. 메일은 도메인 인증 후 동작 (6단계)

```bash
bash scripts/deploy/deploy.sh
```

`deploy.sh`: 의존성 설치 → Postgres 컨테이너 기동 → `pnpm db:migrate`
(`drizzle/0000_*.sql`, `0001_*.sql` 적용) → `pnpm build` → PM2 기동.

PM2 재부팅 생존:
```bash
pm2 startup    # 출력된 sudo 명령을 그대로 실행
pm2 save
```

---

## 5. Caddy 기동 (HTTPS)

Caddy 데비안 패키지의 systemd 유닛은 이미 `/etc/default/caddy`를 `EnvironmentFile`로
읽는다(확인: `systemctl cat caddy | grep EnvironmentFile`). 그러므로 거기에 `APP_DOMAIN`만
넣으면 되고 별도 override는 필요 없다:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
echo "APP_DOMAIN=your-domain.com" | sudo tee -a /etc/default/caddy
# 문법 사전 검증 (validate는 systemd 밖이라 APP_DOMAIN을 인라인으로 줘야 함)
sudo APP_DOMAIN=your-domain.com caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl restart caddy
sudo systemctl status caddy --no-pager
```

Caddy가 도메인으로 Let's Encrypt 인증서를 자동 발급하고 80→443 리다이렉트 + 443→127.0.0.1:3000 프록시.

---

## 6. 스모크 테스트

```bash
curl -I https://your-domain.com/login          # 200/307 + valid TLS
pm2 logs bidit --lines 50                       # 런타임 에러 확인
docker compose -f docker-compose.prod.yml ps    # pg healthy
```
브라우저로 `https://your-domain.com/login` → 로그인 → `(app)` 진입까지 확인.
(HTTPS이므로 Auth.js의 Secure 세션 쿠키가 정상 동작한다.)

---

## 운영 메모 / 알려진 제약

- **이메일(초대/가입) 미동작**: Resend에서 발신 도메인 DNS 인증(SPF/DKIM)을 하기 전까지
  메일이 나가지 않는다. 도메인이 있으니 Resend 대시보드에서 도메인 추가 → DNS 레코드 등록 →
  `.env.production`의 `RESEND_API_KEY`/`RESEND_FROM` 채우고 `deploy.sh` 재실행하면 활성화된다.
  **이 플랫폼의 PG 초대 흐름(시나리오 A/B/C)은 메일에 의존**하므로 운영 전 반드시 처리.
- **백업**: 첨부가 Postgres bytea에 들어가므로 DB 덤프가 곧 전체 백업이다. nightly cron 권장:
  ```bash
  docker compose -f docker-compose.prod.yml exec -T pg \
    pg_dump -U supporter_b supporter_b | gzip > /home/ubuntu/backups/bidit-$(date +%F).sql.gz
  ```
  (OCI Object Storage Always Free 버킷으로 동기화하면 인스턴스 손실에도 안전.)
- **재배포**: `git push` 후 인스턴스에서 `bash scripts/deploy/deploy.sh` 한 번.
- **IP/도메인 변경 시**: `NEXT_PUBLIC_BASE_URL`이 빌드에 박히므로 `.env.production` 수정 후
  `deploy.sh`로 **재빌드** 필요.
- **80/443이 안 열릴 때**: `sudo iptables -L INPUT --line-numbers`로 ACCEPT 80/443이
  REJECT 줄보다 위인지 확인. 아니면 `bootstrap.sh`의 firewall 단계 재실행.
- **Sentry**: `SENTRY_AUTH_TOKEN`을 비워두면 빌드 시 소스맵 업로드를 건너뛴다(빌드는 정상).
```
