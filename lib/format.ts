import { formatInTimeZone } from 'date-fns-tz';

const KST = 'Asia/Seoul';

export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
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
