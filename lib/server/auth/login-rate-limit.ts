import { getLoginAttemptRepo } from '@/lib/server/repositories/factory';

// Server-authoritative login throttle. Keyed independently by email (single
// account brute-force) and by IP (password spraying across many accounts).
// 10 consecutive failures on a key lock it for 15 minutes. Mirrors the numbers
// the old client-side tracker used, but here the attacker can't clear it.
//
// All persistence goes through LoginAttemptRepo (repositories/factory), so the
// caller never hands in a db handle — the repo bundle is the injection point.
export const LOGIN_LOCK_THRESHOLD = 10;
export const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;

export interface LoginLockStatus {
  locked: boolean;
  lockedUntil: Date | null;
}

export interface LoginAttemptAdmission {
  allowed: boolean;
  lockedUntil: Date | null;
}

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

/** Client address written by the trusted reverse proxy on the inbound request. */
export function clientIpFromHeaders(
  headers: Pick<Headers, 'get'> | undefined,
): string | null {
  if (!headers) return null;
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim() || null;
  return headers.get('x-real-ip')?.trim() || null;
}

async function readKey(key: string): Promise<KeyRecord | null> {
  const rec = await (await getLoginAttemptRepo()).findByKey(key);
  // Repo returns `undefined` for a missing row; this module's policy math is
  // written against `null` — adapt without changing the downstream logic.
  return rec ?? null;
}

function isActiveLock(rec: KeyRecord | null, now: Date): boolean {
  return (
    rec?.lockedUntil != null && now.getTime() < rec.lockedUntil.getTime()
  );
}

/**
 * Atomically reserve the email/IP attempt before bcrypt. The request that
 * reaches the threshold is still admitted (matching the existing ten-guess
 * contract); a request observing an active lock is rejected without mutating
 * either bucket and before password verification.
 */
export async function reserveLoginAttempt({
  email,
  ip,
  now,
}: {
  email: string;
  ip: string | null;
  now: Date;
}): Promise<LoginAttemptAdmission> {
  const result = await (
    await getLoginAttemptRepo()
  ).reserve(keysFor(email, ip), {
    threshold: LOGIN_LOCK_THRESHOLD,
    now,
    lockUntil: new Date(now.getTime() + LOGIN_LOCK_DURATION_MS),
  });
  if (!result.allowed) {
    return { allowed: false, lockedUntil: result.lockedUntil };
  }

  let lockedUntil: Date | null = null;
  for (const record of result.records) {
    if (!isActiveLock(record, now)) continue;
    if (!lockedUntil || record.lockedUntil!.getTime() > lockedUntil.getTime()) {
      lockedUntil = record.lockedUntil;
    }
  }
  return { allowed: true, lockedUntil };
}

/** Remove a reservation when the verifier failed rather than rejected credentials. */
export async function releaseLoginAttempt({
  email,
  ip,
}: {
  email: string;
  ip: string | null;
}): Promise<void> {
  await (await getLoginAttemptRepo()).release(keysFor(email, ip), LOGIN_LOCK_THRESHOLD);
}

/** Lock status for a login attempt — locked if EITHER the email or IP key is. */
export async function checkLoginLock({
  email,
  ip,
  now,
}: {
  email: string;
  ip: string | null;
  now: Date;
}): Promise<LoginLockStatus> {
  let lockedUntil: Date | null = null;
  for (const key of keysFor(email, ip)) {
    const rec = await readKey(key);
    if (isActiveLock(rec, now)) {
      const until = rec!.lockedUntil!;
      if (!lockedUntil || until.getTime() > lockedUntil.getTime()) {
        lockedUntil = until;
      }
    }
  }
  return { locked: lockedUntil !== null, lockedUntil };
}

/** Record a failed login against both keys; returns the resulting lock status. */
export async function recordLoginFailure({
  email,
  ip,
  now,
}: {
  email: string;
  ip: string | null;
  now: Date;
}): Promise<LoginLockStatus> {
  const { lockedUntil } = await reserveLoginAttempt({ email, ip, now });
  return { locked: lockedUntil !== null, lockedUntil };
}

/**
 * Clear the failure buckets after a successful login. Both the email key and
 * (when present) the IP key are reset, so a legitimate sign-in fully releases
 * the throttle for that user/network. Trade-off: an attacker who happens to
 * own one valid account on a shared IP can reset that IP's spraying streak —
 * accepted in exchange for not penalising shared-NAT users after they log in.
 */
export async function clearLoginAttempts({
  email,
  ip,
}: {
  email: string;
  ip?: string | null;
}): Promise<void> {
  const keys = [emailKey(email)];
  if (ip) keys.push(ipKey(ip));
  await (await getLoginAttemptRepo()).clear(keys);
}
