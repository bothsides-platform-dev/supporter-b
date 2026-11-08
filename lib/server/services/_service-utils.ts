export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function bucket15Min(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (15 * 60 * 1000));
}

/** 1분 단위 버킷 — 재발송 대기(60초)와 맞물리는 중복 방지 키에 쓴다. */
export function bucket1Min(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (60 * 1000));
}
