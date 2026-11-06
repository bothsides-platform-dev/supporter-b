# 운영 CI 산출물 배포

운영 앱은 `main`의 GitHub Actions에서 빌드하고, 서버는 완성된 standalone 산출물만 실행한다. 스테이징 산출물은 주소·쿠키 환경이 다르므로 운영에 재사용하지 않는다. 관리자 앱은 별도 저장소이므로 이 배포에 포함하지 않는다.

## 배포 흐름

- `main` 대상 PR과 `main` push에서 운영용 빌드를 검증한다. Node는 `mise.toml`, 의존성은 frozen lockfile을 사용한다. `.next/cache`는 스테이징과 별도 키로 보존한다.
- `main` push의 lint·unit·E2E·운영 빌드가 모두 성공하고 repository variable `PRODUCTION_DEPLOY_ENABLED=true`일 때만 운영 배포한다. 최신 main SHA를 다시 확인하며 오래된 실행은 건너뛴다.
- `production` Environment의 SSH 자격증명으로 산출물을 전송한다. 호스트 키를 고정하고 CI SHA-256·manifest·BUILD_ID·Node 버전·운영 환경·공개 환경변수를 서버에서 확인한다.
- DB와 Compose/Centrifugo 정의가 바뀌면 각각 `schema-ready`·`infra-ready` 확인 파일을 요구한다. **자동 배포는 DDL·Compose·DB 볼륨을 변경하지 않는다.** 기존 Compose 프로젝트와 영속 볼륨을 유지하고 필요한 인프라 변경은 먼저 수동 적용한다.
- 달력 적재/coverage 검사 → 3100 후보 기동/HTTP 검사 → 기존 `bidit` 완전 정지 → current 전환 → PM2 standalone 시작 → 3000 HTTP 검사 → `pm2 save` 순서다. 후보는 외부 프록시/cron에 연결하지 않는다.
- 실패하면 직전 standalone 릴리스로 복구한다. 첫 전환 실패는 보존한 기존 checkout의 `ecosystem.config.cjs`로 복구한다. 관리자 PM2 프로세스는 변경하지 않는다. 최근 5개와 직전 릴리스를 보존한다.

단일 앱의 정지/시작 동안 짧은 중단이 있다. `/api/auth/session` 검사는 기본 기동 확인이고 업무 전체 검증은 CI E2E와 운영 점검으로 보완한다. CI 검사 시간까지 없어지는 것은 아니며 운영 VM의 컴파일 부하를 제거하는 변경이다.

## GitHub 최초 설정

기존 `Production` Environment는 GitHub에서 이름을 대소문자 구분 없이 취급한다. 배포 허용 브랜치를 **main만**으로 제한한다. 설정 전에는 `PRODUCTION_DEPLOY_ENABLED`를 켜지 않는다.

| 범위 | 이름 | 값 |
|---|---|---|
| Repository variable | `PRODUCTION_DEPLOY_ENABLED` | 최초 준비 후 `true`; 중단 시 `false` |
| production Environment variable | `PRODUCTION_SSH_HOST` | 운영 SSH 호스트 |
| production Environment variable | `PRODUCTION_SSH_USER` | `ec2-user` |
| production Environment variable | `PRODUCTION_PATH` | `/home/ec2-user/production` |
| production Environment secret | `PRODUCTION_SSH_PRIVATE_KEY` | 운영 배포 전용 SSH 키 |
| production Environment secret | `PRODUCTION_SSH_KNOWN_HOSTS` | 신뢰된 경로로 확인한 운영 호스트 키 |

다음 **Repository variables**는 운영 `.env.production`의 같은 이름에서 `PRODUCTION_` 접두어만 붙여 복사한다. 빌드 job은 배포 Environment를 사용하지 않으므로 Environment에만 두면 읽지 못한다. 전부 브라우저에 공개되는 값이다. 미설정 값은 빈 값으로 맞춘다.

- `PRODUCTION_NEXT_PUBLIC_SENTRY_DSN`
- `PRODUCTION_NEXT_PUBLIC_CHANNEL_IO_PLUGIN_KEY`
- `PRODUCTION_NEXT_PUBLIC_GA_MEASUREMENT_ID`
- `PRODUCTION_NEXT_PUBLIC_MASTER_OAUTH_ENABLED`
- `PRODUCTION_NEXT_PUBLIC_GUEST_RFP_SLACK_THREADS_ENABLED`

`NEXT_PUBLIC_BASE_URL=https://support-b.com`, `NEXT_PUBLIC_BUYER_ORIGIN=https://support-b.com`, `NEXT_PUBLIC_PARTNER_ORIGIN=https://partner.support-b.com`, `NEXT_PUBLIC_CENTRIFUGO_WS_URL=wss://support-b.com/connection/websocket`은 workflow에 고정한다. 서버와 다르면 배포가 중단된다. 신규 `NEXT_PUBLIC_*`를 추가할 때 workflow도 함께 갱신한다.

Sentry 업로드를 유지하려면 Repository variables `SENTRY_ORG`, `SENTRY_PROJECT`와 Repository secret `SENTRY_AUTH_TOKEN`을 설정한다. 토큰은 main push의 빌드 단계에만 주입하며 PR 빌드에는 전달하지 않는다. AUTH_SECRET·DB·메일·결제 등 런타임 시크릿은 서버에만 둔다.

## 서버 최초 준비와 첫 전환

기존 `/home/ec2-user/supporter-b` checkout·`.next`·의존성·환경 파일은 첫 전환 복구용으로 보존한다. 서버 Node 버전을 `mise.toml`과 맞춘다. PM2·Docker·Caddy·cron은 기존 구성을 사용한다. 3100은 외부에 공개하지 않는다.

```bash
rtk proxy install -d -m 700 /home/ec2-user/production/shared /home/ec2-user/production/incoming /home/ec2-user/production/releases
rtk proxy install -m 600 /home/ec2-user/supporter-b/.env.production /home/ec2-user/production/shared/.env.production
rtk proxy install -m 600 /home/ec2-user/supporter-b/lib/server/signing/assets/noon-seal-2026-10-21.png /home/ec2-user/production/shared/noon-seal-2026-10-21.png
rtk proxy bash -c 'printf "%s\n" /home/ec2-user/supporter-b > /home/ec2-user/production/shared/legacy-path'
```

`shared/.env.production`에 `APP_ENV=production`, `APP_DOMAIN=support-b.com`을 지정한다. 기존 값은 보존한다. 법인 도장의 해시는 [합의서 런북](PLATFORM_BUYER_AGREEMENT_IMPLEMENTATION.md)과 대조한다. 앱은 릴리스 내부 심볼릭 링크를 통해 원본을 읽으며 도장은 산출물에 포함하지 않는다. 서버에 RTK가 없으면 위 명령의 `rtk proxy` 접두어만 빼고 실행한다.

1. main 빌드의 `production-<SHA>-<run>-<attempt>` artifact를 내려받고 `release.json`과 변경 내용을 검토한다.
2. [운영 런북](DEPLOY_LIGHTSAIL.md)의 해당 DDL·데이터·기능 전환 절차를 적용하고 검증한다. 최초 전환도 현재 DB가 대상 스키마와 호환되는지 확인한다.
3. Compose/Centrifugo 변경이 있으면 **기존 checkout과 기존 Compose 프로젝트**에서 먼저 적용한다. 새 배포 디렉터리에서 별도 프로젝트로 `compose up`하지 않는다. 특히 Centrifugo meta 설정은 새 앱보다 먼저 반영한다.
4. 검증한 manifest의 `schema`를 `shared/schema-ready`, `infrastructure`를 `shared/infra-ready`에 한 줄로 기록한다. 이 파일은 실제 준비를 확인한 뒤 기록하며 자동 생성하지 않는다.
5. 위 GitHub 설정과 서버의 공개 환경변수가 일치하는지 확인하고 `PRODUCTION_DEPLOY_ENABLED=true`로 켠다.
6. 최신 main 실행을 **Re-run all jobs**한다. 전환 완료 후 구매사·PG 로그인, 채팅, 계약 PDF와 기존 cron을 확인한다.

이후 앱만 바뀌면 준비 확인을 반복하지 않는다. DDL·인프라 fingerprint가 바뀐 배포는 준비를 마칠 때까지 중단된다. env 파일 변경은 `shared/.env.production`에 적용한다. 기존 cron이 구 checkout의 env를 읽는다면 해당 파일도 동기화하거나 cron의 env 참조를 shared 경로로 변경한다. 기존 checkout에서 `lightsail-deploy.sh`를 다시 실행하면 이전 서버 빌드 방식으로 돌아가므로 전환 뒤 혼용하지 않는다.

## 장애 확인과 복구

```bash
rtk proxy pm2 status
rtk proxy pm2 logs bidit --lines 100 --nostream
rtk proxy cat /home/ec2-user/production/shared/candidate.log
rtk proxy cat /home/ec2-user/production/current/.release.json
```

`PRODUCTION_DEPLOY_ENABLED=false`는 이후 배포를 막는다. 이미 실행 중인 배포는 종료를 기다린다. 복구 실패 로그가 있으면 기존 앱/PM2 상태를 확인한다. 자동 복구는 앱만 되돌리며 DB·인프라는 되돌리지 않는다. 이전 앱과 호환되지 않는 DDL·계약 종류 전환은 해당 전환 런북의 정지·배출·복구 절차를 우선한다.

수동 복구는 자동 배포를 끄고 `deploy.lock`을 잡은 상태에서 DB와 호환되는 보관 릴리스로 current를 원자 교체한 뒤 `bidit`만 정지/삭제하고 `shared/ecosystem.config.cjs --only bidit`으로 시작한다. HTTP 확인 후 `pm2 save`한다. 오래된 CI 실행 재실행은 버전 되돌리기에 사용하지 않는다. 지속 복구는 revert한 최신 main 산출물을 배포한다.

참고: [Next.js standalone 출력](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [GitHub Environment 설정](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
