import { describe, it, expect } from 'vitest';

import { OUTBOX_EVENTS } from '../types';
import { outboxEventEnum } from '@/lib/db/schema/_enums';

/**
 * 아웃박스 이벤트에는 출처가 **둘** 있다 — 앱이 보는 런타임 튜플(`OUTBOX_EVENTS`)과
 * DB 가 강제하는 `outbox_event` pgEnum. 컴파일러는 둘을 잇지 않는다.
 *
 * 한쪽만 늘리면 갈리는 방식이 둘 다 나쁘다:
 * - 튜플만 늘리면 타입은 통과하는데 INSERT 가 런타임에 `invalid input value for enum`
 *   으로 죽는다 — 그것도 알림 팬아웃 **트랜잭션 안에서**.
 * - pgEnum 만 늘리면 그 이벤트를 앱이 영영 못 쓰고, `retryEmail` 화이트리스트
 *   (`ALLOWED_OUTBOX_EVENTS`)에서도 빠져 재시도가 NO_EMAIL 로 죽는다.
 *
 * 이 레포는 도메인 어휘를 드리프트 가드로 못박는 관례가 있다(CLAUDE.md). 여기엔
 * 없었다 — `signing.awaiting_template` 을 추가하며 함께 깐다.
 */
/**
 * pgEnum 에만 있고 앱은 쓰지 않는 값 — **의도된 차이**다. `_enums.ts` 가 "Reserved for
 * future membership-approval notification emails — not yet wired" 라고 적어 둔 것들이고,
 * DB 값을 지우려면 `ALTER TYPE ... DROP VALUE` 가 필요한데 Postgres 에 그런 구문이 없다.
 * 여기 나열해 두면 **설명되지 않은 새 값**이 늘 때 이 테스트가 잡는다.
 */
const RESERVED_DB_ONLY = ['membership.approved', 'membership.rejected'] as const;

describe('outbox event 어휘', () => {
  // 이 방향이 런타임 사고를 만든다 — 튜플에만 있으면 INSERT 가 알림 트랜잭션 안에서
  // `invalid input value for enum` 으로 죽는다.
  it('앱이 쓰는 이벤트는 전부 pgEnum 에 있다', () => {
    const dbValues = new Set<string>(outboxEventEnum.enumValues);
    expect(OUTBOX_EVENTS.filter((e) => !dbValues.has(e))).toEqual([]);
  });

  it('pgEnum 의 여분은 문서화된 예약값뿐이다', () => {
    const appValues = new Set<string>(OUTBOX_EVENTS);
    expect(outboxEventEnum.enumValues.filter((e) => !appValues.has(e)).sort()).toEqual(
      [...RESERVED_DB_ONLY].sort(),
    );
  });
});
