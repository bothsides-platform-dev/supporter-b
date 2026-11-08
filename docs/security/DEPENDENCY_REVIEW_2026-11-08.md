# 의존성 보안 검토 — 2026-11-08

상태: **보안 전용 브랜치 `codex/security-dependencies`에서 의존성 수정·audit·빌드·전체 회귀 검사 완료.** 운영 배포는 수행하지 않았다.

## 범위와 기준선

기존 서비스의 `dev` 커밋 `232c07e4849f0e92b695f9067807e28da9d3ec1c`을 기준으로 직접·전이 의존성, 개발 도구, 패키지 설치 도구를 검토했다. `pnpm audit` 결과를 프로젝트 공식 보안 공지·지원 정책·설치 소스와 대조했다. 신규 B2A 기능과 전용 의존성은 이번 수정 범위에서 제외했다.

| 집계 기준 | 수정 전 | 수정 후 |
| --- | --- | --- |
| audit `metadata.totalDependencies` | 1,273 | 1,047 |
| lockfile의 고유 `name/version` 조합 | 1,271 | 1,043: 기존 조합 312개 제거, 84개 추가 |
| audit `metadata.vulnerabilities` | Critical 2 / High 20 / Moderate 41 / Low 8, 합계 71 | 모든 심각도 0 |
| JSON `advisories` 항목 수 | 70 | 0 |
| `github_advisory_id` 중복 제거 | 62 GHSA | 0 |
| production 범위 별도 audit | 이 기준선에서는 전체 audit만 실행 | 모든 심각도 0; audit dependencies 485 |

audit 수치는 보안 전용 기준선 `/tmp/support-b-security-audit-before.json`, lockfile inventory는 `/tmp/support-b-security-inventory-before.json`에서 읽었다. 메타데이터 합계와 advisory 항목 수가 달라 원문 값을 각각 보존했다. 동일 GHSA가 여러 패키지에 매핑되므로 71건을 “고유 취약점 71개”로 표현하지 않는다. 별도 B2A 조사에서 얻은 패키지 수·결과는 합산하지 않는다.

수정 후 근거는 `/tmp/support-b-security-audit-after.json`과 `/tmp/support-b-security-audit-prod-after.json`이다. lockfile에는 고유 패키지 이름 967개가 있다. 이름 수, 버전을 포함한 조합 수, audit 메타데이터는 서로 다른 집계다. 첫 수정 후 JSON의 1,048개는 중간 결과이므로 최종 수치에 사용하지 않는다.

수정 전 70개 감사 레코드의 영향 범위·처리 결과, 전후 직접 의존성 76개 항목, 전후 audit 메타데이터를 [기계 판독 근거](DEPENDENCY_AUDIT_2026-11-08.json)에 보존했다. 전체 수정 후 패키지 목록과 무결성 값은 저장소 lockfile이 기준이다.

- 실행일: 2026-11-08 UTC. `pnpm audit --json --registry https://registry.npmjs.org`, `pnpm audit --prod --json --registry https://registry.npmjs.org` 모두 종료 코드 0. 예외·무시 항목 없음.
- 검증한 `pnpm-lock.yaml` SHA-256: `db58ab9826b95f741582d864bcf1be163c8ca390bb8b24828b7b92af8b32fa0b`
- 검증 대상: 위 기준 커밋 이후의 `codex/security-dependencies` 변경과 위 lockfile 해시. 운영 배포는 수행하지 않았다.

## 우선 조치와 근거

| 대상 | 수정 전 | 필요한 조치 | 실제 반영 |
| --- | --- | --- | --- |
| Next.js | 16.4.3 + 개발용 HMR 패치 | **16.4.5**. 11월 3일 공지 7건은 초기 audit 결과에 없었음. [공식 목록](https://github.com/vercel/next.js/security/advisories) | 16.4.5. upstream에 기존 HMR 수정이 없어 [16.4.5 패치](../../patches/next@16.4.5.patch)로 이식 |
| Undici | 7.29.0 | **7.30.2 이상, 7.x 유지**. TLS 재협상 DoS와 11월 5일 추가 공지 포함. [TLS 공지](https://github.com/nodejs/undici/security/advisories/GHSA-qrxm-fqhp-jwvm), [11월 수정](https://github.com/nodejs/undici/security/advisories/GHSA-7xg3-fphp-28hg) | 직접·전이 7.30.2 |
| Sentry | 10.51.0 | **10.75.2 이상, 10.x 유지**. tunnelRoute의 middleware skip 범위 수정. [공식 공지](https://github.com/getsentry/sentry-javascript/security/advisories/GHSA-mchm-gjx6-7h55) | `@sentry/core`, `@sentry/nextjs` 모두 10.78.0 정확 고정 |
| Zod | 4.4.3 및 전이 3.25.76 | 직접 사용을 **4.6.6 이상**으로 수정하고 v3 전이 경로를 별도 처리. 부모 API 확인 없이 v3를 v4로 일괄 강제하지 않음. [수정 PR](https://github.com/colinhacks/zod/pull/6652) | lockfile에는 4.6.7만 남음. 취약 v3 부모 경로 제거·갱신 |
| deepmerge | 4.3.1 전이 의존성 | 고정 릴리스 없음. 취약 의존성을 제거. [upstream 보고](https://github.com/TehShrike/deepmerge/issues/273), [render 변경 기록](https://github.com/resend/react-email/blob/canary/packages/render/CHANGELOG.md) | render 2.2.0·Resend 6.37.0, 미사용 shadcn CLI 제거; deepmerge가 lockfile에서 사라짐 |
| pnpm | 9.15.9 / CI의 9 태그 | **10.34.9 고정**. 9 지원 종료, 설치 경로 탈출은 10.34.5부터 수정. [공식 공지](https://github.com/pnpm/pnpm/security/advisories/GHSA-vq4v-j7r6-jq4m), [지원 정책](https://github.com/pnpm/pnpm/security/policy) | packageManager 10.34.9. CI·배포 스크립트가 해당 정확 버전을 사용하도록 변경 |
| Vitest / Vite | 4.1.11 / 8.0.16 | Vitest **4.1.12**, Vite 최소 **8.1.6**. 두 계열 모두 보안 지원 중이므로 큰 major 전환 불필요. [mocker 수정](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8), [Vite 수정](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22) | lockfile은 4.1.12 / 8.1.6. manifest의 `~` 범위와 동일 minor 내 override |
| 기타 전이 의존성 | audit JSON 참조 | 부모 갱신 또는 호환 가능한 패치 override. 제거된 CLI 의존성과 앱 런타임 경로를 구분 | fast-uri·fast-copy·source-map-js·smol-toml·brace-expansion 갱신. minimatch ≥7과 glob ≥9 경로만 새 major로 보정하여 구형 minimatch 3 API 보존. js-yaml은 안전한 4.3.2로 제한. 전체 처리 결과는 기계 판독 근거에 기록; audit 예외 없음. |

### 실제 사용 조건

- **Undici는 외부 URL 처리 경로에 도달 가능하다.** [웹사이트 수집](../../lib/server/quote-assist/website.ts)의 `new Agent()`가 사용자 웹사이트에 연결한다. 설치 소스에 TLS 오류를 프로세스 assertion으로 바꾸는 코드가 남아 있었다. 공인 IP 고정·본문 크기·요청 시간 제한은 이 오류를 막지 못한다. 공식 공지와 코드에 따른 판단이며 악성 TLS 서버 공격은 실행하지 않았다.
- **Sentry의 심각도와 도달 조건을 구분한다.** 초기 audit는 Critical로 분류했으나 확인한 공식 공지는 Moderate다. `tunnelRoute` 설정은 존재한다. 실제 우회에는 webpack 빌드, tunnel 하위에 해석되는 앱 경로, middleware에만 의존한 인가가 함께 필요하다. 기본 `next build`는 Turbopack이고 서버 권한 검사도 있으므로 “즉시 인증 우회 가능”으로 단정하지 않는다.
- **Next 7건 모두의 공격 조건이 충족된 것은 아니다.** `use cache`, `unstable_cache`, Cache Components, Edge API 사용은 찾지 못했다. 이미지 최적화는 활성화되어 있지만 공격자 SVG 공급 경로까지 입증하지 않았다. 검토한 PDF 중계는 upstream 헤더를 새로 구성한다. 영향 버전이므로 16.4.5로 갱신하되, 발견된 침해로 표현하지 않는다.
- **deepmerge는 반환 객체 오염을 로컬에서 재현했다.** null-prototype target, null nested target, target 복사 3종에서 inherited 속성이 생겼으며 전역 `Object.prototype`은 변하지 않았다. 현재 메일은 `render(jsx)`만 호출하고 외부 변환 옵션을 받지 않아 해당 merge까지 사용자 객체가 도달하는 경로는 찾지 못했다.
- **개발 도구와 운영 서버를 구분한다.** Vitest는 node/jsdom 테스트만 실행하며 UI·Browser·API 서버를 켜지 않는다. 앱 서버는 Next다. `proxy-addr`의 초기 경로는 shadcn CLI 전이 Express이며, 앱이 해당 Express 서버를 운영한다는 근거는 없다. [proxy-addr 수정](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h).
- **pnpm은 설치 시 실행되는 보안 경계다.** 조작된 tarball·lockfile의 경로 탈출은 `--ignore-scripts`에서도 발생한다. 10 전환 후 현재 dependency build script 4종은 모두 명시적으로 차단하고 optional npm 바이너리로 실행한다. Linux x64의 일반 clean install과 미검토 스크립트 차단을 검증했다. 현재 저장소에 악성 설치 입력이 있다는 증거를 발견한 것은 아니다.

## 확인한 수정 상태와 별도 추적

| 항목 | 2026-11-08 판단 |
| --- | --- |
| React 19.2.4 | RSC 공지는 `react-server-dom-*` 대상이다. 이 앱은 Next 내부 사본을 사용하며 10월 대응 수정은 Next **16.4.1**에 포함된다. React 버전 숫자만으로 미수정 RCE라고 판단하지 않는다. [Next 공지](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) |
| Auth.js beta.32 / @auth/core 0.41.3 | 7월 공지 4건의 수정 버전. 설치 소스에서도 provider-bound cookie, NFKC 정규화, malformed Bearer 처리를 확인. beta·최신 릴리스 중심의 지원 정책은 계속 추적. [보안 릴리스](https://better-auth.com/blog/security-update-july-2026) |
| PDF.js 6.2.108 | 악성 PDF script 실행 공지의 수정 버전. [공식 공지](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j) |
| sharp 0.35.5 | 수정된 librsvg 2.63.2를 실제 로드하여 확인. 운영 산출물도 별도 확인해야 함. [공식 공지](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w) |
| jose 6.x | 확인한 공식 공지 영향 범위 밖이며 v6는 보안 지원 대상. [지원 정책](https://github.com/panva/jose/security/policy) |
| ESLint 9.39.4 | **2026-08-06 지원 종료**. 마지막 9.39.5는 보안 수정으로 소개되지 않는다. 본체 공개 advisory는 찾지 못했으나 전이 의존성은 별도 처리. ESLint 10 전환을 플러그인 호환성 검증이 필요한 후속 작업으로 남김. [지원 표](https://eslint.org/version-support/) |
| Node 22.23.4 | 11/8 확인 기준 최신 22계열 보안 릴리스이며 지원 중인 Maintenance LTS다(2027-04-30까지). 기존 운영·CI 호환성을 유지하는 수정으로 선택했고 상위 major 전환은 별도 검증한다. [22.23.4 릴리스](https://nodejs.org/en/blog/release/v22.23.4), [지원 일정](https://github.com/nodejs/Release#release-schedule). 프로젝트 선언·로컬 실행 버전이며 내장 Undici는 6.29.1. 외부 Undici 패키지 갱신과 구분해야 함. **11월 11일 또는 직후에 22/24/26 계열의 최고 High 보안 릴리스가 예정**되어 있고 현재 새 수정 버전은 미공개. 발표 후 mise·CI·실제 VM을 함께 재점검. [공식 사전 공지](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases) |

**B2A는 별도 검토한다.** `@modelcontextprotocol/server 2.4.0`과 `@node-oauth/oauth2-server 5.3.1`은 dev 기준선에 없다. MCP는 버전 갱신 외에 기본 OFF인 `maxToolInputElements`, 향후 bearer 인증의 `expectedResource`를 확인해야 한다. OAuth 5.3.1은 PKCE 공지 수정 버전이며 설치 소스의 verifier 검사·검증 전 code 소비를 확인했다. 이 결과를 기존 서비스 audit 통과 수치에 포함하지 않는다. [MCP 공지](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-46jr-4wx8-v453), [OAuth 공지](https://github.com/node-oauth/node-oauth2-server/security/advisories/GHSA-jhm7-29pj-4xvf).

## 검증과 완료 조건

| 검사 | 결과·근거 |
| --- | --- |
| 고정 Node/pnpm으로 clean frozen install | Node 22.23.4 / pnpm 10.34.9, 별도 `/tmp`에서 `pnpm install --frozen-lockfile --offline --store-dir /tmp/support-b-pnpm-store` 통과. `--ignore-scripts` 없이 831패키지·다운로드 0. esbuild·sharp·Sentry CLI·unrs·Next ESLint smoke 통과. esbuild 정책 제거 시 `ERR_PNPM_IGNORED_BUILDS`로 실패. |
| 전체 및 production audit 재실행 | 모두 0건·종료 코드 0. 2026-11-08 UTC, 위 명령 및 기계 판독 근거 참조. |
| Next 16.4.5와 기존 HMR 패치 대조 | upstream 미포함 확인, 기존 수정만 16.4.5로 이식 |
| typegen·타입 검사·linter | `pnpm exec next typegen`, `pnpm exec tsc --noEmit`, `pnpm lint` 모두 통과. |
| 메일 render·Resend·outbox 회귀 | `render.test.ts`, `resend.test.ts`, `admin-email.test.ts`, `dispatch.test.ts` 통과. 아래 관련 검사 합계에 포함 |
| HTTP 수집·입력 검증·Node 규칙 | `lib/server/quote-assist`, `lib/validation`, `lib/__tests__/node-version-source.test.ts` 통과. 아래 관련 검사 합계에 포함 |
| production build 및 전체 단위·컴포넌트 검사 | `pnpm build` 통과. `pnpm test`: 933개 파일·8,824개 테스트 통과, 기존 3개 파일·10개 테스트 skip, 실패 0. 후속 배포 69개·CI 23개·Compose 관련 14개 검사를 별도로 통과. 각 합계에는 기존 테스트의 중복 실행이 포함됨. 로컬 E2E·원격 CI는 미실행 |
| 배포 후 실제 버전 확인 | 미배포. 운영 VM·컨테이너·PM2 실제 버전은 미확인. 로컬 통과로 대체하지 않음. |

위 경로를 지정한 `pnpm test`는 13개 파일·141개 테스트가 통과했다. `pnpm build`도 통과했다. 격리 환경에서 전체 검사·빌드가 정체되어 중단한 뒤 필요한 로컬 프로세스 권한으로 재실행했다. 전체 unit은 2026-11-08 13:08 UTC에 시작해 532.82초 후 성공했다.

CI YAML·셸 문법, 공식 Action SHA·Node OCI digest를 검증했다. k6 공식 바이너리 체크섬이 일치하며, 변조·다운로드 실패 시 압축해제 전 중단하는 동작도 확인했다. 감사는 CI의 재사용 job으로 연결했으며 실패하면 스테이징 배포도 중단한다. Dependabot은 npm·Actions·Compose의 주간 버전 PR을 설정했다. GitHub 원격 workflow 실행·필수 검사 설정·Dependabot 알림 활성화는 수행하지 않았다.

audit 0건만으로 완료하지 않는다. audit에서 놓친 Next·Undici 공식 공지의 수정 버전, 불필요한 전이 패키지 제거, clean install 재현성, 관련 회귀를 함께 확인한다. Node 11월 11일 공지는 발표 뒤 다시 확인할 후속 항목이며 이번 검사로 해결되었다고 표시하지 않는다.

## npm 밖의 도구·배포 산출물

| 대상 | 반영·검증 | 운영 확인 및 후속 작업 |
| --- | --- | --- |
| Postgres | `16.15-alpine`을 공식 registry의 multiarch digest에 고정. 응답 헤더와 본문 SHA-256 일치·linux/amd64 포함 확인. 로컬·운영 Compose 및 CI가 같은 이미지를 사용 | 16 계열 지원은 2028-11-09까지. 11/12 정기 minor 발표 후 다시 확인. 실제 DB 버전·백업·컨테이너 재생성 결과는 배포 때 확인. [지원 정책](https://www.postgresql.org/support/versioning/), [보안 공지](https://www.postgresql.org/support/security/16/), [예정 일정](https://www.postgresql.org/developer/roadmap/) |
| Centrifugo | `v6.10.2`를 공식 registry digest에 고정. 공개 WebSocket은 localhost 바인딩만으로 pre-auth 취약점이 차단되지 않으므로 수정된 이미지 선택 | 6.9.2 프레임 DoS, 6.9.7 deadlock, 6.10.2 이미지 CA 수정 포함. 실제 재시작 및 채팅·구독 ACL 검증은 미실행. [6.9.2](https://github.com/centrifugal/centrifugo/releases/tag/v6.9.2), [6.10.2](https://github.com/centrifugal/centrifugo/releases/tag/v6.10.2) |
| Caddy | 신규 설치를 `2.11.8`로 고정, 공식 SHA-512 검증. 실제 다운로드한 바이너리로 운영·스테이징 Caddyfile `validate` 통과 | 기존 설치는 자동 변경하지 않음. WebSocket 101 헤더 관련 수정은 2.11.5 이상이며 2.11.8까지 반영. [공지](https://github.com/caddyserver/caddy/security/advisories/GHSA-8qx7-j2v2-x6q5) |
| Docker Compose | 신규 설치를 같은 2계열의 `2.40.3`으로 고정, 공식 SHA-256 검증. 실제 바이너리로 더미 환경의 운영 Compose `config --quiet` 통과 | 2.29.7에 OCI 경로 탈출이 확정된 것으로 표시하지 않음. 현재 로컬 `-f` 파일만 사용. upstream 최신 5계열 이전은 별도 호환성 검토가 남음. [지원 정책](https://github.com/docker/compose/security/policy) |
| PM2 | 신규 전역 설치를 `7.1.2`로 고정. 7.x 지원·보안 수정 확인 | 기존 daemon·앱 interpreter·전이 패키지는 실제 서버 확인 필요. 무중단 reload만으로 daemon의 Node 교체를 보장하지 않음. [지원 정책](https://github.com/Unitech/pm2/blob/master/SECURITY.md), [보안 수정](https://github.com/Unitech/pm2/releases/tag/v7.0.0) |
| k6 | `1.8.2`와 공식 SHA-256을 고정. 실제 버전·기존 smoke/load 스크립트 해석 및 localhost HTTP·JSON·쿠키 검사 5/5 통과 | 원격 성능 테스트·운영 부하 테스트는 미실행. [1.8.2 보안 릴리스](https://github.com/grafana/k6/releases/tag/v1.8.2) |

`docker compose up`이나 Caddy 서버 시작, 운영 접속은 하지 않았다. Compose `config`와 Caddy `validate`는 임시 경로·더미 비밀값으로 검증했다. 이미지 고정은 기본 배포 시 새 digest를 사용하도록 만드는 변경이다. 배포 전 DB 백업과 재시작 영향을 확인하며 기존 볼륨·포트·권한 설정은 변경하지 않았다. 이미지 OS 패키지 전체 CVE 스캔을 수행했다는 뜻은 아니다.

재검토 순서: **11/11경 Node 공개 보안 릴리스 확인 → 11/12 Postgres 정기 릴리스 확인 → 운영 Node/PM2/Caddy 및 컨테이너 실행 버전 확인**. ESLint 10 전환은 현재 `eslint-plugin-react 7.37.5`의 peer 범위가 ESLint 9까지이므로 플러그인 호환성과 함께 별도로 검증한다. Compose 최신 지원 major 전환도 추적한다. Compose 이미지 버전 PR이 생기면 CI의 Postgres 이미지도 함께 갱신한다.

## 조사 한계

- OSV 외부 API 일괄 조회는 **패키지 목록 외부 전송에 대한 승인 거부로 실행하지 않았다**. 해당 차단을 우회하지 않았으며 OSV 교차 검증 완료로 표시하지 않는다. 독립 확인은 공개 공식 공지와 로컬 소스로 수행했다.
- 전체 전이 의존성 audit와 주요 런타임의 수동 검토 범위다. 모든 코드의 침투 테스트, 악성 패키지 전수 분석, 비밀값·운영 침해 여부 검사는 수행하지 않았다.
- 로컬 lockfile과 설치 소스는 운영 VM의 실제 실행 상태를 증명하지 않는다. OS 패키지, OpenSSL, Caddy, 컨테이너/VM 이미지, 배포 산출물, 저장소·방화벽·권한 설정은 별도 운영 검토 대상이다.
- 공개 공지의 버전 범위·심각도는 이후 정정될 수 있다. 위 날짜의 판단이며, 배포 시점에 다시 확인한다.
