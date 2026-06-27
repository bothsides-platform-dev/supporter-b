// computeMessageGrouping — 말풍선 묶음/날짜 구분선 파생 로직(상대방·팀 채팅 공용).
// ThreadView·TeamThreadView 가 map 안에서 글자 단위로 복제하던 계산의 단일 출처.
// self 헤더 노출 정책(ThreadView=양쪽, TeamThreadView=상대만)은 각 뷰가
// groupedWithPrev 로부터 따로 결정하므로 여기선 다루지 않는다.

import { describe, it, expect } from 'vitest';
import { computeMessageGrouping } from '../message-grouping';

// 로컬 TZ 일경계 흔들림 회피를 위해 Z 없는(=로컬) ISO 사용.
const msgs = [
  { createdAt: '2026-06-10T10:00:00', authorUserId: 'A' }, // [0] 첫 메시지
  { createdAt: '2026-06-10T10:02:00', authorUserId: 'A' }, // [1] 2분 후, 같은 작성자 → 묶음
  { createdAt: '2026-06-10T10:10:00', authorUserId: 'A' }, // [2] 8분 후 → 윈도 밖, 묶음 해제
  { createdAt: '2026-06-10T10:11:00', authorUserId: 'B' }, // [3] 작성자 변경 → 묶음 해제
  { createdAt: '2026-06-11T09:00:00', authorUserId: 'B' }, // [4] 다음 날 → 구분선
];

describe('computeMessageGrouping', () => {
  it('빈 배열은 빈 결과를 돌려준다', () => {
    expect(computeMessageGrouping([])).toEqual([]);
  });

  it('첫 메시지는 구분선 표시 + 묶음 아님', () => {
    const g = computeMessageGrouping(msgs);
    expect(g[0].showDivider).toBe(true);
    expect(g[0].groupedWithPrev).toBe(false);
  });

  it('같은 작성자·윈도 이내·같은 날은 묶음(구분선 없음)', () => {
    const g = computeMessageGrouping(msgs);
    expect(g[1].showDivider).toBe(false);
    expect(g[1].groupedWithPrev).toBe(true);
    expect(g[1].dayLabel).toBe(g[0].dayLabel);
  });

  it('윈도(5분)를 넘기면 묶음 해제', () => {
    expect(computeMessageGrouping(msgs)[2].groupedWithPrev).toBe(false);
  });

  it('작성자가 바뀌면 묶음 해제', () => {
    expect(computeMessageGrouping(msgs)[3].groupedWithPrev).toBe(false);
  });

  it('날짜 경계에서는 구분선 + 묶음 해제(같은 작성자라도)', () => {
    const g = computeMessageGrouping(msgs);
    expect(g[4].showDivider).toBe(true);
    expect(g[4].groupedWithPrev).toBe(false);
    expect(g[4].dayLabel).not.toBe(g[3].dayLabel);
  });
});
