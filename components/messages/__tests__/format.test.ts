// format.ts — 스레드 공용 포맷터 직접 계약. 출력이 호스트 TZ 의존이므로
// 정확한 시각 대신 ko-KR 형태(shape)를 핀한다 (컴포넌트 테스트들은 03:00Z–
// 14:00Z 안전창으로 날짜 일치를 보장하는 것과 같은 이유).

import { describe, expect, it } from 'vitest';

import { formatDayLabel, formatTime } from '../format';

describe('formatDayLabel', () => {
  it('ko-KR 장형(월·일·요일)으로 렌더한다', () => {
    // 03:00Z–14:00Z 창 → UTC/KST 동일 날짜.
    expect(formatDayLabel('2026-06-10T05:00:00.000Z')).toMatch(/6월 10일 .요일/);
  });
});

describe('formatTime', () => {
  it('오전/오후 시:분 형태로 렌더한다', () => {
    expect(formatTime('2026-06-10T05:03:00.000Z')).toMatch(/^오[전후] \d{1,2}:\d{2}$/);
  });
});
