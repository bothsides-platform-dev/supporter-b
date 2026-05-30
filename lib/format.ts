export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}

export function formatPct(value: number, digits = 2): string {
  return (value * 100).toFixed(digits) + '%';
}

export function formatDate(iso: string): string {
  // Use the date portion of the ISO string directly to avoid timezone shift.
  // Deadlines are stored as T23:59:59Z (UTC), which would roll over to the next
  // day when converted to KST (UTC+9). Slicing to the date part preserves the
  // intended calendar date regardless of the server's timezone.
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDeadline(iso: string): string {
  const diff = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (diff < 0) return '마감';
  if (diff === 0) return 'D-0';
  return `D-${diff}`;
}

export function rfpSerial(index: number): string {
  const now = new Date();
  const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return `Q-${ym}-${String(index).padStart(4, '0')}`;
}
