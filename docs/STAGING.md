# dev 자동 배포 스테이징

`dev`에 push 또는 PR merge가 생기면 GitHub Actions가 검사·빌드한 **동일한 산출물**을 `dev.support-b.com`에 배포한다. 서버는 소스를 가져오거나 의존성을 설치하거나 빌드하지 않는다. 운영 서버 배포는 기존 런북을 유지한다.

## PG 업무 화면 v2 — DDL·읽기 선행

`scripts/migrations/20261101-pg-workspace-v2.sql`을 먼저 적용하고 본 서비스와 admin-supporter-b의 v2 읽기를 함께 준비한다. 두 앱의 호환 읽기를 확인한 뒤 `PG_QUOTE_V2_WRITE_ENABLED=true`로 발송을 연다. 활성화 후 구버전 읽기로 롤백하지 않는다. 상세 절차·관측·복구는 [PG 업무 화면 v2](PG_WORKSPACE_V2.md#반영-순서)를 따른다.

## 구성과 비용

- Lightsail `supporter-b-staging`, 서울 `ap-northeast-2a`, Amazon Linux 2023 x86_64.
- 운영과 같은 2GB RAM · 2 vCPU · 60GB SSD · 3TB 전송량, IPv4 포함 **월 $12** 플랜. 세금·초과 사용량은 별도다.
- 고정 IP `15.165.72.233`. 구매사 `dev.support-b.com`, PG `partner.dev.support-b.com`의 A 레코드를 이 주소로 연결한다.
- Caddy HTTPS → systemd의 Next.js standalone 서버(3000). Postgres와 Centrifugo는 이 VM의 Docker Compose로 실행한다. 운영 VM과 프로세스·데이터를 공유하지 않는다.
- 전용 DB·Auth/cron/Centrifugo 시크릿을 사용한다. R2는 운영과 키까지 분리한 `dev-supporter-b`이며 로컬 개발과 공유한다.
- 웹페이지·앱 API에 `tester` Basic Auth와 `X-Robots-Tag: noindex, nofollow`를 적용한다. 세션 쿠키는 `authjs.staging.*`, 도메인은 `.dev.support-b.com`으로 운영 로그인과 분리한다.
- 관리자 앱은 별도 저장소이므로 이 파이프라인에 포함하지 않는다. 메일·문자·전자서명·OAuth·Slack·분석 도구는 별도 테스트 설정 전까지 비활성이다. 서버 전용 도장도 빌드 산출물에 포함하지 않는다.

## CI와 배포 흐름

```text
dev PR / push
  ├─ lint + next typegen + tsc
  │    └─ Linux CI: next build → 운영 명령 컴파일 → standalone 패키징
  └─ unit tests
       ↓ 모두 성공한 dev push만
  최신 dev SHA 확인 → GitHub Artifact 다운로드 → SSH 전송
  SHA-256·빌드 SHA·환경·DB 준비 확인
  달력 적재/coverage 검사 → 3100 후보 기동 검사
  current 링크 전환 → systemd 재시작 → 3000 HTTP 검사
       └─ 실패: 직전 릴리스 복구
```

- 빌드는 Ubuntu 24.04 x86_64에서 `mise.toml`의 Node 버전과 frozen pnpm lockfile로 수행한다. Next의 타입 검사를 건너뛰지 않는다. 빌드에는 운영 DB/서비스 키가 필요 없다. PG 가입의 회사 목록은 요청 시점에 DB에서 조회한다.
- `.next/standalone`의 런타임 의존성, `public`, `.next/static`, PDF 폰트, 컴파일한 달력 명령과 Compose 설정을 tar로 묶는다. pnpm 심볼릭 링크를 상대 경로 그대로 보존한다. `.env*`는 제외한다.
- 산출물 이름은 `<commit SHA>-<workflow run number>-<attempt>`다. GitHub Artifact는 14일 보관한다. SHA-256와 내부 manifest/BUILD_ID를 서버에서 대조하며 같은 릴리스를 덮어쓰지 않는다.
- 배포는 GitHub `staging` Environment의 `dev` 브랜치만 허용한다. CI concurrency와 서버 `flock`이 중복 실행을 막고, 이미 배포된 것보다 오래된 실행은 건너뛴다.
- 전환 전 후보를 별도 포트에서 확인한다. 전환 후 실패하면 이전 `current`와 Compose 설정을 복구하고 재시작한다. 첫 배포에는 복구할 이전 버전이 없다. 단일 앱 프로세스 재시작 동안 짧은 접속 중단이 있으므로 무중단 배포는 아니다.
- 성공 시 서버에 최근 5개 릴리스를 남기고 직전 버전은 항상 추가 보존한다. 전송한 tar는 삭제한다. 공유 환경 파일과 DB 볼륨은 정리 대상이 아니다.
- HTTP 검사는 `/api/auth/session`의 기본 응답을 확인한다. 달력 검사는 DB 접근/필수 데이터도 확인하지만 전체 업무 E2E를 대신하지 않는다. 전체 E2E는 기존 정책대로 `main` PR/push에서 실행한다.

[GitHub의 job 간 artifact 전달](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts), [배포 Environment](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments), [Next.js standalone 출력](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)을 따른다.

## 서버 최초 준비

[Lightsail bootstrap](DEPLOY_LIGHTSAIL.md)으로 Node·Docker·Compose·Caddy를 준비한다. 앱 실행에는 pnpm/PM2가 필요 없다. 설치 작업에 사용한 소스 checkout은 배포 경로가 아니다. 22/80/443만 공개하며 3000/3100/5432/8000은 방화벽에서 공개하지 않는다.

```text
/home/ec2-user/staging/
├─ shared/.env.production     # 모드 600, 서버 전용 시크릿
├─ shared/schema-ready        # 적용 확인한 DB 정의의 SHA-256
├─ shared/candidate.log       # 최근 후보의 시작 로그
├─ incoming/                  # CI가 전송한 tar와 실행 스크립트
├─ releases/<release-id>/     # 검증한 실행 산출물
└─ current -> releases/<id>  # 현재 앱
```

```bash
install -d -m 700 /home/ec2-user/staging/{shared,incoming,releases}
# .env.staging.example을 참고해 shared/.env.production을 준비한다.
chmod 600 /home/ec2-user/staging/shared/.env.production
sudo install -m 644 deploy/supporter-b-staging.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable supporter-b-staging
# current가 준비되면 배포 스크립트가 시작한다.
```

`deploy/supporter-b-staging.service`는 `ec2-user`와 위 경로를 사용한다. 다른 사용자/경로라면 함께 수정한다. `/usr/local/bin/node`의 버전은 `mise.toml`과 맞춘다. 서비스는 `.env.production`을 읽어 `node current/server.js`만 실행한다. `NEXT_PUBLIC_*`는 CI 빌드 시 고정되므로 주소를 바꾸면 workflow의 빌드 환경도 고치고 다시 빌드한다.

실시간 `/connection/*`는 브라우저의 호스트별 Basic Auth 캐시와 분리해 Centrifugo JWT·구독 ACL로 보호한다. 토큰 발급 앱 API는 Basic Auth와 앱 로그인을 모두 요구한다. 유효한 토큰 없이 연결할 수 없다.

메일을 끈 상태에서는 `RESEND_API_KEY`를 아예 설정하지 않는다. 빈 문자열로 설정하면 기존 production 시작 검사가 앱 기동을 거부한다.

Caddy는 `deploy/Caddyfile.staging`을 사용하고 `/etc/caddy/caddy.env`에 `APP_DOMAIN=dev.support-b.com`, `STAGING_BASIC_AUTH_HASH`를 설정한다. 관리자 앱이 없으면 관리자 호스트 블록은 생략한다. Basic Auth 비밀번호는 별도 전달한다. 웹훅 연동 시에는 공급자 서명 검증을 유지하는 경로 설정이 추가로 필요하다.

빈 DB에는 검토한 스키마와 필수 업종·PG 정책·테스트 계정을 최초 1회 준비한다. 개발 seed는 데이터를 지우므로 자동 배포에서 실행하지 않는다. 이미 운영하는 DB에 `db:push --force`나 과거 SQL 전체를 실행하지 않는다. 달력은 배포할 때 적재/검사한다.

R2 CORS에는 기존 로컬 origin과 함께 `https://dev.support-b.com`, `https://partner.dev.support-b.com`의 PUT을 허용한다. 테스트 고객 데이터만 사용한다. 외부 발송을 켜려면 해당 공급자의 테스트 설정과 수신자를 별도로 확인한다.

cron은 전용 `CRON_SECRET`으로 localhost API를 호출한다. 현재 준비 대상은 `rfp-deadlines`(매분), `sync-business-calendar`(일 1회), `sweep-uploads`(시간당 1회)다. 외부 발송/전자서명 관련 cron은 연동을 활성화할 때 추가한다.

## GitHub 설정

Settings → Environments의 `staging` 배포 브랜치를 `dev`로 제한한다. 자동 배포이므로 required reviewer 대기를 두지 않는다.

| 종류 | 이름 | 값 |
|---|---|---|
| Environment variable | `STAGING_SSH_HOST` | `15.165.72.233` |
| Environment variable | `STAGING_SSH_USER` | `ec2-user` |
| Environment variable | `STAGING_PATH` | `/home/ec2-user/staging` |
| Environment secret | `STAGING_SSH_PRIVATE_KEY` | Actions→스테이징 전용 SSH 키 |
| Environment secret | `STAGING_SSH_KNOWN_HOSTS` | 신뢰된 경로로 지문을 확인한 known_hosts |
| Repository variable | `STAGING_DEPLOY_ENABLED` | 준비 후 `true`, 중단할 때 `false` |

서버에 GitHub 토큰이나 repository deploy key를 저장할 필요가 없다. SSH는 `StrictHostKeyChecking=yes`이며 매 실행마다 조회한 호스트 키를 무조건 신뢰하지 않는다. GitHub 토큰 권한은 artifact/checkout에 필요한 `contents: read`다. 배포 키는 빌드 job에 전달하지 않는다.

워크플로가 dev에 들어간 뒤 push 또는 **Re-run all jobs**로 배포한다. PR의 임시 merge SHA는 자동 배포하지 않는다. 오래된 dev 실행을 재실행해도 최신 dev가 아니면 건너뛴다.

## DB 변경 선행 절차

배포 manifest의 `schema`는 해당 커밋의 `lib/db/schema`, `scripts/migrations`, `scripts/sql`, `docs/migrations`, `drizzle.config.ts` Git tree를 SHA-256으로 계산한 값이다. 직전 릴리스와 다르면 `shared/schema-ready`가 새 값과 같을 때만 진행한다. 초기 배포도 이 확인이 필요하다.

1. 대상 artifact의 `release.json`과 해당 커밋의 DDL/데이터 변경을 검토한다.
2. **스테이징 DB에만** 필요한 변경을 적용·검증한다. 실행 중인 구버전과의 호환성도 확인한다.
3. 검증한 manifest의 `schema`를 `/home/ec2-user/staging/shared/schema-ready`에 한 줄로 기록한다.
4. 실패한 최신 dev 실행을 **Re-run all jobs**한다.

이 receipt는 schema 내용에 묶이므로 DB와 무관한 다음 커밋에는 다시 승인할 필요가 없다. 감시 경로 밖의 데이터 작업은 담당자가 확인한다. DB 변경은 앱 자동 롤백으로 되돌리지 않는다.

## 장애 확인과 복구

```bash
sudo systemctl status supporter-b-staging
sudo journalctl -u supporter-b-staging -n 100 --no-pager
cat /home/ec2-user/staging/shared/candidate.log
cat /home/ec2-user/staging/current/.release.json
```

배포를 멈출 때는 `STAGING_DEPLOY_ENABLED=false`로 바꾸고 이미 진행 중인 배포의 종료를 기다린다. 실패한 후보는 현재 앱에 전환하지 않는다. 전환 뒤 HTTP 실패는 자동 복구 결과를 Actions 로그에서 확인한다. 복구 자체가 실패하면 서비스 로그와 DB/Compose 상태를 확인한다.

수동 복구는 자동 배포를 끄고 `deploy.lock`을 잡은 상태에서 DB와 호환되는 보관 릴리스로 `current`를 원자 교체한다. 같은 릴리스의 `.ops/docker-compose.yml`을 `-p bidit-staging --env-file shared/.env.production`으로 적용하고 서비스를 재시작한 뒤 응답을 확인한다. 오래된 CI 실행의 재실행으로는 이전 버전을 배포하지 않는다. 지속 복구는 문제 커밋을 revert해 최신 dev의 CI 산출물로 배포한다.
