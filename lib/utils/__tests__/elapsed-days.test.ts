// 경과 달력일 — KST 기준.
//
// 왜 ms ÷ 86400 이 아닌가: 그 방식은 **달력일과 어긋난다**(`format.ts:80-83` 이 같은
// 함정을 `formatDeadline` 자리에 기록해 뒀다). 20분 전에 보낸 것이 자정을 넘었다면
// "어제 보낸 것"이고, 23시간 전에 보낸 것이 같은 날이면 "오늘 보낸 것"이다. 아래
// 두 테스트가 정확히 그 두 경우이고, 나이브 구현은 각각 반대로 답한다.

import { describe, it, expect } from 'vitest';
import { elapsedCalendarDays } from '../format';

describe('elapsedCalendarDays', () => {
  it('같은 KST 날짜면 0', () => {
    // 둘 다 KST 2026-01-02.
    expect(
      elapsedCalendarDays('2026-01-01T15:10:00Z', new Date('2026-01-01T20:00:00Z')),
    ).toBe(0);
  });

  // ⚠️ 나이브(ms÷86400)는 0 을 답한다 — 20분밖에 안 지났기 때문이다.
  it('20분 차이라도 KST 자정을 넘었으면 1', () => {
    // then = KST 01-01 23:50, now = KST 01-02 00:10.
    expect(
      elapsedCalendarDays('2026-01-01T14:50:00Z', new Date('2026-01-01T15:10:00Z')),
    ).toBe(1);
  });

  // ⚠️ 나이브는 여기서도 0 을 답한다 — 24시간이 안 됐기 때문이다.
  it('23시간 55분이라도 자정을 넘었으면 1', () => {
    // then = KST 01-02 00:10, now = KST 01-03 00:05.
    expect(
      elapsedCalendarDays('2026-01-01T15:10:00Z', new Date('2026-01-02T15:05:00Z')),
    ).toBe(1);
  });

  // UTC 달력일로 세면 1 이 나온다(UTC 01-01 → 01-02). KST 로는 같은 날이다.
  it('UTC 날짜가 갈려도 KST 날짜로 센다', () => {
    // then = UTC 01-01 16:00 = KST 01-02 01:00, now = UTC 01-02 10:00 = KST 01-02 19:00.
    expect(
      elapsedCalendarDays('2026-01-01T16:00:00Z', new Date('2026-01-02T10:00:00Z')),
    ).toBe(0);
  });

  it('달을 넘어도 센다', () => {
    // KST 01-31 → KST 02-02.
    expect(
      elapsedCalendarDays('2026-01-30T15:00:00Z', new Date('2026-02-01T15:00:00Z')),
    ).toBe(2);
  });

  it('30일 임계값을 정확히 센다 — 운영자 알림이 이 값에 걸린다', () => {
    expect(
      elapsedCalendarDays('2026-01-01T03:00:00Z', new Date('2026-01-31T03:00:00Z')),
    ).toBe(30);
  });

  // 시계 어긋남·미래 시각이 음수로 새면 화면에 "보낸 지 -1일째"가 뜬다.
  it('미래 시각은 0 으로 바닥을 친다', () => {
    expect(
      elapsedCalendarDays('2026-02-01T00:00:00Z', new Date('2026-01-01T00:00:00Z')),
    ).toBe(0);
  });
});
