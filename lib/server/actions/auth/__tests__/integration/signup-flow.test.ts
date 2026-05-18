// End-to-end (action-only) walk through the four signup hops:
//   P2 signupEmailAction → P4 verifyEmailAction → P5/P6 signupCompleteAction
//
// No UI involved. The point is to prove the sessionStorage hand-off the
// client performs (email, inviteToken) carries the right data so each hop
// has what it needs.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  outboxEntries,
  users,
  workspaces,
} from '@/lib/db/schema';
import { signupEmailAction } from '../../signupEmailAction';
import { verifyEmailAction } from '../../verifyEmailAction';
import { signupCompleteAction } from '../../signupCompleteAction';
import { setupActionEnv, teardownActionEnv } from '../_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;

function tokenFromOutbox(html: string): string {
  return decodeURIComponent(html.match(/token=([^"]+)"/)?.[1] ?? '');
}

describe('signup flow integration (no UI)', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('P2 → P4 → P5 (buyer) lands rows in users, workspaces, biz_profiles', async () => {
    // P2 — buyer requests verify mail
    const e = await signupEmailAction({ email: 'kim@example.com' });
    expect(e.ok).toBe(true);

    // Pull the raw token from the outbox HTML body (Step 5 fallback).
    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'auth.verify'))
      .limit(1);
    const rawToken = tokenFromOutbox(rows[0].html);

    // P4 — verify token (atomic consume)
    const v = await verifyEmailAction(rawToken);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.email).toBe('kim@example.com');

    // P5/P6 — finalise signup as buyer
    const c = await signupCompleteAction({
      email: v.email,
      name: '김구매',
      password: 'Password123!',
      wsKind: 'buyer',
      wsName: '(주)샘플테크',
      bizProfile: {
        bizNo: '1234567890',
        taxType: 'general',
        status: 'active',
        grade: 'general',
        gradeSource: 'user_confirmed',
      },
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.redirectTo).toBe('/rfp');

    // Sanity on the persisted graph.
    const [u] = await db.select().from(users).where(eq(users.email, 'kim@example.com'));
    expect(u).toBeDefined();
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.name, '(주)샘플테크'));
    expect(ws.bizProfileId).not.toBeNull();
  });

  it('P2 → P4 → P5 (pg) creates a PG workspace and redirects to /inbox', async () => {
    // P2 — PG user requests verify mail (inviteToken in meta is preserved but
    // workspace creation no longer uses it — claim happens via claimInviteTokenAction
    // after login).
    const e = await signupEmailAction({
      email: 'sales@toss.im',
      inviteToken: 'INVITE-RAW-STUB',
    });
    expect(e.ok).toBe(true);

    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'sales@toss.im'))
      .limit(1);
    const verifyToken = tokenFromOutbox(rows[0].html);

    // P4 — verify carries the invite token back to the client
    const v = await verifyEmailAction(verifyToken);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.inviteToken).toBe('INVITE-RAW-STUB');

    // P5/P6 — finalise as PG with explicit workspace name.
    // The inviteToken from the draft is NOT passed here; claim is separate.
    const c = await signupCompleteAction({
      email: v.email,
      name: '토스영업',
      password: 'Password123!',
      wsKind: 'pg',
      wsName: '토스페이먼츠',
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.redirectTo).toBe('/inbox');

    // PG workspace created with the provided name.
    const [pgWs] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.name, '토스페이먼츠'));
    expect(pgWs).toBeDefined();
    expect(pgWs.type).toBe('pg');

    // User was created.
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'sales@toss.im'));
    expect(u).toBeDefined();
  });
});
