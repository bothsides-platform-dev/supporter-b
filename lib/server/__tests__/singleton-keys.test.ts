import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// lib/server/_singleton.ts 는 같은 key + 같은 group 의 재등록을 HMR 재평가로 보고
// 기존 슬롯을 그대로 돌려준다. 그래서 다른 모듈이 실수로 같은 key 를 쓰면 throw 없이
// 남의 인스턴스를 `as T` 로 받게 된다 — 메서드 모양이 겹치는 서비스끼리는 타입
// 에러 대신 조용한 오동작이다. 런타임 가드가 없는 만큼 키 유일성은 여기서 고정한다.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SCAN_ROOTS = ['lib', 'app'];
const DEFINE_RE = /\bdefine(?:Async)?Singleton(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/g;

function* walk(relDir: string): Generator<string> {
  for (const entry of readdirSync(`${ROOT}${relDir}`, { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      yield* walk(rel);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      yield rel;
    }
  }
}

describe('singleton registry keys', () => {
  it('every define(Async)Singleton key under lib/ and app/ is unique', () => {
    const owners = new Map<string, string[]>();
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        const src = readFileSync(`${ROOT}${file}`, 'utf8');
        for (const m of src.matchAll(DEFINE_RE)) {
          const list = owners.get(m[1]) ?? [];
          list.push(file);
          owners.set(m[1], list);
        }
      }
    }

    expect(owners.size, 'no singleton definitions found — regex or scan roots drifted').toBeGreaterThan(0);
    const dupes = [...owners.entries()].filter(([, files]) => files.length > 1);
    expect(
      dupes,
      `Duplicate singleton keys — the later module would silently receive the earlier ` +
        `module's instance:\n  ${dupes.map(([k, f]) => `${k}: ${f.join(', ')}`).join('\n  ')}`,
    ).toEqual([]);
  });
});
