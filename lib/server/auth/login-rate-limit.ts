import { eq } from 'drizzle-orm';
import { loginAttempts } from '@/lib/db/schema';

// Server-authoritative login throttle. Keyed independently by email (single
// account brute-force) and by IP (password spraying across many accounts).
// 10 consecutive failures on a key lock it for 15 minutes. Mirrors the numbers
// the old client-side tracker used, but here the attacker can't clear it.
export const LOGIN_LOCK_THRESHOLD = 10;
export const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;

export interface LoginLockStatus {
  locked: boolean;
  lockedUntil: Date | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

interface KeyRecord {
  count: number;
  lockedUntil: Date | null;
}

function emailKey(email: string): string {
  return `email:${email.trim().toLowerCase()}`;
}

function ipKey(ip: string): string {
  return `ip:${ip.trim()}`;
}

function keysFor(email: string, ip: string | null): string[] {
  const keys = [emailKey(email)];
  if (ip) keys.push(ipKey(ip));
  return keys;
}

async function readKey(db: Db, key: string): Promise<KeyRecord | null> {
  const [row] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.key, key))
    .limit(1);
  if (!row) return null;
  return {
    count: row.count,
    lockedUntil: row.lockedUntil ? new Date(row.lockedUntil) : null,
  };
}

function isActiveLock(rec: KeyRecord | null, now: Date): boolean {
  return (
    rec?.lockedUntil != null && now.getTime() < rec.lockedUntil.getTime()
  );
}

/** Lock status for a login attempt — locked if EITHER the email or IP key is. */
export async function checkLoginLock(
  db: Db,
  { email, ip, now }: { email: string; ip: string | null; now: Date },
): Promise<LoginLockStatus> {
  let lockedUntil: Date | null = null;
  for (const key of keysFor(email, ip)) {
    const rec = await readKey(db, key);
    if (isActiveLock(rec, now)) {
      const until = rec!.lockedUntil!;
      if (!lockedUntil || until.getTime() > lockedUntil.getTime()) {
        lockedUntil = until;
      }
    }
  }
  return { locked: lockedUntil !== null, lockedUntil };
}

function nextRecord(existing: KeyRecord | null, now: Date): KeyRecord {
  // Active lock — keep the original anchor so a flood can't roll the window
  // forward past the 15-minute cap; just keep counting.
  if (isActiveLock(existing, now)) {
    return { count: existing!.count + 1, lockedUntil: existing!.lockedUntil };
  }
  // Stale lock (expired) resets to a fresh streak; an unlocked row keeps its
  // running count.
  const base = existing && existing.lockedUntil === null ? existing.count : 0;
  const count = base + 1;
  const lockedUntil =
    count >= LOGIN_LOCK_THRESHOLD ? new Date(now.getTime() + LOGIN_LOCK_DURATION_MS) : null;
  return { count, lockedUntil };
}

async function bumpKey(db: Db, key: string, now: Date): Promise<KeyRecord> {
  const existing = await readKey(db, key);
  const next = nextRecord(existing, now);
  await db
    .insert(loginAttempts)
    .values({ key, count: next.count, lockedUntil: next.lockedUntil, updatedAt: now })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: { count: next.count, lockedUntil: next.lockedUntil, updatedAt: now },
    });
  return next;
}

/** Record a failed login against both keys; returns the resulting lock status. */
export async function recordLoginFailure(
  db: Db,
  { email, ip, now }: { email: string; ip: string | null; now: Date },
): Promise<LoginLockStatus> {
  let lockedUntil: Date | null = null;
  for (const key of keysFor(email, ip)) {
    const next = await bumpKey(db, key, now);
    if (next.lockedUntil && now.getTime() < next.lockedUntil.getTime()) {
      if (!lockedUntil || next.lockedUntil.getTime() > lockedUntil.getTime()) {
        lockedUntil = next.lockedUntil;
      }
    }
  }
  return { locked: lockedUntil !== null, lockedUntil };
}

/**
 * Clear the email bucket after a successful login. The IP bucket is left
 * intact on purpose — one valid login must not reset a spraying streak.
 */
export async function clearLoginAttempts(
  db: Db,
  { email }: { email: string; ip?: string | null },
): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, emailKey(email)));
}
