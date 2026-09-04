// UX_WRITING.md §8 의 "안 읽음 하나" 주장을 강제력 있게 만드는 드리프트 가드.
//
// 왜 필요한가: 이 레포는 사용자 대면 어휘를 단일 출처 + 가드 테스트로 고정한다
// (CLAUDE.md 도메인 어휘 절 — TEST_PG_NAME_TOKENS·HERO_METRICS 와 같은 패턴).
// 그게 없던 동안 같은 뜻에 `미읽음`·`읽지 않음`·`안 읽음` 셋이 공존했고, 문구를
// 통일한 뒤에도 여섯 번째 표면이 옛 단어로 새어 들어가는 것을 막을 장치가 없었다.
//
// 범위: 사용자에게 도달하는 소스만 본다. 주석·테스트명·문서는 개념어로 옛 단어를
// 써도 되며(UX_WRITING.md §8 이 명시적으로 허용), 이 가드도 주석을 벗겨내고 본다.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { UNREAD_LABEL } from '../notification';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BANNED = /미읽음|읽지\s*않음|안읽음/;

/** 줄 주석·블록 주석을 제거해 "코드에 남은 리터럴"만 남긴다. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sourceFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', 'components', 'app', 'lib'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  return out
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => !f.includes('__tests__'));
}

describe('안 읽음 문구 드리프트 가드', () => {
  it('UNREAD_LABEL 이 UX_WRITING.md §8 이 정한 말과 같다', () => {
    expect(UNREAD_LABEL).toBe('안 읽음');
  });

  it('사용자 대면 소스에 옛 표현(미읽음·읽지 않음)이 남아 있지 않다', () => {
    const offenders = sourceFiles().filter((f) =>
      BANNED.test(stripComments(readFileSync(path.join(REPO_ROOT, f), 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  // 가드가 진짜로 도는지 스스로 확인한다 — 파일 목록이 비면 위 테스트는
  // 아무것도 검사하지 않으면서 초록이 된다(공허한 테스트).
  it('실제로 소스 파일을 훑는다', () => {
    expect(sourceFiles().length).toBeGreaterThan(100);
  });
});
