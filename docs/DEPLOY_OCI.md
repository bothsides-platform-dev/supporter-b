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

OCI 방화벽은 **2계층**이다. 여기서는 서브넷 단위인 **Security List**를 쓴다.
(VNIC 단위인 NSG도 있지만 단일 인스턴스에는 Security List만으로 충분하다. 둘 다 쓰면
**둘 다 통과**해야 트래픽이 들어오므로 혼용하지 말 것.)

**열어야 할 것은 여기 Security List + OS의 iptables(§3) 두 군데 모두**다. 한쪽만 열면
접속이 안 된다 — OCI 초보가 가장 많이 막히는 지점.

#### 콘솔 이동 경로
`Networking → Virtual Cloud Networks → (방금 만든 VCN) → 좌측 Subnets → (public subnet)
→ Security Lists → "Default Security List for <VCN>" → Ingress Rules → [Add Ingress Rules]`

#### 추가할 인그레스 규칙
80과 443을 각각 한 줄씩 추가한다(한 화면에서 "+ Another Ingress Rule"로 동시에 추가 가능).
각 규칙의 필드:

| 필드 | 80 규칙 값 | 443 규칙 값 |
|---|---|---|
| Stateless | **체크 해제** (= Stateful) | **체크 해제** |
| Source Type | CIDR | CIDR |
| Source CIDR | `0.0.0.0/0` | `0.0.0.0/0` |
| IP Protocol | TCP | TCP |
| Source Port Range | 비움 (= All) | 비움 |
| Destination Port Range | `80` | `443` |
| Description | `HTTP (redirect + ACME)` | `HTTPS` |

> **Stateful**(기본)이면 응답 트래픽이 자동 허용되므로 egress 별도 규칙이 필요 없다.
> Stateless로 만들면 egress까지 직접 열어야 하니 그냥 기본(Stateful)으로 둔다.

#### 이미 있는/유지할 규칙
- **TCP 22 (SSH)** — VCN 마법사가 기본 인그레스로 넣어준다. 그대로 둔다.
- **Egress "All / 0.0.0.0/0 Allow"** — 기본값. apt·NodeSource·get.docker.com·GitHub·
  Let's Encrypt에 나가야 하므로 **삭제하지 말 것**.

#### 열지 말 것
**5432(Postgres)·3000(앱)은 절대 인그레스에 추가하지 않는다.** Postgres 컨테이너는
`127.0.0.1`에만 바인딩되고 앱은 Caddy 뒤에 있어 외부 노출이 필요 없다.

#### 적용 확인 (DNS 전파 후, §5 Caddy 기동 전후)
로컬에서:
```bash
nc -vz <예약공인IP> 80     # succeeded 면 Security List 통과
nc -vz <예약공인IP> 443
```
`80`은 열렸는데 연결이 안 되면 보통 **OS iptables(§3)** 가 막은 것이다.

### 1-4. Compute 인스턴스

`Compute → Instances → [Create instance]`. 생성 폼을 위에서부터 채운다.

#### ① Name / Compartment
- **Name**: `bidit-prod` 등 알아볼 이름.
- **Compartment**: VCN을 만든 것과 **같은 컴파트먼트**를 선택(다르면 그 서브넷이 안 보임).

#### ② Placement (Availability Domain) + Capacity type
- **Availability Domain**: AD가 여러 개면 하나 고른다. **A1 용량은 AD마다 다르므로**, 뒤에서
  `Out of host capacity`가 나면 여기서 AD를 바꿔가며 재시도하는 게 1차 해법이다.
- **Capacity type**: 같은 Placement 영역에 있는 라디오 선택값. 무료 상시 서비스는 반드시
  **On-demand**로 둔다:

  | 옵션 | 설명 | 이 배포 |
  |---|---|---|
  | **On-demand capacity** | 기본값. 생성 시점에 가용 자원을 그때그때 잡음. Always Free A1도 이걸로 만든다. | ✅ **선택** |
  | Preemptible capacity | 더 싸지만 Oracle이 언제든 회수 → 인스턴스가 죽음. Always Free 대상도 아님. | ✗ 상시 서비스 부적합 |
  | Capacity reservation | 미리 만들어 둔 **용량 예약**을 사용. 예약 자체에 가용 용량이 필요해 A1 무료엔 일반적 경로가 아님. | ✗ |
  | Dedicated virtual machine host | 전용 베어메탈 호스트(유료). | ✗ |

  > On-demand인데도 A1이 안 잡히는 게 그 유명한 `Out of host capacity`다. 해결은 ③의 3단계
  > (AD 변경 → 오프피크 재시도 → x86 폴백). 자동 재시도가 필요하면 OCI CLI
  > `oci compute instance launch`를 루프로 돌려 용량이 풀리는 순간 잡는 방법도 있다(OCI CLI
  > 설정 필요).

#### ③ Image and shape
- **Image**: `[Edit] → Change image → Canonical Ubuntu → 24.04`. (Oracle Linux가 기본 선택돼
  있을 수 있으니 반드시 Ubuntu로 변경.)
- **Shape**: `[Change shape] → Ampere` 탭 → **VM.Standard.A1.Flex** 선택 후 슬라이더로
  OCPU/메모리 지정.
  - Always Free 한도: A1 인스턴스 합산 **최대 4 OCPU / 24GB RAM**. 단독 인스턴스면
    **4 OCPU / 24GB**를 다 줘도 무료(빌드가 넉넉해진다). 최소 권장 **2 OCPU / 12GB**.
  - 무료 대상 shape에는 **"Always Free-eligible"** 배지가 붙는다 — 이걸 확인하고 고른다.
  - **`Out of host capacity` 대응**: ② AD 변경 → 그래도 안 되면 시간대를 바꿔 재시도(자원 회수가
    오프피크에 잘 풀림) → 그래도 막히면 폴백:
    **`Specialty and previous generation` 탭 → VM.Standard.E2.1.Micro**(x86, 1 OCPU/1GB,
    무료). 단 1GB라 `next build`가 OOM 나기 쉬우므로 스왑이 필수인데, 이는 `bootstrap.sh`가
    4GB 스왑으로 처리한다.

> ARM(A1)이어도 스택은 전부 arm64 호환이다: NodeSource Node 22, `postgres:16-alpine`,
> Caddy, next-swc/sharp 모두 arm64 프리빌트가 있어 추가 작업이 없다.

#### ④ Networking
- **Primary VNIC** 영역에서:
  - VCN: 1-2에서 만든 VCN
  - Subnet: 그 VCN의 **public subnet**
  - **Assign a public IPv4 address: 체크** (지금은 임시 IP가 붙고, 생성 후 ⑦에서 예약 IP로 교체)

#### ⑤ Add SSH keys
- `Paste public keys` 선택 후 `~/.ssh/your_key.pub` 내용을 붙여넣기(또는 .pub 파일 업로드).
  여기 등록한 키의 짝(private)으로 §2에서 `ssh ubuntu@...` 접속한다.

#### ⑥ Boot volume
- 기본 50GB로 충분(Always Free 블록 스토리지 합산 최대 200GB). 첨부가 DB에 쌓이는 만큼
  여유를 두려면 100GB까지 올려도 무료 한도 안이다. 나머지는 기본값 → **[Create]**.

#### ⑦ 생성 후: 예약 공인 IP 연결
인스턴스가 `Running`이 되면 임시 공인 IP를 1-1의 **예약 IP로 교체**한다(도메인 A 레코드가
안정적으로 가리키도록):

`인스턴스 상세 → Resources: Attached VNICs → (Primary VNIC) → Resources: IPv4 Addresses
→ 현재 Public IP 행의 ⋮ → Edit → Public IP type을 "No public IP"로 저장 → 다시 Edit →
"Reserved public IP" 선택 → 1-1에서 만든 예약 IP 지정 → 저장`

이후 인스턴스를 재생성/종료해도 그 예약 IP는 유지되므로 DNS·빌드 설정을 다시 안 만져도 된다.

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
