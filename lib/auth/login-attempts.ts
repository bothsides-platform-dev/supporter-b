// Client-side login attempt tracker (mock per PG_RFP_SPEC §8.1 — v1 swaps to
// IP+email server-side). The /login page calls recordFailure() after each
// failed loginAction and resetAttempts() after a successful one. State lives
// in localStorage so a page reload doesn't bypass the lock; an attacker who
// clears storage trivially defeats it — that's an accepted v0 trade-off the
// real Redis/DB implementation lands in v1.

export const LOCK_THRESHOLD = 10; // 10번째 실패에 15분 락
export const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;

export interface LoginAttemptsState {
  count: number;
  lockedUntilTs: number | null;
}

interface AttemptRecord {
  count: number;
  lockedUntilTs: number | null;
}

export interface AttemptsStorage {
  get(key: string): AttemptRecord | null;
  set(key: string, value: AttemptRecord): void;
  remove(key: string): void;
}

function normalise(email: string): string {
  return email.trim().toLowerCase();
}

function storageKey(email: string): string {
  return `login-attempts:${normalise(email)}`;
}

// localStorage adapter. Safe to call during SSR — returns a no-op storage.
function browserStorage(): AttemptsStorage {
  if (typeof window === 'undefined') {
    return {
      get: () => null,
      set: () => {},
      remove: () => {},
    };
  }
  return {
    get: (k) => {
      try {
        const raw = window.localStorage.getItem(k);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as AttemptRecord;
        if (
          typeof parsed?.count !== 'number' ||
          (parsed.lockedUntilTs !== null &&
            typeof parsed.lockedUntilTs !== 'number')
        ) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        window.localStorage.setItem(k, JSON.stringify(v));
      } catch {
        // Quota or privacy mode — silently drop; better UX than crashing.
      }
    },
    remove: (k) => {
      try {
        window.localStorage.removeItem(k);
      } catch {
        // ignore
      }
    },
  };
}

function toState(record: AttemptRecord | null): LoginAttemptsState {
  if (!record) {
    return { count: 0, lockedUntilTs: null };
  }
  return {
    count: record.count,
    lockedUntilTs: record.lockedUntilTs,
  };
}

export function getState(
  email: string,
  storage: AttemptsStorage = browserStorage(),
  now: number = Date.now(),
): LoginAttemptsState {
  const key = storageKey(email);
  const rec = storage.get(key);
  if (rec?.lockedUntilTs !== null && rec?.lockedUntilTs !== undefined) {
    if (now > rec.lockedUntilTs) {
      // Lock window elapsed — wipe the bucket so the user starts fresh.
      storage.remove(key);
      return { count: 0, lockedUntilTs: null };
    }
  }
  return toState(rec);
}

export function recordFailure(
  email: string,
  storage: AttemptsStorage = browserStorage(),
  now: number = Date.now(),
): LoginAttemptsState {
  const key = storageKey(email);
  const existing = storage.get(key);

  // Already locked — keep the original lock anchor. Counting beyond LOCK_THRESHOLD
  // is fine, but we never roll the window forward (would let a flood extend the
  // lockout indefinitely past the spec'd 15min).
  if (
    existing?.lockedUntilTs !== null &&
    existing?.lockedUntilTs !== undefined &&
    now <= existing.lockedUntilTs
  ) {
    const next: AttemptRecord = {
      count: existing.count + 1,
      lockedUntilTs: existing.lockedUntilTs,
    };
    storage.set(key, next);
    return toState(next);
  }

  // Stale lock — treat as cleared and start a fresh streak.
  const baseCount =
    existing && (existing.lockedUntilTs === null || now > existing.lockedUntilTs)
      ? existing.lockedUntilTs === null
        ? existing.count
        : 0
      : 0;

  const count = baseCount + 1;
  const lockedUntilTs =
    count >= LOCK_THRESHOLD ? now + LOGIN_LOCK_DURATION_MS : null;
  const next: AttemptRecord = { count, lockedUntilTs };
  storage.set(key, next);
  return toState(next);
}

export function resetAttempts(
  email: string,
  storage: AttemptsStorage = browserStorage(),
): void {
  storage.remove(storageKey(email));
}
