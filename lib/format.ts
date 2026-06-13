import { formatInTimeZone } from 'date-fns-tz';
import { numberToHangulMixed } from 'es-hangul';

const KST = 'Asia/Seoul';

export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}

/**
 * 원 단위 정수를 한국어로 읽기 쉽게 표기한다 — 억/만 그룹으로 끊고 콤마로 표기.
 * 예: 5000→`5,000원`, 50000000→`5,000만원`, 120000000→`1억2,000만원`.
 * 유효하지 않은 값(<=0·NaN·Infinity)은 힌트 생략을 위해 빈 문자열을 반환한다.
 */
export function formatKrwReadable(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${numberToHangulMixed(Math.floor(n))}원`;
}

export function formatPct(value: number, digits = 2): string {
  return (value * 100).toFixed(digits) + '%';
}

/**
 * 수수료율(%)을 1만원 결제 기준 원화 환산으로 표기한다.
 * 예: 1.25→`1만원 결제 시 125원`, 0.8→`1만원 결제 시 80원`.
 * 유효하지 않은 값(<=0·NaN·Infinity)은 힌트 생략을 위해 빈 문자열을 반환한다.
 */
export function formatRatePerManwon(ratePct: number): string {
  if (!Number.isFinite(ratePct) || ratePct <= 0) return '';
  return `1만원 결제 시 ${Math.round(ratePct * 100).toLocaleString()}원`;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function formatDate(iso: string): string {
  // Deadlines are stored as T23:59:59Z; the ISO date portion is the
  // user's intended calendar date. Append T00:00:00Z and format in UTC
  // to avoid any timezone conversion.
  return formatInTimeZone(
    new Date(iso.slice(0, 10) + 'T00:00:00Z'),
    'UTC',
    'yyyy. MM. dd.',
  );
}

export function formatDateTime(iso: string, timeZone: string = KST, fmt = 'yyyy-MM-dd HH:mm'): string {
  return formatInTimeZone(new Date(iso), timeZone, fmt);
}

export function formatDeadline(iso: string): string {
  const diff = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff < 0) return '마감';
  if (diff === 0) return 'D-0';
  return `D-${diff}`;
}
