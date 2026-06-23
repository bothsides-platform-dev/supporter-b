export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function bucket15Min(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (15 * 60 * 1000));
}
