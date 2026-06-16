// format.ts — 스레드 공용 포맷터 직접 계약. 출력이 호스트 TZ 의존이므로
// 정확한 시각 대신 ko-KR 형태(shape)를 핀한다 (컴포넌트 테스트들은 03:00Z–
// 14:00Z 안전창으로 날짜 일치를 보장하는 것과 같은 이유).

import { describe, expect, it } from 'vitest';

import { formatDayLabel, formatListTime, formatTime } from '../format';

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

describe('formatListTime', () => {
  // now = 2026-06-16T06:00:00Z
  const NOW = new Date('2026-06-16T06:00:00.000Z');

  it('오늘 메시지 → 오전/오후 HH:mm 형태', () => {
    const iso = '2026-06-16T05:00:00.000Z';
    expect(formatListTime(iso, NOW)).toMatch(/^오[전후] \d{1,2}:\d{2}$/);
  });

  it('어제 메시지 → "어제"', () => {
    const iso = '2026-06-15T06:00:00.000Z';
    expect(formatListTime(iso, NOW)).toBe('어제');
  });

  it('3일 전 → 요일 이름(~요일)', () => {
    const iso = '2026-06-13T06:00:00.000Z';
    expect(formatListTime(iso, NOW)).toMatch(/요일$/);
  });

  it('7일 이상 전 → M/D 숫자', () => {
    const iso = '2026-06-01T06:00:00.000Z';
    expect(formatListTime(iso, NOW)).toBe('6/1');
  });
});
