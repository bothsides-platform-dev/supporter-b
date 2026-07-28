import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { decideRoute } from '../route-decision';

// route-decision 의 PUBLIC_PREFIXES/ALWAYS_PASSTHROUGH_PREFIXES 는 손으로 관리하는
// 목록이고, 실제 공개 페이지는 app/(public) 폴더다. 둘은 자동으로 연결되지 않는다 —
// 새 공개 페이지를 폴더로만 추가하면 방문자가 조용히 /home 이나 /login 으로 튕긴다.
// 목록 상수를 export 해 비교하는 대신, 폴더를 순회해 실제 판정 동작으로 고정한다.
//
// 범위 한정(과대평가 금지): 이 가드는 `app/(public)` **안**만 걷는다. 그 폴더는 정의상
// PUBLIC_PREFIXES 로 덮이므로, 잡을 수 있는 건 인증 축 누락(ALWAYS_PASSTHROUGH 등록을
// 빠뜨린 매직링크류)이다. `(public)` **밖**에 생긴 공개 표면(루트 라우트 핸들러 등)이나
// `lib/auth/proxy-matcher.ts` 의 EXCLUDED_SEGMENTS 누락은 여기서 잡히지 않는다 —
// 그건 별개 클래스이고 proxy-matcher 쪽 가드 소관이다. 또 prefix 매칭이라 과대 등록
// (`/auth/x` 하위 전체 통과)도 이 스펙에는 통과로 보인다.

const PUBLIC_DIR = resolve(__dirname, '../../../app/(public)');

/** app/(public)/a/b/page.tsx → '/a/b'. 라우트 그룹 `(x)` 는 URL 에 안 나오므로 제거. */
function collectRoutes(dir: string, segments: string[] = []): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')');
      routes.push(
        ...collectRoutes(
          resolve(dir, entry.name),
          isGroup ? segments : [...segments, entry.name],
        ),
      );
    } else if (entry.name === 'page.tsx') {
      routes.push('/' + segments.join('/'));
    }
  }
  return routes;
}

/** 동적 세그먼트는 임의의 실제 값으로 채운다 — 판정은 prefix 기반이라 값은 무관. */
const fillDynamic = (route: string) => route.replace(/\[([^\]]+)\]/g, 'sample-value');

const PUBLIC_ROUTES = collectRoutes(PUBLIC_DIR).map(fillDynamic).sort();

/**
 * 로그인 상태에서 /home 으로 되돌리는 것이 **의도된** 경로들. 이미 인증된 사용자에게
 * 로그인·가입·비밀번호 재설정 화면은 의미가 없다. 여기 없는 공개 경로는 인증 여부와
 * 무관하게 통과해야 한다 — 목록에 추가하는 것은 의식적인 결정이어야 한다.
 *
 * `/invite` 는 현행 동작을 그대로 박아둔 것이다(초대 수락은 `/invite/rfp` 만 인증
 * 상태로 통과하고, 나머지는 /home 으로 보낸 뒤 별도 흐름이 처리한다).
 */
const AUTHED_BOUNCE_INTENDED = ['/login', '/signup', '/password', '/invite'];
const CLAIMABLE_WHILE_AUTHED = ['/invite/rfp'];

const bounceIntended = (route: string) =>
  !CLAIMABLE_WHILE_AUTHED.some((p) => route.startsWith(p)) &&
  AUTHED_BOUNCE_INTENDED.some((p) => route.startsWith(p));

describe('app/(public) 라우트 ↔ route-decision 공개 목록 등록 가드', () => {
  it('공개 페이지를 하나 이상 찾는다 (경로 파싱이 조용히 깨지면 이 스펙이 공허해진다)', () => {
    expect(PUBLIC_ROUTES.length).toBeGreaterThan(5);
  });

  // `not.toBe('redirect')` 가 아니라 `toBe('next')` 로 본다 — 잘못 등록된 rewrite 도 잡는다.
  it.each(PUBLIC_ROUTES)('%s — 비로그인 방문자가 그대로 통과한다', (route) => {
    expect(decideRoute(route, '', false).kind).toBe('next');
  });

  // ALWAYS_PASSTHROUGH_PREFIXES 는 사실상 이 축을 위해 존재한다. 비인증 축만 보면
  // 여기 등록을 빠뜨려도 초록으로 남는다 — 이메일 매직링크류가 정확히 그 사각이다.
  it.each(PUBLIC_ROUTES)('%s — 로그인 상태에서 의도한 판정을 받는다', (route) => {
    const decision = decideRoute(route, '', true);
    if (bounceIntended(route)) {
      expect(decision).toEqual({ kind: 'redirect', to: '/home' });
    } else {
      expect(decision.kind).toBe('next');
    }
  });
});
