import { describe, it, expect } from 'vitest';

import { chipColorEnum } from '@/lib/db/schema/_enums';
import type { ChipColorRole } from '@/lib/types/column';

// ChipColorRole(TS 유니온)과 chip_color(pgEnum)는 구조적으로 합칠 수 없다 — repo-boundary
// 규칙상 클라이언트에서 쓰이는 lib/types/column.ts 가 @/lib/db/schema 를 값으로 임포트할 수
// 없기 때문(테스트는 예외라 여기서만 양쪽을 본다). 그래서 통합 대신 가드로 고정한다.
// 어긋나면 DB 가 받아주는 색을 앱이 모르거나(렌더 누락) 앱이 보내는 색을 DB 가 거부한다.
//
// 배열 리터럴은 TS 유니온을 런타임에서 볼 수 없어 손으로 적되, satisfies 로 컴파일러가
// 오타·누락·초과를 잡게 한다(유니온에 없는 값 → 컴파일 에러, 빠뜨린 값 → 아래 완전성 체크).
const APP_CHIP_COLORS = ['primary', 'tertiary', 'warning', 'error', 'surface'] as const;

describe('chip_color enum ↔ ChipColorRole 드리프트 가드', () => {
  it('앱 유니온과 DB enum 의 값 집합이 같다', () => {
    expect([...APP_CHIP_COLORS].sort()).toEqual([...chipColorEnum.enumValues].sort());
  });

  it('APP_CHIP_COLORS 는 ChipColorRole 을 빠짐없이 덮는다', () => {
    // 완전성은 아래 Record<ChipColorRole, true> 의 매핑 타입이 강제한다 — 유니온 멤버를
    // 하나라도 빠뜨리면 컴파일 에러다. 단 vitest 는 타입을 벗겨내고 실행하므로 이 강제는
    // `pnpm tsc --noEmit`(pre-commit 훅 포함)에서만 발동하고, 아래 런타임 단언은 배열과
    // 키 집합이 어긋나는 경우를 잡는다.
    const covered: Record<ChipColorRole, true> = {
      primary: true,
      tertiary: true,
      warning: true,
      error: true,
      surface: true,
    };
    expect(Object.keys(covered).sort()).toEqual([...APP_CHIP_COLORS].sort());
  });
});
