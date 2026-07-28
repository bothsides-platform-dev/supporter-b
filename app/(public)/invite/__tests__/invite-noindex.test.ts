import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { metadata } from '../layout';

// 초대 URL 에는 토큰이 박혀 있다. 색인되면 검색 결과에서 유효한 초대 링크가
// 노출되므로 `/invite` 서브트리는 전부 noindex 여야 한다.
//
// 그 noindex 의 **유일한 출처가 `app/(public)/invite/layout.tsx` 하나**다 —
// 하위 `rfp/[token]`·`workspace/[token]` 페이지는 자기 metadata 를 선언하지
// 않고 이 레이아웃에 얹혀 간다. v0.4.24.0 에서 고아 목업 `page.tsx` 를 지운 뒤
// 이 디렉터리에는 layout.tsx 만 남아, "레이아웃만 있는 빈 세그먼트네" 하고
// 뒤따라 지우기 쉬운 모양이 됐다. 그러면 토큰 URL 이 조용히 색인 대상이 된다.
// 파일 안 주석은 읽는 사람에게만 걸리므로, 실제 계약은 여기서 못박는다.

const INVITE_DIR = resolve(__dirname, '..');

/** page.tsx 를 가진 세그먼트 경로를 invite 루트 기준 상대경로로 모은다. */
function collectPageDirs(dir: string, segments: string[] = []): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      found.push(...collectPageDirs(resolve(dir, entry.name), [...segments, entry.name]));
    } else if (entry.name === 'page.tsx') {
      found.push(segments.join('/'));
    }
  }
  return found;
}

/** invite 루트 자신을 제외한 하위 layout.tsx 들. */
function collectNestedLayouts(dir: string, segments: string[] = []): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      found.push(...collectNestedLayouts(resolve(dir, entry.name), [...segments, entry.name]));
    } else if (entry.name === 'layout.tsx' && segments.length > 0) {
      found.push(segments.join('/'));
    }
  }
  return found;
}

const PAGE_DIRS = collectPageDirs(INVITE_DIR).sort();

describe('초대 서브트리 noindex 계약', () => {
  it('invite 레이아웃이 noindex 를 선언한다 (토큰 URL 색인 차단의 유일한 출처)', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  // 위 단언이 공허해지지 않도록 — 보호할 페이지가 실제로 존재해야 의미가 있다.
  it('레이아웃이 덮는 페이지가 실재한다', () => {
    expect(PAGE_DIRS).toEqual(['rfp/[token]', 'workspace/[token]']);
  });

  // 하위에 layout.tsx 가 생기면 Next 는 그쪽 metadata 로 덮어쓴다. 그 순간
  // 위 두 단언은 통과하는데 실제 페이지는 색인될 수 있다 — 그래서 중첩
  // 레이아웃 자체를 금지해 이 테스트가 거짓 안심을 주지 못하게 한다.
  it('noindex 를 덮어쓸 수 있는 중첩 레이아웃이 없다', () => {
    expect(collectNestedLayouts(INVITE_DIR)).toEqual([]);
  });

  // 중첩 레이아웃과 완전히 같은 구멍이 페이지 쪽에도 있다. Next 는 metadata 를
  // 체인 따라 얕게 병합하므로, 하위 page 가 `robots` 를 직접 선언하면(정적
  // metadata 든 generateMetadata 든) 부모 레이아웃 값을 덮어쓴다 — 그러면 위
  // 세 단언은 전부 통과하면서 실제 페이지는 색인될 수 있다. 한쪽 문만 잠그면
  // 오히려 거짓 안심을 주므로 같이 잠근다. 제목만 선언하는 것은 무해하니
  // (robots 미지정 시 부모 값 유지) `robots` 만 좁게 본다.
  it.each(PAGE_DIRS)('%s 페이지가 robots 를 스스로 선언하지 않는다', (dir) => {
    const src = readFileSync(resolve(INVITE_DIR, dir, 'page.tsx'), 'utf8');
    expect(src).not.toMatch(/robots/);
  });
});
