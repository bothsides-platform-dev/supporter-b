import { formatInTimeZone } from 'date-fns-tz';

const KST = 'Asia/Seoul';

export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}

export function formatPct(value: number, digits = 2): string {
  return (value * 100).toFixed(digits) + '%';
}

export function formatDate(iso: string): string {
  // Deadlines are stored as T23:59:59Z (UTC midnight-minus-one).
  // We want the calendar date the *user intended* (the date portion of the
  // ISO string), not the KST wall-clock date of that instant.
  // Slicing to 10 chars extracts that intended date directly.
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateTime(iso: string): string {
  return formatInTimeZone(new Date(iso), KST, 'yyyy-MM-dd HH:mm');
}

export function formatDeadline(iso: string): string {
  const diff = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff < 0) return '마감';
  if (diff === 0) return 'D-0';
  return `D-${diff}`;
}
