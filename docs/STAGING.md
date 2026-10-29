# dev 자동 배포 스테이징

`dev`에 push 또는 PR merge가 생기면 같은 커밋의 lint·타입 검사·단위 테스트 성공 후 `dev.support-b.com`으로 배포한다. `main`과 운영 서버 배포는 이 작업의 대상이 아니다. 전체 E2E는 기존처럼 `main` 대상 PR과 `main` push에서 실행한다.

기본값은 **자동 배포 꺼짐**이다. 이 문서와 저장소 파일 추가는 서버 생성·DNS 등록·GitHub 설정·실제 배포를 완료했다는 뜻이 아니다. 서버 준비 후 저장소 변수 `STAGING_DEPLOY_ENABLED=true`로 활성화한다.

## 구성

- 새 Lightsail Amazon Linux 2023 x86_64 VM 한 대, 운영과 같은 2GB RAM·2 vCPU·60GB SSD·월 $12(IPv4 포함 플랜). 기존 [Lightsail 런북](DEPLOY_LIGHTSAIL.md)의 bootstrap을 재사용한다.
- 구매사 `dev.support-b.com`, PG `partner.dev.support-b.com`, 선택적 관리자 `admin.dev.support-b.com`을 새 고정 IP에 연결한다.
- 앱·Postgres·Centrifugo는 전용 서버에서 기존 PM2/Compose 설정을 사용한다. 프로세스·컨테이너·볼륨 이름은 기존 파일과 같으므로 **운영 VM에서 함께 실행하지 않는다**.
- DB와 Auth/cron/Centrifugo 시크릿은 새로 만든다. R2는 운영 `prod-supporter-b`와 키까지 분리된 개발용 `dev-supporter-b`를 사용하며, 로컬 개발과 공유한다. 관리자 앱은 별도 저장소에서 배포하고 같은 스테이징 DB를 연결한다. 이 CI는 구매사/PG 앱만 배포한다.
- 실행 방식은 `next build` + `next start`, `NODE_ENV=production`이다. `.env.staging.example`을 서버의 **`.env.production`**으로 복사한다. `APP_ENV=staging`은 세션 쿠키 이름을 분리한다.

## 새 서버의 최초 준비

1. VM·고정 IP를 만들고 위 DNS A 레코드를 등록한다. 80/443과 배포 SSH 접근을 허용한다. GitHub 호스팅 러너에서 SSH에 도달할 수 있어야 하며, 5432/8000/3000은 공개하지 않는다.
2. 저장소는 deploy key를 허용하지 않는다. 자동 배포는 해당 Actions job의 `contents: read` 임시 `GITHUB_TOKEN`을 SSH 표준입력으로 전달하고 `git fetch`의 런타임 HTTP 헤더에서만 사용한다. 토큰은 서버 Git 설정이나 앱 환경에 저장하지 않는다. [GitHub 토큰 수명/범위](https://docs.github.com/en/actions/concepts/security/github_token).
3. 최초 checkout은 인증된 로컬 저장소의 `origin/dev` bundle을 서버에 전송해 만든다. 개인 GitHub 토큰을 서버에 저장하지 않는다. 아래 `<staging-ip>`에는 새 고정 IP를 넣고 확인된 SSH 키/known_hosts 설정을 사용한다.

```bash
git fetch origin dev
git bundle create /tmp/staging.bundle refs/remotes/origin/dev
scp /tmp/staging.bundle ec2-user@<staging-ip>:/home/ec2-user/staging.bundle
# 아래는 서버에서 실행한다.
git init "$HOME/bidit-staging"
cd "$HOME/bidit-staging"
git fetch "$HOME/staging.bundle" refs/remotes/origin/dev:refs/remotes/origin/dev
git checkout -b dev origin/dev
git remote add origin https://github.com/bothsides-platform-dev/supporter-b.git
bash scripts/deploy/lightsail-bootstrap.sh
```

Docker 그룹 반영을 위해 SSH에 다시 접속한다. bootstrap은 운영용 Caddy 파일을 복사하므로 **Caddy를 시작하기 전에** 다음 설정으로 교체한다. bootstrap을 다시 실행한 경우에도 이 교체가 필요하다.

```bash
cd "$HOME/bidit-staging"
cp .env.staging.example .env.production
chmod 600 .env.production
# 편집기로 DB 비밀번호·독립 시크릿·R2·영업일 달력 키 등을 설정한다.
sudo cp deploy/Caddyfile.staging /etc/caddy/Caddyfile
caddy hash-password
# /etc/caddy/caddy.env 에 APP_DOMAIN=dev.support-b.com 과
# STAGING_BASIC_AUTH_HASH=<위에서 생성한 bcrypt 해시>를 저장한다.
```

`deploy/Caddyfile.staging`은 모든 호스트를 `tester` Basic Auth로 보호하고 `X-Robots-Tag: noindex, nofollow`를 보낸다. 기존 도메인의 리다이렉트 설정을 포함하지 않는다. 관리자 앱을 준비하지 않았다면 관리자 호스트 블록과 DNS는 생략해도 된다. 비밀번호는 테스터에게 별도로 전달한다. 외부 서비스 웹훅은 Basic Auth를 통과하지 못하므로 연동 시 공급자 서명 검증을 유지하는 별도 경로 설정이 필요하다.

4. DB를 만들고 스키마·필수 정책/영업일 데이터를 준비한다.

```bash
pnpm install --frozen-lockfile
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
pnpm db:push
```

빈 스테이징 DB에 한해 schema를 초기 구성한다. 필요한 일회성 데이터 SQL·업종/PG 추천 정책·표준 요율·테스트 계정은 각 기능 런북과 관리자 앱으로 준비한다. 과거 SQL 파일을 전부 일괄 실행하지 않는다. `pnpm db:seed`는 기존 데이터를 지우는 개발 fixture이므로 자동 배포에 연결하지 않는다. 영업일 달력은 배포 스크립트가 적재하고 coverage를 검사한다.

5. **CI를 통과한 `dev` 커밋**을 checkout한 뒤 최초 빌드·기동과 접속을 확인한다.

```bash
DEPLOY_COMMIT="$(git rev-parse HEAD)" bash scripts/deploy/lightsail-deploy.sh
curl --fail http://127.0.0.1:3000/api/auth/session
git rev-parse HEAD > .git/staging-deployed
sudo systemctl enable --now caddy
pm2 startup
# pm2 startup이 안내한 sudo 명령을 실행한 뒤:
pm2 save
```

웹에서 구매사·PG 호스트의 인증, 로그인·로그아웃·워크스페이스 이동, 첨부, 채팅을 확인한다. 가입/메일/문자/전자서명은 외부 테스트 연동을 설정해야 검증할 수 있다. 예시의 빈 키는 성공을 모의하지 않으며, 수신자 제한 기능을 자동 제공하지도 않는다. 실제 발송을 켜기 전 테스트 계정·수신자만 사용하도록 서비스별 설정을 확인한다. 운영 DB·고객 연락처·도장·외부 자격증명을 그대로 복사하지 않는다.

cron은 [운영 런북](DEPLOY_LIGHTSAIL.md)과 각 기능 런북의 필요한 작업을 이 서버의 `127.0.0.1:3000`과 전용 `CRON_SECRET`으로 등록한다. 앱 기동만으로 cron이 등록되지는 않는다. OAuth를 쓰면 별도 클라이언트의 callback은 `https://dev.support-b.com/api/auth/callback/google`이다.

## GitHub에 한 번 등록할 값

Settings → Environments에 **`staging`**을 만들고 배포 브랜치를 `dev`로 제한한다. 자동 배포이므로 required reviewer 대기를 설정하지 않는다.

| 종류 | 이름 | 값 |
|---|---|---|
| Environment variable | `STAGING_SSH_HOST` | 새 서버 고정 IP 또는 SSH 호스트명 |
| Environment variable | `STAGING_SSH_USER` | `ec2-user` |
| Environment variable | `STAGING_PATH` | `/home/ec2-user/bidit-staging` |
| Environment secret | `STAGING_SSH_PRIVATE_KEY` | Actions→서버 전용 SSH 개인키. 공개키는 서버 `authorized_keys`에 등록 |
| Environment secret | `STAGING_SSH_KNOWN_HOSTS` | 위 SSH 호스트의 확인된 OpenSSH known_hosts 행 |
| **Repository variable** | `STAGING_DEPLOY_ENABLED` | 모든 준비와 최초 검증 후 `true` |

호스트 키는 Lightsail 콘솔 또는 신뢰된 SSH 연결에서 지문을 대조한다. CI에서 매번 `ssh-keyscan`한 값을 무조건 신뢰하지 않는다. Actions는 `StrictHostKeyChecking=yes`를 사용한다. 개인키를 Git이나 채팅에 올리지 않는다. 사용자·호스트·경로는 공백 없는 일반 POSIX 경로와 DNS/IP 형식만 지원한다.

이미 성공한 `dev` push 실행에서 **Re-run all jobs**를 누르면 새 설정으로 배포할 수 있다. 아직 저장소 `dev`에 이 워크플로가 없다면 먼저 이 변경을 머지한다. PR의 임시 merge SHA는 배포하지 않는다.

## 이후 자동 동작

1. `dev` push에서 lint/tsc와 unit이 실행된다. 둘 다 성공한 경우에만 staging job이 실행된다.
2. Actions가 검사한 `GITHUB_SHA`와 스크립트를 SSH로 전달한다. 임시 읽기 토큰은 표준입력으로 전달하고 fetch에만 사용한다. 서버는 `APP_ENV=staging`, 정확한 `APP_DOMAIN`, 깨끗한 checkout을 확인하고 `flock`으로 중복 실행을 막는다.
3. `origin/dev`가 해당 SHA보다 앞서갔다면 오래된 실행은 배포 없이 종료한다. 최신 커밋의 CI가 실패하면 그 커밋은 배포되지 않는다.
4. 서버가 정확한 SHA를 checkout하고 설치·달력 검사·빌드·PM2 reload를 실행한다. 이 모드에서는 내부 `git pull`이 생략된다. Centrifugo 설정 변경은 직전 배포 기준으로 확인한다.
5. 로컬 `/api/auth/session`의 HTTP 성공을 확인한 후 `.git/staging-deployed`에 SHA를 기록한다. 이 확인은 앱의 기본 응답 검사이며 DB·업무 시나리오 전체 검증을 대신하지 않는다.

Actions concurrency는 진행 중인 배포를 취소하지 않는다. 대기 순서는 보장되지 않으므로 서버의 최신 `dev` 확인도 함께 사용한다. 실패한 실행은 Actions에서 확인하고 원인을 해결한 뒤 재실행한다.

현재 운영과 같은 **제자리 빌드** 방식이다. 빌드 실패 중에는 스테이징의 기존 `.next`가 영향을 받을 수 있고, 자동 롤백은 없다. 무중단 릴리스 디렉터리 전환은 이 구성의 범위가 아니다. HTTP 검사 실패도 이미 수행한 PM2 reload를 되돌리지는 않는다.

## DB 변경이 있는 커밋

`lib/db/schema`, `scripts/migrations`, `scripts/sql`, `docs/migrations`, `drizzle.config.ts`가 직전 배포 이후 바뀌면 자동 배포를 중단한다. 임의 `db:push --force`나 DB 초기화는 실행하지 않는다. 이 경로 밖에서 필요한 데이터 작업은 담당자가 별도로 확인한다.

해당 커밋의 DDL·데이터 변경을 **스테이징 DB에 먼저 적용·검증한 후** 서버에서 전체 SHA를 기록한다. SQL은 대상 커밋에서 추출하거나 별도 checkout으로 가져온다. 배포 checkout을 수동 갱신해 기준점을 우회하지 않는다.

```bash
cd "$HOME/bidit-staging"
# 검토한 전체 40자리 대상 SHA로 대체한다.
printf '%s\n' '<verified-dev-sha>' > .git/staging-schema-ready
```

이후 실패한 GitHub 실행을 재실행한다. 확인 기록은 정확히 그 SHA에만 유효하다. 이미 다음 `dev` 커밋이 생겼으면 그 커밋까지 검토하고 새 SHA로 기록한다. 최초 빈 DB 준비는 위 최초 준비 절에서 별도로 수행한다.

## 중단과 복구

저장소 변수 `STAGING_DEPLOY_ENABLED=false`는 이후 자동 배포를 막는다. 이미 실행 중인 SSH 배포는 종료될 때까지 기다린다. 기존 앱이나 데이터는 삭제하지 않는다.

수동 복구는 먼저 자동 배포를 끄고 다른 배포가 끝난 것을 확인한다. DB와 호환되는 커밋을 골라 checkout한 뒤 `DEPLOY_COMMIT=<전체 SHA> bash scripts/deploy/lightsail-deploy.sh`로 다시 빌드한다. 접속 확인 후 `.git/staging-deployed`를 해당 SHA로 기록한다. 자동 배포를 다시 켜면 다음 성공한 최신 `dev` 커밋이 다시 배포되므로 코드 문제는 revert 커밋으로 해결한다.
