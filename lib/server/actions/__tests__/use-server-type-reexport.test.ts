import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * `'use server'` 파일에 **바인딩 없는 `export type { A, B };`** 를 두면 안 된다.
 *
 * 왜 주석이 아니라 테스트인가 — 이 실수는 **빌드가 통과한다.** Turbopack 의 flight
 * loader 는 `'use server'` 모듈의 export 이름을 훑어 전부 서버 액션으로 등록하는데,
 * `from` 절 없는 `export type { … };` 는 지역 바인딩 이름을 가리키므로 그 목록에
 * 섞여 들어간다. 타입은 컴파일에서 지워지므로 산출물에는 **선언이 없는 자유 식별자**만
 * 남는다:
 *
 *   ensureServerEntryExports([getDeleteAccountStatus, BlockingWorkspace, WorkspaceStub])
 *   registerServerReference(BlockingWorkspace, "7fee…", null)
 *
 * ESM 은 항상 strict 이라 이 줄을 **평가하는 순간** `ReferenceError: BlockingWorkspace
 * is not defined` 가 난다. 크래시 지점이 모듈 평가라서 그 파일 하나가 아니라 **그
 * 페이지의 서버 액션 모듈 전체**가 죽는다 — 한 파일의 타입 재export 가 `/settings/
 * profile` 의 액션 전부(휴대폰 인증·탈퇴·워크스페이스 이름 변경)를 함께 끌고 내려갔다.
 *
 * 그리고 **`next build` 는 초록이다.** 실패는 요청 시각에만 드러나므로 CI 도 타입체크도
 * 못 잡는다. 그래서 드리프트 가드가 유일한 그물이다.
 *
 * 고치는 법: 타입은 원본 모듈에서 직접 import 한다(`'use server'` 파일을 타입 배럴로
 * 쓰지 않는다). 타입 **선언**(`export type X = …`)은 export 이름 목록에 들어가지
 * 않으므로 안전하다 — 막는 것은 `from` 절 없는 재export 형태 하나다.
 */
describe("'use server' 파일의 타입 재export", () => {
  const repoRoot = path.resolve(__dirname, '../../../..');

  /** git 이 추적하는 파일만 본다 — .next 산출물·node_modules 를 훑지 않기 위해. */
  function trackedSourceFiles(): string[] {
    const out = execFileSync('git', ['ls-files', '-z', 'lib', 'app'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return out
      .split('\0')
      .filter((p) => p.endsWith('.ts') || p.endsWith('.tsx'))
      .filter((p) => existsSync(path.join(repoRoot, p)));
  }

  /**
   * `from` 절이 없는 `export type { … };` 만 잡는다.
   * `export type { X } from './y'` 는 재export 대상이 다른 모듈이라 지역 바인딩을
   * 만들지 않고, 배럴 파일에서 정상적으로 지워진다.
   */
  const BARE_TYPE_REEXPORT = /^\s*export\s+type\s*\{[^}]*\}\s*;?\s*$/gm;

  it('바인딩 없는 export type 재export 가 없다', () => {
    const offenders: string[] = [];

    for (const rel of trackedSourceFiles()) {
      const src = readFileSync(path.join(repoRoot, rel), 'utf8');
      // 파일 맨 앞 지시어만 인정한다(문자열 안에 우연히 든 것 제외).
      if (!/^\s*(['"])use server\1\s*;/.test(src)) continue;

      for (const m of src.matchAll(BARE_TYPE_REEXPORT)) {
        // `export type { X } from '…'` 는 위 정규식이 `}` 뒤 `from` 때문에 이미
        // 걸러지지만, 방어적으로 한 번 더 확인한다.
        if (/\bfrom\b/.test(m[0])) continue;
        offenders.push(`${rel}: ${m[0].trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
