# Supporter B

PG(결제대행사) 1:N 비공개 RFP 플랫폼.

이 가이드는 **Windows / macOS / Linux 어디서든** 처음 보는 분도 순서대로 따라 하면 로컬에서 실행할 수 있도록 정리한 것입니다. **Windows 사용자는 [Git Bash](https://git-scm.com/download/win) 를 켜고 따라 하세요** — Mac/Linux 와 똑같은 명령어로 진행할 수 있습니다. PowerShell 로만 가능한 부분은 별도 표기했습니다.

자세한 도메인·라우팅·디자인 스펙은 [`CLAUDE.md`](./CLAUDE.md) → [`SCREEN_DESIGN.md`](./SCREEN_DESIGN.md) → [`DESIGN.md`](./DESIGN.md) 순으로 읽으세요.

---

## 0. 사전 설치 (한 번만)

| 프로그램 | 설명 | Windows 설치 방법 |
|---|---|---|
| **Node.js 20 이상** | JavaScript 실행 환경 | [nodejs.org](https://nodejs.org/ko) → "LTS" 버전 다운로드 후 실행 (다음·다음·완료) |
| **Git** | 소스 코드 받기 + Git Bash 터미널 | [git-scm.com/download/win](https://git-scm.com/download/win) → 다운로드 후 실행 (옵션 그대로 다음·다음·완료) |
| **pnpm** | 패키지 매니저 | Node 설치 후 PowerShell 또는 Git Bash 에서 `npm install -g pnpm` 실행 |
| **Docker Desktop** | 데이터베이스(Postgres) 를 띄우는 데 사용 | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) 다운로드 → 설치 → **반드시 한 번 실행해서 시작 상태로 둡니다** (작업 표시줄에 🐳 고래 아이콘이 보이면 OK) |

설치가 끝나면 **Git Bash** (시작 메뉴에서 "Git Bash" 검색) 를 열고 아래 명령으로 확인합니다:

```bash
node -v        # v20 이상이면 OK
pnpm -v        # 9 이상이면 OK
git --version
docker --version
```

> 명령어가 "command not found" 로 나오면 Git Bash 를 닫았다가 다시 열어 보세요. 그래도 안 되면 해당 프로그램을 다시 설치합니다.

## 1. 소스 코드 받기

Git Bash 또는 PowerShell 에서:

```bash
git clone https://github.com/bothsides-platform-dev/bidit.git bidit
cd bidit
```

## 2. 의존성 설치

```bash
pnpm install
```

처음에는 1~3분 걸립니다. 완료되면 `node_modules/` 폴더가 생깁니다.

## 3. 환경 변수 파일 만들기

`.env.example` 을 복사해서 `.env.local` 이라는 파일을 만듭니다.

**Git Bash / macOS / Linux:**
```bash
cp .env.example .env.local
```

**Windows PowerShell:**
```powershell
Copy-Item .env.example .env.local
```

만들어진 `.env.local` 파일을 메모장이나 VS Code 로 열어 아래 표대로 채웁니다.

| 키 | 어떻게 채우나? |
|---|---|
| `DATABASE_URL` | 그대로 두기 |
| `DATABASE_URL_TEST` | 그대로 두기 |
| `AUTH_SECRET` | **반드시 입력** — 아래 "AUTH_SECRET 만들기" 참고 |
| `RESEND_API_KEY` | (선택) 비워둬도 됨. 이메일을 실제로 보내려면 [resend.com](https://resend.com) 가입 후 발급 |
| `NTS_SERVICE_KEY` | (선택) 비워둬도 됨. 사업자번호 자동 조회를 쓰려면 [data.go.kr](https://www.data.go.kr) 에서 "국세청 사업자등록 상태조회" API 신청 |
| `NEXT_PUBLIC_BASE_URL` | 그대로 두기 (`http://localhost:3000`) |
| `CRON_SECRET` | 아무 문자열이나 입력. 예: `changeme` |

> 외부 키(`RESEND_API_KEY`, `NTS_SERVICE_KEY`) 가 비어 있어도 앱은 정상적으로 떠서 화면 클릭은 가능합니다. 다만 실제 이메일 발송과 사업자번호 자동 조회는 동작하지 않습니다.

### AUTH_SECRET 만들기

긴 임의 문자열이면 무엇이든 됩니다. 아래 중 하나를 골라 만든 값을 `.env.local` 의 `AUTH_SECRET=` 뒤에 붙여 넣으세요.

**Git Bash / macOS / Linux:**
```bash
openssl rand -base64 32
```

**Windows PowerShell:**
```powershell
[Convert]::ToBase64String([byte[]](1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

**또는** [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32) 에서 나오는 값을 복사해 넣어도 됩니다.

## 4. 데이터베이스 띄우기

**Docker Desktop 이 실행 중인지** 먼저 확인하세요. (작업 표시줄에 🐳 고래 아이콘이 보여야 합니다. 안 보이면 시작 메뉴에서 "Docker Desktop" 을 실행하고 1~2분 기다리세요.)

```bash
docker compose up -d pg
```

- `docker compose up -d pg` 는 메인 Postgres(5432) 를 띄웁니다. 첨부파일 바이트도 이 Postgres(`attachment_blobs` 테이블) 에 저장되므로 별도 스토리지 스택은 필요 없습니다.

정상 기동 확인:

```bash
docker compose ps
```

`supporter-b-pg` 가 `running (healthy)` 으로 보이면 성공입니다.

## 5. DB 초기 데이터 채우기

> **스키마 적용은 별도 절차입니다.** `drizzle/` 아래의 단일 그린필드 스키마 SQL
> (`drizzle/0000_*.sql` — `pnpm db:generate` 로 재생성되며 파일명은 바뀔 수 있음) 을
> 대상 DB에 적용해 테이블을 먼저 만들어야 합니다(증분 `db:migrate` 미사용 — 그린필드
> 단일 스키마). 스키마가 준비된 뒤:

```bash
pnpm db:seed
```

`db:seed` 는 테스트용 사용자·워크스페이스·RFP 데이터를 넣습니다. 첨부파일 바이트는 `attachment_blobs` 테이블에 저장됩니다.

## 6. 개발 서버 실행

```bash
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 엽니다. 로그인 페이지로 이동하면 성공입니다. 테스트 계정 정보는 `scripts/seed.ts` 파일을 참고하세요.

서버를 끄려면 터미널에서 **Ctrl + C**.

---

## Windows 에서 자주 발생하는 문제

| 증상 | 해결 |
|---|---|
| `pnpm: command not found` | 터미널을 한 번 닫았다 다시 열기. 그래도 안 되면 `npm install -g pnpm` 다시 실행 |
| `docker: command not found` 또는 `Cannot connect to the Docker daemon` | Docker Desktop 이 꺼져 있음. 시작 메뉴에서 실행 후 🐳 아이콘이 안정될 때까지 대기 |
| `port 5432 is already allocated` | 컴퓨터에 이미 PostgreSQL 이 돌고 있음. 윈도우 "서비스" 에서 기존 PostgreSQL 을 중지하거나, `docker-compose.yml` 의 `5432:5432` 를 `5433:5432` 로 바꾸고 `.env.local` 의 `DATABASE_URL` 포트도 `5433` 으로 수정 |
| PowerShell 에서 "스크립트 실행이 차단됨" | 관리자 권한 PowerShell 에서 한 번만 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 실행 |
| `warning: LF will be replaced by CRLF` 같은 경고 | Windows Git 의 정상 동작입니다. 무시해도 됩니다 |
| 포트 3000 이 이미 사용 중 | 다른 Next.js 가 떠 있음. 끄거나 `pnpm dev -- -p 3001` 로 다른 포트 사용 |

---

## 개발자용 추가 명령

테스트:

```bash
pnpm test            # Vitest 단위/계약 테스트
pnpm test:watch      # 워치 모드
pnpm e2e             # Playwright E2E (사전: pnpm dlx playwright install --with-deps chromium)
pnpm lint            # ESLint
```

DB 가 필요한 통합 테스트는 별도 컨테이너를 씁니다:

```bash
docker compose --profile test up -d pg-test
```

DB 도구·기타:

| 명령 | 설명 |
|---|---|
| `pnpm db:studio` | 브라우저 GUI 로 DB 보기 (https://local.drizzle.studio) |
| `pnpm db:generate` | 스키마 변경 후 새 마이그레이션 SQL 생성 |
| `pnpm db:push` | 마이그레이션 없이 즉시 스키마 푸시 (dev 전용) |
| `docker compose down -v` | DB 볼륨까지 삭제하고 처음부터 다시 |

프로덕션 빌드:

```bash
pnpm build
pnpm start            # 기본 포트 3000
```

> **배포**: 라이브 배포는 **Vercel** (region `icn1` — `vercel.json`). 자세한 결정 기록은 [`docs/adr/0002-vercel-deployment.md`](./docs/adr/0002-vercel-deployment.md). (이전 OCI 자체호스팅 런북·스크립트는 제거됨 — 역사적 맥락은 [`docs/adr/0001-deployment-architecture.md`](./docs/adr/0001-deployment-architecture.md).)

이메일이 안 올 때: `RESEND_API_KEY` 미설정이거나 outbox flush 가 안 도는 경우입니다. `pnpm db:studio` 로 `outbox` 테이블을 확인하고, 필요하면 `/api/cron/flush-outbox` 라우트를 호출(헤더 `x-cron-secret: <CRON_SECRET>`)합니다.
