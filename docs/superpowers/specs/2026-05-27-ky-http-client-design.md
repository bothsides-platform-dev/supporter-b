# ky HTTP 클라이언트 도입 설계

**날짜**: 2026-05-27  
**상태**: 승인됨

## 배경

현재 클라이언트 컴포넌트에서 `fetch()`를 직접 호출하는 곳이 6군데 있다. 호출마다 `if (!r.ok)` 에러 체크, `credentials: 'same-origin'` 반복 설정, timeout/retry 부재 등 보일러플레이트가 중복된다. `ky`를 도입해 공유 인스턴스 하나로 통일한다.

`@toss/ky`는 검토 결과 부적합: browser 빌드가 ky 0.31.x 단순 재수출이며, server polyfill은 Node.js 18+에서 불필요하다. `ky@2` 직접 설치.

## 범위

- **포함**: 클라이언트 컴포넌트(`'use client'`)의 `fetch()` 직접 호출 6곳
- **제외**: `EventSource`(SSE) — native 유지, `scripts/e2e-precheck.ts` — app 코드 아님

## 설계

### `lib/http.ts` — 공유 인스턴스

```ts
import ky, { type KyInstance } from 'ky'

export const http: KyInstance = ky.create({
  credentials: 'same-origin',
  timeout: 10_000,
  retry: { limit: 1, statusCodes: [408, 500, 502, 503] },
  hooks: {
    afterResponse: [
      async (_req, _opts, res) => {
        if (res.status === 401) window.location.assign('/login')
      },
    ],
  },
})
```

- `credentials: 'same-origin'` — 기존 호출부의 불일치를 통일
- `timeout: 10_000` — 현재 timeout 미설정 문제 해소
- `retry` — 일시적 서버 오류(500, 502, 503)와 timeout(408)에 1회 재시도
- `afterResponse` 401 hook — 세션 만료 시 전체 앱에서 `/login`으로 이동

### `prefixUrl` 미사용 이유

`/logout` route가 `/api/` prefix 밖에 있어 두 인스턴스가 필요해진다. 6개 호출부 모두 기존 경로 그대로 유지하는 것이 마이그레이션 안전성이 더 높다.

### 마이그레이션 대상 (6개 파일)

| 파일 | 변경 전 | 변경 후 |
|------|---------|---------|
| `components/inbox/BidForm.tsx` | `fetch('/api/files/upload', { method: 'POST', body: formData, credentials: 'same-origin' })` | `http.post('/api/files/upload', { body: formData })` |
| `components/rfp/RfpAttachmentDropzone.tsx` | 동일 패턴 | 동일 |
| `components/rfp/BidDetailModal.tsx` | 동일 패턴 | 동일 |
| `hooks/useLazyPgWorkspaces.ts` | `fetch('/api/workspaces/search?type=pg')` | `http.get('/api/workspaces/search', { searchParams: { type: 'pg' } }).json()` |
| `lib/hooks/useNotifications.ts` | `fetch('/api/notifications', { credentials: 'same-origin' })` | `http.get('/api/notifications').json()` |
| `components/shell/UserMenu.tsx` | `fetch('/logout', { method: 'POST' })` | `http.post('/logout')` |

에러 처리: ky가 4xx/5xx에서 `HTTPError`를 자동 throw하므로 기존 `if (!r.ok) throw ...` 보일러플레이트 제거. 각 호출부의 `catch` 블록은 `HTTPError` 타입으로 교체.

### Vitest 설정 수정

ky는 ESM-only 패키지. `vitest.config.ts`의 `unit-node`, `unit-jsdom` 두 project에 모두 추가:

```ts
transformIgnorePatterns: ['/node_modules/(?!ky)']
```

미추가 시 `SyntaxError: Cannot use import statement in a module` 발생.

## 테스트 전략

### `lib/http.ts` 단위 테스트

`ky` 모듈을 mock해서 인스턴스 설정 검증:
- `credentials: 'same-origin'` 기본 적용 확인
- 401 응답 시 `window.location.assign('/login')` 호출 확인
- 500 응답 시 retry 1회 확인

### 마이그레이션 컴포넌트 테스트

기존 테스트가 있는 컴포넌트는 `vi.mock('lib/http')`로 교체. 없는 컴포넌트는 TDD 사이클로 추가.

## 검증

```bash
pnpm add ky
pnpm test                    # Vitest 전체 통과 확인
pnpm tsc --noEmit            # 타입 에러 없음 확인
pnpm build                   # 번들 오류 없음 확인
```

런타임 확인: 파일 업로드, 알림 API, 워크스페이스 검색, 로그아웃 동작 확인.
