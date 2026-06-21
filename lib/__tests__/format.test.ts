import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatDeadline,
  formatSize,
  formatKrwReadable,
  formatRatePerManwon,
  formatFeeRateDisplay,
  formatKrwField,
} from '../format';

describe('formatFeeRateDisplay', () => {
  it('숫자만 저장된 신규 값에는 % 를 붙인다', () => {
    expect(formatFeeRateDisplay('3.4')).toBe('3.4%');
    expect(formatFeeRateDisplay('2')).toBe('2%');
  });

  it('이미 %·자유 텍스트인 과거 값은 그대로 둔다', () => {
    expect(formatFeeRateDisplay('3.4%')).toBe('3.4%');
    expect(formatFeeRateDisplay('협의 가능')).toBe('협의 가능');
  });

  it('앞뒤 공백이 있는 숫자도 trim 후 % 를 붙인다', () => {
    expect(formatFeeRateDisplay(' 3.4 ')).toBe('3.4%');
  });

  it('빈 값/널은 빈 문자열을 반환한다', () => {
    expect(formatFeeRateDisplay('')).toBe('');
    expect(formatFeeRateDisplay(null)).toBe('');
    expect(formatFeeRateDisplay(undefined)).toBe('');
  });
});

describe('formatKrwField', () => {
  it('원 단위 숫자 문자열을 읽기 쉬운 한국어 금액으로 표기한다', () => {
    expect(formatKrwField('100000000')).toBe('1억원');
    expect(formatKrwField('30000000')).toBe('3,000만원');
  });

  it('파싱 불가한 과거 자유 텍스트는 원문을 유지한다', () => {
    expect(formatKrwField('월 1억')).toBe('월 1억');
    expect(formatKrwField('3000만원')).toBe('3000만원');
  });

  it('0·음수는 formatKrwReadable 가 빈 문자열을 주므로 원문을 유지한다(경계)', () => {
    // formatKrwReadable 는 n<=0 에 ''를 반환 → `|| value` 폴백으로 원문 노출
    expect(formatKrwField('0')).toBe('0');
    expect(formatKrwField('-100')).toBe('-100');
  });

  it('빈 값/널은 빈 문자열을 반환한다', () => {
    expect(formatKrwField('')).toBe('');
    expect(formatKrwField(null)).toBe('');
    expect(formatKrwField(undefined)).toBe('');
  });
});

describe('formatKrwReadable', () => {
  it('만·억 단위로 끊고 나머지는 콤마로 표기한다', () => {
    expect(formatKrwReadable(5000)).toBe('5,000원');
    expect(formatKrwReadable(50000)).toBe('5만원');
    expect(formatKrwReadable(50000000)).toBe('5,000만원');
  });

  it('천 배수가 아닌 그룹은 콤마로 표기한다', () => {
    expect(formatKrwReadable(5000000)).toBe('500만원');
    expect(formatKrwReadable(12340000)).toBe('1,234만원');
  });

  it('억·만 그룹을 함께 표기한다', () => {
    expect(formatKrwReadable(120000000)).toBe('1억2,000만원');
    expect(formatKrwReadable(100000000)).toBe('1억원');
  });

  it('나머지(원)가 있으면 마지막 토큰에 원을 붙인다', () => {
    expect(formatKrwReadable(12345)).toBe('1만2,345원');
  });

  it('유효하지 않은 값은 빈 문자열을 반환한다', () => {
    expect(formatKrwReadable(0)).toBe('');
    expect(formatKrwReadable(-5000)).toBe('');
    expect(formatKrwReadable(NaN)).toBe('');
    expect(formatKrwReadable(Infinity)).toBe('');
  });
});

describe('formatRatePerManwon', () => {
  it('수수료율(%)을 1만원 결제 기준 원화 환산으로 표기한다', () => {
    expect(formatRatePerManwon(1.25)).toBe('1만원 결제 시 125원');
    expect(formatRatePerManwon(0.8)).toBe('1만원 결제 시 80원');
    expect(formatRatePerManwon(3)).toBe('1만원 결제 시 300원');
  });

  it('1,000원 이상은 콤마로 표기한다', () => {
    expect(formatRatePerManwon(15)).toBe('1만원 결제 시 1,500원');
  });

  it('유효하지 않은 값(0·음수·NaN·Infinity)은 빈 문자열을 반환한다', () => {
    expect(formatRatePerManwon(0)).toBe('');
    expect(formatRatePerManwon(-1)).toBe('');
    expect(formatRatePerManwon(NaN)).toBe('');
    expect(formatRatePerManwon(Infinity)).toBe('');
  });
});

describe('formatDate', () => {
  it('UTC+9 타임존에서 T23:59:59Z 마감일(레거시 규약)이 같은 날짜로 표시된다', () => {
    // 2026-06-30T23:59:59Z = 2026-07-01 08:59 KST
    // 사용자가 입력한 날짜(2026-06-30)로 표시되어야 함
    const result = formatDate('2026-06-30T23:59:59Z');
    expect(result).toBe('2026. 06. 30.');
  });

  it('신규 규약 +09:00 오프셋 마감일도 선택한 날짜로 표시된다', () => {
    // 2026-06-30T23:59:59+09:00 = 2026-06-30T14:59:59Z — 여전히 6/30
    const result = formatDate('2026-06-30T23:59:59+09:00');
    expect(result).toBe('2026. 06. 30.');
  });

  it('날짜만 있는 ISO 문자열도 정상 표시된다', () => {
    const result = formatDate('2026-06-30');
    expect(result).toBe('2026. 06. 30.');
  });
});

/**
 * formatDeadline KST 달력일 기준 테스트
 *
 * 신규 규약(+09:00) 마감일은 KST 달력일로 정확하게 계산된다.
 * 레거시(T23:59:59Z) 마감일은 KST 달력상 실제 마감이 다음날 08:59이므로
 * KST 기준 달력일 차이가 1 늘어난다 — 의도된 동작, 마이그레이션 없음.
 */
describe('formatDeadline (KST 달력일 기준)', () => {
  afterEach(() => vi.useRealTimers());

  it('마감 당일 KST 오후에도 D-0를 표시한다', () => {
    // now = 2026-06-30T12:00:00Z = 2026-06-30 21:00 KST — deadline 당일 오후
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T12:00:00.000Z'));
    // deadline KST 6/30 끝
    expect(formatDeadline('2026-06-30T23:59:59+09:00')).toBe('D-0');
  });

  it('KST 자정이 지나면 마감(expired)으로 표시한다', () => {
    // now = 2026-06-30T15:01:00Z = 2026-07-01 00:01 KST — 자정 경과
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T15:01:00.000Z'));
    expect(formatDeadline('2026-06-30T23:59:59+09:00')).toBe('마감');
  });

  it('KST 달력일로 이틀 뒤 마감은 D-2', () => {
    // now = 2026-06-28T03:00:00Z = 2026-06-28 12:00 KST
    // deadline KST 6/30 → 달력일 차이 2
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-28T03:00:00.000Z'));
    expect(formatDeadline('2026-06-30T23:59:59+09:00')).toBe('D-2');
  });

  it('당일 오전 이른 시각에도 D-0 (KST 새벽)', () => {
    // now = 2026-06-30T00:30:00Z = 2026-06-30 09:30 KST — 당일 아침
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T00:30:00.000Z'));
    expect(formatDeadline('2026-06-30T23:59:59+09:00')).toBe('D-0');
  });

  it('레거시 T23:59:59Z 마감일 — KST 달력일 기준으로 하루 더 남은 것으로 계산된다', () => {
    // '2026-06-30T23:59:59Z' = KST 2026-07-01 08:59:59 → KST 달력일은 7/1
    // now = 2026-06-30T12:00:00Z = KST 2026-06-30 21:00 → kstNow = '2026-06-30'
    // diff = 7/1 - 6/30 = 1 → D-1 (사용자가 설정한 날짜 6/30보다 하루 늘어남 — 레거시 인코딩 특성)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T12:00:00.000Z'));
    expect(formatDeadline('2026-06-30T23:59:59Z')).toBe('D-1');
  });
});

describe('formatDateTime', () => {
  it('timezone 미지정 시 KST 기준으로 표시된다', () => {
    // 2026-06-01T05:30:00Z = 2026-06-01 14:30 KST (UTC+9)
    const result = formatDateTime('2026-06-01T05:30:00Z');
    expect(result).toBe('2026-06-01 14:30');
  });

  it('자정 경계에서 KST 날짜로 올바르게 표시된다', () => {
    // 2026-06-30T15:00:00Z = 2026-07-01 00:00 KST — 날짜가 넘어감
    const result = formatDateTime('2026-06-30T15:00:00Z');
    expect(result).toBe('2026-07-01 00:00');
  });

  it('T23:59:59Z는 KST 익일 08:59으로 표시된다', () => {
    // 2026-06-30T23:59:59Z = 2026-07-01 08:59 KST
    const result = formatDateTime('2026-06-30T23:59:59Z');
    expect(result).toBe('2026-07-01 08:59');
  });

  it('명시적 UTC timezone을 따른다', () => {
    const result = formatDateTime('2026-06-01T05:30:00Z', 'UTC');
    expect(result).toBe('2026-06-01 05:30');
  });

  it('명시적 America/New_York timezone을 따른다', () => {
    // 2026-06-01T05:30:00Z = 2026-06-01 01:30 EDT (UTC-4)
    const result = formatDateTime('2026-06-01T05:30:00Z', 'America/New_York');
    expect(result).toBe('2026-06-01 01:30');
  });
});

describe('formatSize', () => {
  it('1KB 미만은 B로 표시', () => {
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(999)).toBe('999 B');
  });

  it('1KB 이상 1MB 미만은 KB로 표시 (정수)', () => {
    expect(formatSize(1_000)).toBe('1 KB');
    expect(formatSize(5_000)).toBe('5 KB');
    // 1MB 바로 아래 경계는 MB로 승격되지 않고 KB로 남는다
    expect(formatSize(999_999)).toBe('1000 KB');
  });

  it('1MB 이상은 MB로 표시 (소수 1자리)', () => {
    expect(formatSize(1_000_000)).toBe('1.0 MB');
    expect(formatSize(2_500_000)).toBe('2.5 MB');
  });
});
