import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  bizProfiles,
  outboxEntries,
  users,
  verificationTokens,
  workspaceMembers,
  workspaces,
} from '@/lib/db/schema';
import { signupEmailAction } from '../signupEmailAction';
import { signupCompleteAction } from '../signupCompleteAction';
import { verifyEmailAction } from '../verifyEmailAction';
import { setupActionEnv, teardownActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;

describe('signupEmailAction + verifyEmailAction', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('issues a token, enqueues the outbox row, and verify consumes it', async () => {
    const r = await signupEmailAction({ email: 'Kim@example.com' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.email).toBe('kim@example.com'); // normalised

    // Verification row + outbox row exist.
    const tokens = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.email, 'kim@example.com'));
    expect(tokens).toHaveLength(1);

    const out = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'kim@example.com'));
    expect(out).toHaveLength(1);
    expect(out[0].event).toBe('auth.verify');
  });

  it('rejects malformed emails', async () => {
    const r = await signupEmailAction({ email: 'not-an-email' });
    expect(r.ok).toBe(false);
  });

  it('verify returns email + inviteToken from meta', async () => {
    const r = await signupEmailAction({
      email: 'sales@toss.im',
      inviteToken: 'INVITE-RAW-1',
    });
    expect(r.ok).toBe(true);

    // Pull the raw token from the outbox HTML body — Step 5 fallback.
    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'sales@toss.im'))
      .limit(1);
    const token = tokenFromHtml(rows[0].html);
    expect(token).not.toEqual('');

    const v = await verifyEmailAction(token);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.email).toBe('sales@toss.im');
    expect(v.inviteToken).toBe('INVITE-RAW-1');
  });

  it('verify rejects an unknown token', async () => {
    const v = await verifyEmailAction('definitely-not-a-real-token');
    expect(v.ok).toBe(false);
  });

  it('verify rejects a reused token (atomic consume)', async () => {
    await signupEmailAction({ email: 'a@example.com' });
    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'a@example.com'))
      .limit(1);
    const token = tokenFromHtml(rows[0].html);
    const first = await verifyEmailAction(token);
    expect(first.ok).toBe(true);
    const second = await verifyEmailAction(token);
    expect(second.ok).toBe(false);
  });

  it('stores workspaceType=buyer in meta and verify returns it', async () => {
    const r = await signupEmailAction({ email: 'buyer@example.com', workspaceType: 'buyer' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'buyer@example.com'))
      .limit(1);
    const token = tokenFromHtml(rows[0].html);

    const v = await verifyEmailAction(token);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.workspaceType).toBe('buyer');
  });

  it('stores workspaceType=pg in meta and verify returns it', async () => {
    const r = await signupEmailAction({ email: 'pg@toss.im', workspaceType: 'pg' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const rows = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'pg@toss.im'))
      .limit(1);
    const token = tokenFromHtml(rows[0].html);

    const v = await verifyEmailAction(token);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.workspaceType).toBe('pg');
  });

  it('returns EMAIL_TAKEN if user with that email already exists', async () => {
    await signupCompleteAction({
      email: 'existing@example.com',
      name: '기존사용자',
      password: 'Password123!',
      wsKind: 'buyer',
      wsName: '테스트워크스페이스',
    });

    const r = await signupEmailAction({ email: 'existing@example.com' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('EMAIL_TAKEN');
  });
});

function tokenFromHtml(html: string): string {
  return decodeURIComponent(html.match(/token=([^"]+)"/)?.[1] ?? '');
}

describe('signupCompleteAction — buyer branch', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('creates user + biz_profile + workspace + admin member, returns /rfp', async () => {
    const r = await signupCompleteAction({
      email: 'kim@example.com',
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
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.redirectTo).toBe('/rfp');
    expect(r.password).toBe('Password123!');

    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'kim@example.com'));
    expect(u).toBeDefined();

    const [biz] = await db
      .select()
      .from(bizProfiles)
      .where(eq(bizProfiles.bizNo, '1234567890'));
    expect(biz).toBeDefined();

    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.name, '(주)샘플테크'));
    expect(ws).toBeDefined();
    expect(ws.type).toBe('buyer');
    expect(ws.bizProfileId).toBe(biz.id);

    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, ws.id));
    expect(member.role).toBe('admin');
    expect(member.userId).toBe(u.id);
  });

  it('rejects when wsKind is buyer but wsName missing', async () => {
    const r = await signupCompleteAction({
      email: 'kim@example.com',
      name: '김구매',
      password: 'Password123!',
      wsKind: 'buyer',
    });
    expect(r.ok).toBe(false);
  });

  it('returns EMAIL_TAKEN if a user with the email already exists', async () => {
    const ok = await signupCompleteAction({
      email: 'kim@example.com',
      name: '김구매',
      password: 'Password123!',
      wsKind: 'buyer',
      wsName: 'A',
    });
    expect(ok.ok).toBe(true);
    const dup = await signupCompleteAction({
      email: 'kim@example.com',
      name: '다른사람',
      password: 'Password123!',
      wsKind: 'buyer',
      wsName: 'B',
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toBe('EMAIL_TAKEN');
  });
});

describe('signupCompleteAction — pg branch', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('creates a new PG workspace with the provided name, returns /inbox', async () => {
    const r = await signupCompleteAction({
      email: 'sales@toss.im',
      name: '서포터 B 페이 영업',
      password: 'Password123!',
      wsKind: 'pg',
      wsName: '서포터 B 페이',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.redirectTo).toBe('/inbox');

    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.name, '서포터 B 페이'));
    expect(ws).toBeDefined();
    expect(ws.type).toBe('pg');

    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, ws.id));
    expect(member.role).toBe('admin');
  });

  it('rejects when wsKind is pg but wsName missing', async () => {
    const r = await signupCompleteAction({
      email: 'sales@toss.im',
      name: '서포터 B 페이 영업',
      password: 'Password123!',
      wsKind: 'pg',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('MISSING_WS_NAME');
  });

  it('each PG signup creates its own workspace (no auto-join by domain)', async () => {
    const r1 = await signupCompleteAction({
      email: 'first@toss.im',
      name: '첫번째',
      password: 'Password123!',
      wsKind: 'pg',
      wsName: '서포터 B 페이 1팀',
    });
    const r2 = await signupCompleteAction({
      email: 'second@toss.im',
      name: '두번째',
      password: 'Password123!',
      wsKind: 'pg',
      wsName: '서포터 B 페이 2팀',
    });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const wss = await db.select().from(workspaces);
    const pgWss = wss.filter((w) => w.type === 'pg');
    expect(pgWss).toHaveLength(2);
  });
});

describe('signupCompleteAction — password policy (server-side)', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('rejects a 10-char letter-only password with WEAK_PASSWORD', async () => {
    const r = await signupCompleteAction({
      email: 'weak@example.com',
      name: '약한사용자',
      password: 'aaaaaaaaaa',
      wsKind: 'buyer',
      wsName: '(주)샘플',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('WEAK_PASSWORD');
  });

  it('rejects a 10-char digit-only password with WEAK_PASSWORD', async () => {
    const r = await signupCompleteAction({
      email: 'weak2@example.com',
      name: '약한사용자',
      password: '1234567890',
      wsKind: 'buyer',
      wsName: '(주)샘플',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('WEAK_PASSWORD');
  });

  it('rejects when special character is missing', async () => {
    const r = await signupCompleteAction({
      email: 'weak3@example.com',
      name: '약한사용자',
      password: 'Password123', // letter+digit but no special
      wsKind: 'pg',
      wsName: '약한PG',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('WEAK_PASSWORD');
  });

  it('still surfaces INVALID_INPUT for non-password schema failures (bad email)', async () => {
    const r = await signupCompleteAction({
      email: 'not-an-email',
      name: '약한사용자',
      password: 'Password123!',
      wsKind: 'buyer',
      wsName: '(주)샘플',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });
});
