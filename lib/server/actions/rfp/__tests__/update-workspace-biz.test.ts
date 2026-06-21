import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { bizProfiles, workspaces } from '@/lib/db/schema';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

const sessionRef: {
  value: {
    user: {
      id: string;
      email: string;
      workspaceId: string;
      workspaceType: 'buyer';
      role: 'admin' | 'member';
    };
  } | null;
} = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => Promise.reject(new Error('unused')),
  requireBuyerSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_BUYER'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { updateWorkspaceBizProfileAction } from '../updateWorkspaceBizProfileAction';

let db: PgliteDB;

describe('updateWorkspaceBizProfileAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('inserts a new biz_profiles row AND updates workspace.biz_profile_id (advisor pin 1: workspace updates only here)', async () => {
    const buyer = await seedUser(db, { email: 'b@x.com' });
    const biz = await seedBizProfile(db);
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');
    sessionRef.value = {
      user: {
        id: buyer.id,
        email: 'b@x.com',
        workspaceId: buyerWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };

    const r = await updateWorkspaceBizProfileAction({ grade: 'sme1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bizProfileId).not.toBe(biz.id);

    // 1) Old biz row still present (immutable).
    const oldRow = await db
      .select()
      .from(bizProfiles)
      .where(eq(bizProfiles.id, biz.id));
    expect(oldRow).toHaveLength(1);

    // 2) New row exists with correct grade + user_overridden source.
    const newRow = await db
      .select()
      .from(bizProfiles)
      .where(eq(bizProfiles.id, r.bizProfileId));
    expect(newRow[0].grade).toBe('sme1');
    expect(newRow[0].gradeSource).toBe('user_overridden');
    expect(newRow[0].gradeConfirmedBy).toBe(buyer.id);
    expect(newRow[0].gradeConfirmedAt).not.toBeNull();

    // 3) workspace pointer flipped to the new id.
    const [ws] = await db
      .select({ bizProfileId: workspaces.bizProfileId })
      .from(workspaces)
      .where(eq(workspaces.id, buyerWs.id));
    expect(ws.bizProfileId).toBe(r.bizProfileId);
  });

  // 영세 등급 식별자 통일 회귀 가드: MerchantGrade('small')→MerchantTier('sole')
  // 통합 후, grade='sole' 가 zod·DB enum 양쪽을 통과해 영속돼야 한다.
  it("accepts and persists grade 'sole' (영세) end-to-end after the small→sole unification", async () => {
    const buyer = await seedUser(db, { email: 'b@x.com' });
    const biz = await seedBizProfile(db);
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');
    sessionRef.value = {
      user: {
        id: buyer.id,
        email: 'b@x.com',
        workspaceId: buyerWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };

    const r = await updateWorkspaceBizProfileAction({ grade: 'sole' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await db
      .select()
      .from(bizProfiles)
      .where(eq(bizProfiles.id, r.bizProfileId));
    expect(row.grade).toBe('sole');
  });

  // 레거시 식별자 'small' 은 더 이상 유효한 등급이 아니다 — 스키마가 거부해야 한다.
  it("rejects the legacy grade value 'small' (now invalid)", async () => {
    const buyer = await seedUser(db, { email: 'b@x.com' });
    const biz = await seedBizProfile(db);
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');
    sessionRef.value = {
      user: {
        id: buyer.id,
        email: 'b@x.com',
        workspaceId: buyerWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    // @ts-expect-error 'small' is no longer a valid MerchantTier — pinned at the type layer too.
    const r = await updateWorkspaceBizProfileAction({ grade: 'small' });
    expect(r.ok).toBe(false);
  });

  it('accepts a bizProfile patch (bizNo/taxType/status replacement)', async () => {
    const buyer = await seedUser(db, { email: 'b@x.com' });
    const biz = await seedBizProfile(db);
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');
    sessionRef.value = {
      user: {
        id: buyer.id,
        email: 'b@x.com',
        workspaceId: buyerWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };

    const r = await updateWorkspaceBizProfileAction({
      bizProfile: {
        bizNo: '9999999999',
        taxType: 'simple',
        status: 'active',
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await db
      .select()
      .from(bizProfiles)
      .where(eq(bizProfiles.id, r.bizProfileId));
    expect(row.bizNo).toBe('9999999999');
    expect(row.taxType).toBe('simple');
  });

  it('rejects empty patch (no grade, no bizProfile)', async () => {
    const buyer = await seedUser(db, { email: 'b@x.com' });
    const biz = await seedBizProfile(db);
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');
    sessionRef.value = {
      user: {
        id: buyer.id,
        email: 'b@x.com',
        workspaceId: buyerWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await updateWorkspaceBizProfileAction({});
    expect(r.ok).toBe(false);
  });

  it('rejects without buyer session', async () => {
    sessionRef.value = null;
    const r = await updateWorkspaceBizProfileAction({ grade: 'sme1' });
    expect(r.ok).toBe(false);
  });
});
