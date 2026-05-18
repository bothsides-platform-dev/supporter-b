import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryInvitationRepository } from '../repositories/in-memory/invitation';
import { generateToken, addMinutes } from '../token';
import type { RfpInvitation } from '@/lib/types/invitation';

function makeInvitation(rawToken: string, overrides?: Partial<RfpInvitation>): RfpInvitation {
  return {
    id: 'inv-1',
    rfpId: 'rfp-1',
    pgWsId: 'ws-toss',
    uniqueToken: rawToken,
    sentAt: new Date().toISOString(),
    expiresAt: addMinutes(new Date(), 7 * 24 * 60),
    status: 'sent',
    ...overrides,
  };
}

describe('InMemoryInvitationRepository', () => {
  let repo: InMemoryInvitationRepository;

  beforeEach(() => {
    repo = new InMemoryInvitationRepository();
  });

  it('claims a valid token and sets acceptedByUserId', async () => {
    const raw = generateToken();
    await repo.save(makeInvitation(raw), raw);

    const result = await repo.claimToken(raw, 'user-pg');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invitation.acceptedByUserId).toBe('user-pg');
      expect(result.invitation.status).toBe('accepted');
    }
  });

  it('returns invalid for unknown token', async () => {
    const result = await repo.claimToken('unknown', 'user-pg');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('returns expired for past expiresAt', async () => {
    const raw = generateToken();
    await repo.save(
      makeInvitation(raw, { expiresAt: new Date(Date.now() - 1000).toISOString() }),
      raw,
    );
    expect(await repo.claimToken(raw, 'user-pg')).toEqual({ ok: false, reason: 'expired' });
  });

  it('returns used when acceptedByUserId already set', async () => {
    const raw = generateToken();
    await repo.save(makeInvitation(raw, { acceptedByUserId: 'prev-user' }), raw);
    expect(await repo.claimToken(raw, 'user-pg')).toEqual({ ok: false, reason: 'used' });
  });

  it('second claim returns used', async () => {
    const raw = generateToken();
    await repo.save(makeInvitation(raw), raw);
    await repo.claimToken(raw, 'user-1');
    expect(await repo.claimToken(raw, 'user-2')).toEqual({ ok: false, reason: 'used' });
  });

  it('canAccess passes any caller scoped to the invited PG workspace', async () => {
    const raw = generateToken();
    await repo.save(makeInvitation(raw), raw);

    // Pre-claim ('sent' / DB pending) — workspace id passes.
    expect(await repo.canAccess('rfp-1', 'ws-toss')).toBe(true);
    // A different ws never passes.
    expect(await repo.canAccess('rfp-1', 'ws-other')).toBe(false);

    // Claim transitions to 'accepted' — still passes for the same ws.
    await repo.claimToken(raw, 'user-pg');
    expect(await repo.canAccess('rfp-1', 'ws-toss')).toBe(true);
  });
});
