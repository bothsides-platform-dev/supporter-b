import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_TOGGLE_KEY,
} from '../sidebar-cookie';

// 값이 아니라 **배선**을 지킨다.
//
// `components/ui/sidebar.tsx` 는 vendored shadcn 프리미티브다. `shadcn add sidebar`
// 를 다시 돌리면 상류 원본이 덮어써지면서 로컬 상수(`const SIDEBAR_COOKIE_NAME =
// "sidebar_state"` 등)가 되살아나고 이 모듈 import 가 사라진다. 그래도 값이 같으니
// 기존 테스트는 전부 그린이다 — 쓰는 쪽과 읽는 쪽이 갈라지는 순간(누가 한쪽만 바꾸는
// 순간)에야 조용히 깨진다. 그게 애초에 이 모듈을 만든 이유다.
//
// 그래서 소스를 텍스트로 읽어 (1) SSOT 를 import 하는지 (2) 리터럴이 되돌아오지
// 않았는지 확인한다. `app/__tests__/chrome-colors.test.ts` 가 캔버스 색에 쓰는 것과
// 같은 수법.

const repoRoot = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');

const SIDEBAR_PRIMITIVE = 'components/ui/sidebar.tsx';
const SHELL_TRIGGER = 'components/shell/ShellSidebarTrigger.tsx';
const DEMO_BLOCKER = 'components/landing/demo-app/use-block-sidebar-shortcut.ts';

describe('사이드바 쿠키 SSOT 배선', () => {
  it('vendored 프리미티브가 SSOT 에서 쿠키 상수를 가져온다', () => {
    const source = read(SIDEBAR_PRIMITIVE);

    expect(source).toMatch(/from ["']@\/lib\/shell\/sidebar-cookie["']/);
    expect(source).toContain('SIDEBAR_COOKIE_NAME');
    expect(source).toContain('SIDEBAR_COOKIE_MAX_AGE');
  });

  it('vendored 프리미티브에 쿠키 리터럴이 되살아나지 않았다', () => {
    const source = read(SIDEBAR_PRIMITIVE);

    // 상류 원본이 되돌아오면 이 두 리터럴이 같이 돌아온다.
    expect(source).not.toMatch(new RegExp(`["']${SIDEBAR_COOKIE_NAME}["']`));
    expect(source).not.toMatch(/60 \* 60 \* 24 \* \d+/);
  });

  it('쿠키 값에 Domain 을 붙이지 않는다 — 호스트별로 따로 기억하는 것이 의도다', () => {
    const source = read(SIDEBAR_PRIMITIVE);

    // 구매사/파트너 호스트가 각자 기억한다. Domain 이 붙으면 한쪽에서 쓴 값을
    // 다른 쪽이 읽게 되는데, 그건 결정이지 사고여선 안 된다.
    expect(source).not.toMatch(/[Dd]omain=/);
  });
});

describe('사이드바 단축키 SSOT 배선', () => {
  it('토글 핸들러·헤더 툴팁·랜딩 차단막이 모두 SSOT 를 가져온다', () => {
    for (const rel of [SIDEBAR_PRIMITIVE, SHELL_TRIGGER, DEMO_BLOCKER]) {
      const source = read(rel);
      expect(source, `${rel} 이 SSOT 를 import 해야 한다`).toMatch(
        /from ["']@\/lib\/shell\/sidebar-cookie["']/,
      );
      expect(source, `${rel} 이 SIDEBAR_TOGGLE_KEY 를 써야 한다`).toContain(
        'SIDEBAR_TOGGLE_KEY',
      );
    }
  });

  it('세 곳 어디에도 단축키 리터럴이 남아 있지 않다', () => {
    for (const rel of [SIDEBAR_PRIMITIVE, SHELL_TRIGGER, DEMO_BLOCKER]) {
      const source = read(rel);
      // `= 'b'` / `= "b"` / `=== 'b'` 형태의 하드코딩. 대문자 표기는 호출부가
      // `.toUpperCase()` 로 만들므로 리터럴 'B' 도 남아선 안 된다.
      expect(source, `${rel} 에 단축키 리터럴이 남아 있다`).not.toMatch(
        /=+\s*["'][bB]["']/,
      );
    }
  });
});

describe('SSOT 값 자체', () => {
  it('쿠키 이름과 단축키가 사용자에게 보이는 계약대로다', () => {
    expect(SIDEBAR_COOKIE_NAME).toBe('sidebar_state');
    expect(SIDEBAR_TOGGLE_KEY).toBe('b');
  });

  // 갱신이 토글할 때만 일어나므로, 짧으면 "한 번 접어두고 잘 쓰는" 사용자의
  // 설정이 조용히 풀린다. 1년 미만으로 줄이려면 그 실패 모드를 다시 검토할 것.
  it('만료가 1년 이상이라 설정이 조용히 풀리지 않는다', () => {
    expect(SIDEBAR_COOKIE_MAX_AGE).toBeGreaterThanOrEqual(60 * 60 * 24 * 365);
  });
});
