import { formatInTimeZone } from 'date-fns-tz';

const KST = 'Asia/Seoul';

export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}

/**
 * 원 단위 정수를 한국어로 읽기 쉽게 표기한다 — 억/만 그룹으로 끊고,
 * 1000의 배수 그룹은 `천`으로 축약(예: 5000→`5천`), 그 외는 콤마(예: 1234→`1,234`).
 * 나머지(원)가 있으면 마지막 토큰에 `원`을 붙이고(`1만 2,345원`), 없으면 끝에 ` 원`을 둔다(`5천만 원`).
 * 유효하지 않은 값(<=0·NaN·Infinity)은 힌트 생략을 위해 빈 문자열을 반환한다.
 */
export function formatKrwReadable(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  const amount = Math.floor(n);

  const group = (v: number): string =>
    v % 1000 === 0 ? `${v / 1000}천` : v.toLocaleString('ko-KR');

  const eok = Math.floor(amount / 100_000_000);
  const man = Math.floor((amount % 100_000_000) / 10_000);
  const rest = amount % 10_000;

  const tokens: string[] = [];
  if (eok > 0) tokens.push(`${group(eok)}억`);
  if (man > 0) tokens.push(`${group(man)}만`);
  if (rest > 0) return [...tokens, `${group(rest)}원`].join(' ');
  return `${tokens.join(' ')} 원`;
}

export function formatPct(value: number, digits = 2): string {
  return (value * 100).toFixed(digits) + '%';
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
