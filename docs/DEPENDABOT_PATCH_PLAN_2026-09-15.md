# Dependabot 취약점 패치 계획 (2026-09-15)

## 결론

2026-09-15 21:44 KST에 기본 브랜치 `dev`를 GitHub REST API로 조회한 결과, 열린 Dependabot 경고는 **17건**, 고유 GitHub Security Advisory는 **14건**이다. 고유 건 기준 Critical 2건, High 6건, Medium 6건이며, 열린 Dependabot 보안 업데이트 PR은 없다.

가장 먼저 `next`와 그 전이 의존성 `sharp`를 올려야 한다. 현재 운영 런북은 glibc 2.34 기반 Amazon Linux 2023과 공식 Node.js Linux 바이너리를 사용하므로, AVIF 처리 시 RCE가 가능한 `libheif` 계열 경고를 단순 비해당으로 볼 수 없다. 저장소에는 AVIF 포맷 설정이나 AVIF/HEIF 정적 파일이 없지만, 이것만으로 Image Optimization API에 신뢰하지 않는 AVIF가 도달하지 못한다고 증명되지는 않는다.

## 패치 묶음

| 우선순위 | 현재 → 적용 버전 (최소 안전 버전) | 닫히는 경고 | 조치 |
|---|---|---|---|
| P0 | `next` 16.2.11 → 16.3.5 (16.3.3) | [#93](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/93), [#94](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/94), [#97](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/97), [#98](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/98) | `next`와 `eslint-config-next`를 16.3.5로 맞추고 `@next/third-parties`도 16.3.5로 정렬한다. |
| P0 | `sharp` 0.35.3 → 0.35.4 | [#102](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/102) | 기존 `pnpm.overrides.sharp` 하한을 `>=0.35.4 <0.36.0`으로 올린다. |
| P1 | `hono` 4.12.34 → 4.13.8 (4.13.5) | [#99](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/99), [#100](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/100), [#101](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/101) | 기존 `pnpm.overrides.hono` 하한을 `>=4.13.5`로 올린다. |
| P1 | `vitest`, `@vitest/mocker` 4.1.9 → 4.1.11 | [#95](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/95), [#96](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/96) | 직접 의존성을 4.1.11로 올리고 override를 `>=4.1.11 <5.0.0`으로 좁혀 같은 버전의 mocker가 풀리되 Vitest 5로 넘어가지 않게 한다. |
| P1 | `fast-uri` 3.1.5 → 3.1.8 (3.1.6) | [#87](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/87), [#88](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/88), [#91](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/91), [#92](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/92) | 상위 `ajv@8.20.0`의 `^3.0.1` 범위와 호환된다. 보안 하한을 보존하려면 override `>=3.1.6 <4.0.0`을 추가한다. |
| P1 | `qs` 6.15.3 → 6.16.0 | [#89](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/89), [#90](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/90) | Express/Body Parser의 현재 semver 범위와 호환된다. override `>=6.16.0 <7.0.0`을 추가한다. |
| P1 | `nanoid` 3.3.16 → 3.3.19 (3.3.18) | [#86](https://github.com/bothsides-platform-dev/supporter-b/security/dependabot/86) | `postcss@8.5.25`의 `^3.3.16` 범위와 호환된다. override `>=3.3.18 <4.0.0`을 추가한다. |

한 PR에서 위 버전과 `pnpm-lock.yaml`을 함께 갱신한다. 그 뒤 `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test`, `pnpm build`를 실행하고, GitHub가 기본 브랜치를 다시 스캔한 뒤 17개 경고가 모두 닫혔는지 확인한다. 특히 Next.js 변경은 저장소 지침상 빌드 확인을 생략하면 안 된다.

## 적용 결과 (2026-09-16)

- 위 표의 적용 버전으로 `package.json`과 `pnpm-lock.yaml`을 갱신했고 `pnpm audit`는 알려진 취약점 0건으로 통과했다.
- Next.js 16.3이 개발 서버에서 에이전트 지침 파일을 자동 수정하는 새 동작을 추가했으므로 `next.config.ts`에 `agentRules: false`를 설정했다. 이 저장소의 `AGENTS.md` 심링크와 `CLAUDE.md` 마지막 줄 센티널을 보존하는 회귀 테스트도 추가했다.
- frozen install, lint, typecheck, production build, e2e 34건이 통과했다(첨부 PDF 1건은 R2 환경이 없어 기존 조건대로 skip).
- 전체 unit 7,388건이 통과했다. 기존 Axiom 깊은 JSON 테스트가 Node 26의 변경된 직렬화 스택 동작으로 실패하여, 런타임 예외 대신 100단 중첩 상한을 명시하고 배열·객체·혼합 구조의 100/101단 경계를 회귀 테스트로 고정했다.

## 경고별 근거와 도달 조건

| 패키지·경로 | Advisory / 위험도 | 취약 범위 → 패치 | 영향과 이 저장소의 관찰 |
|---|---|---|---|
| `next` 16.2.11 (직접 runtime) | [GHSA-2xp9-vwfh-vxw4](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), Critical, CVSS v4 9.5, CVE/EPSS 없음 | `>=16.0.0 <16.3.3` → 16.3.3 | Image Optimization API가 AVIF를 최적화할 때 기반 `libheif` 결함으로 비인증 RCE가 가능하다. `package.json`과 lockfile이 각각 경고를 만들어 2건으로 보인다. |
| `next` 16.2.11 (직접 runtime) | [GHSA-p293-qw3h-jr36](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), CVE-2026-75604, Critical, CVSS v3 9.0, EPSS 2.462% | `>=16.0.0 <16.3.3` → 16.3.3 | Windows 파일시스템에서 Pages/App Router와 Cache Components 미사용 조합으로 비인증 RCE가 가능하다. 운영 호스트는 Amazon Linux라 해당 전제는 없지만, 같은 16.3.3 패치로 제거한다. 이 경고도 manifest별 2건이다. |
| `next → sharp` 0.35.3 | [GHSA-rgj7-g3m4-5g8c](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c), High, CVSS v4 8.9, wrapper CVE/EPSS 없음 | `<0.35.4` → 0.35.4 | 신뢰하지 않는 이미지를 처리하는 glibc Linux에서 `libheif` 결함으로 RCE가 가능하다. 운영은 glibc Linux이며 공식 Node 바이너리를 사용한다. 저장소에 `sharp` 직접 import는 없다. |
| `shadcn → @modelcontextprotocol/sdk → hono` 4.12.34 | [GHSA-gqvv-2mrq-wpjv](https://github.com/honojs/hono/security/advisories/GHSA-gqvv-2mrq-wpjv), CVE-2026-84365, Medium, CVSS 6.5, EPSS 0.327% | `<4.13.5` → 4.13.5 | 공격자가 제어하는 `ssgParams`가 `toSSG()`의 출력 경로를 벗어나 파일을 쓰게 할 수 있다. 빌드 시 SSG 전용이다. |
| 같은 Hono 경로 | [GHSA-g6gw-c38x-mqfc](https://github.com/honojs/hono/security/advisories/GHSA-g6gw-c38x-mqfc), CVE-2026-84364, Medium, CVSS 5.3, EPSS 0.388% | `<4.13.5` → 4.13.5 | dot notation을 명시적으로 켠 `parseBody()`에 작은 요청으로 큰 객체 그래프를 만들어 heap 고갈/DoS를 일으킬 수 있다. 기본 설정은 영향이 없다. |
| 같은 Hono 경로 | [GHSA-crvj-82cr-hjcx](https://github.com/honojs/hono/security/advisories/GHSA-crvj-82cr-hjcx), CVE-2026-84363, Medium, CVSS 5.9, EPSS 0.345% | `<4.13.5` → 4.13.5 | 리터럴 `#` 뒤의 query를 Hono와 앞단 proxy/cache가 다르게 해석해 필터 우회, cache poisoning, 조건부 stored XSS가 가능하다. 저장소 앱 코드에는 Hono API 직접 사용이 없고 이 경로는 shadcn CLI 계열이다. |
| `vitest → @vitest/mocker` 4.1.9 (development) | [GHSA-82fw-gwwq-j7x9](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9), CVE-2026-84373, Medium, CVSS 5.9, EPSS 0.375% | `>=2.1.0 <4.1.11` → 4.1.11 | 외부에 노출된 Vite 개발 서버의 공개 mocker WebSocket을 통해 프로젝트 안팎 파일을 읽을 수 있다. Vitest 자체 browser mode의 기본 경로는 토큰 인증이며, 이 저장소에서는 개발 의존성이다. 직접 `vitest`와 전이 `@vitest/mocker`가 각각 경고돼 2건이다. |
| `@sentry/nextjs → webpack tooling → schema-utils → ajv → fast-uri`, 그리고 `shadcn → @modelcontextprotocol/sdk → ajv → fast-uri` 3.1.5 | [GHSA-f65p-4m7j-42xc](https://github.com/fastify/fast-uri/security/advisories/GHSA-f65p-4m7j-42xc), CVE-2026-75975; [GHSA-jqff-g426-hqxp](https://github.com/fastify/fast-uri/security/advisories/GHSA-jqff-g426-hqxp), CVE-2026-76172; [GHSA-fph4-wmhf-6fwf](https://github.com/fastify/fast-uri/security/advisories/GHSA-fph4-wmhf-6fwf), CVE-2026-75899; [GHSA-5jgf-p345-68v8](https://github.com/fastify/fast-uri/security/advisories/GHSA-5jgf-p345-68v8), CVE-2026-75931. 모두 High, CVSS v3 7.5, EPSS 0.220–0.232% | 각 취약 범위는 3.x에서 `<3.1.6` → 3.1.6 | malformed IPv6, percent-encoded scheme/host, scheme-relative IDN 처리 차이로 SSRF·host allowlist 우회·헤더 삽입이 가능하다. 앱 코드에는 직접 import가 없으며 관찰된 경로는 빌드/CLI 도구 계열이다. 이는 낮은 도달 가능성의 단서일 뿐 패치 생략의 증명은 아니다. |
| `shadcn → @modelcontextprotocol/sdk → express/body-parser → qs` 6.15.3 | [GHSA-4mjr-xmp4-gh2g](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g), CVE-2026-82417, Medium, CVSS v3 5.3/v4 6.3, EPSS 0.261%; [GHSA-x5fp-wj9c-mxmx](https://github.com/ljharb/qs/security/advisories/GHSA-x5fp-wj9c-mxmx), CVE-2026-82562, Medium, CVSS v3 3.7/v4 6.3, EPSS 0.317% | `>=2.2.5 <6.16.0`, `>=6.14.2 <=6.15.3` → 6.16.0 | 특정 parse→stringify 옵션 조합의 예외/worker DoS와 `comma:true` 배열 제한 우회에 의한 메모리 DoS다. 앱 코드에는 직접 import가 없고 shadcn CLI의 MCP 서버 경로에서만 관찰됐다. |
| 여러 `postcss → nanoid` 경로(Next/shadcn/Vite/Vitest/Tailwind) 3.3.16 | [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), CVE-2026-67213, High, CVSS v3 5.9/v4 8.2, EPSS 0.319% | `<3.3.18` → 3.3.18 | 공격자가 제어하는 `size=0`을 `customAlphabet`/`customRandom`에 넘길 때 무한 루프가 난다. 저장소에는 해당 API 직접 사용이 없다. |

## 공식 패치 출처

- [Next.js 16.3.3 릴리스](https://github.com/vercel/next.js/releases/tag/v16.3.3)
- [sharp 0.35.4 릴리스](https://github.com/lovell/sharp/releases/tag/v0.35.4)
- [Hono 4.13.5 릴리스](https://github.com/honojs/hono/releases/tag/v4.13.5)
- [Vitest 4.1.11 릴리스](https://github.com/vitest-dev/vitest/releases/tag/v4.1.11)
- [fast-uri 3.1.6 릴리스](https://github.com/fastify/fast-uri/releases/tag/v3.1.6)
- [qs 6.16.0 태그](https://github.com/ljharb/qs/tree/v6.16.0) 및 [보안 수정 커밋](https://github.com/ljharb/qs/commit/e83d321ffafb38cf210683ac31714fce6ce1c6c6)
- [nanoid 3.3.18 릴리스](https://github.com/ai/nanoid/releases/tag/3.3.18)

## 조사 한계

이번 조사는 GitHub Dependabot API, 패키지별 GitHub Security Advisory/릴리스, `package.json`, `pnpm-lock.yaml`, 직접 API 사용 검색을 대조한 정적 조사다. 취약 payload를 실행하거나 운영 트래픽·배포 산출물을 동적으로 검사하지 않았다. 따라서 “직접 사용 없음”과 “현재 운영에서 악용 불가”는 같은 뜻이 아니다.
