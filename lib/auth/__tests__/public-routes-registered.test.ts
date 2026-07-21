import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { decideRoute } from '../route-decision';

// route-decision 의 PUBLIC_PREFIXES/ALWAYS_PASSTHROUGH_PREFIXES 는 손으로 관리하는
// 목록이고, 실제 공개 페이지는 app/(public) 폴더다. 둘은 자동으로 연결되지 않는다 —
// 새 공개 페이지를 폴더로만 추가하면 비로그인 방문자가 조용히 /login 으로 튕긴다.
// (같은 클래스로 이미 두 번 사고: /llms.txt 프록시 매처, PG 랜딩 이미지 경로.)
// 목록 상수를 export 해 비교하는 대신, 폴더를 순회해 실제 판정 동작으로 고정한다.

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

describe('app/(public) 라우트 ↔ route-decision 공개 목록 등록 가드', () => {
  it('공개 페이지를 하나 이상 찾는다 (경로 파싱이 조용히 깨지면 이 스펙이 공허해진다)', () => {
    expect(PUBLIC_ROUTES.length).toBeGreaterThan(5);
  });

  it.each(PUBLIC_ROUTES)('%s — 비로그인 방문자가 /login 으로 튕기지 않는다', (route) => {
    const decision = decideRoute(route, '', false);
    expect(decision.kind).not.toBe('redirect');
  });
});
