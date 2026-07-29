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
// _setup.ts 가 beforeEach 에 MockNtsClient 를 주입하고 afterEach 에 되돌리므로,
// 개별 테스트의 오버라이드는 자동으로 정리된다.
import { NtsError, __setNtsClientForTest } from '@/lib/integrations/nts';

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

    // 3456789012 는 MockNtsClient 가 simple/active 로 응답하는 번호다. 값은
    // 클라이언트가 아니라 **서버 조회**에서 온다(아래 위조 테스트가 그걸 못박는다).
    const r = await updateWorkspaceBizProfileAction({
      bizProfile: {
        bizNo: '3456789012',
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
    expect(row.bizNo).toBe('3456789012');
    expect(row.taxType).toBe('simple');
  });

  // 설정의 사업자번호 변경은 **이미 승인을 통과한** 워크스페이스에서 일어난다 —
  // 가입과 달리 관리자 승인이라는 방어선이 없다. 그래서 저하(미검증 통과)를
  // 허용하지 않고, 클라이언트가 보낸 값도 신뢰하지 않는다.
  describe('사업자번호 서버 재판정 (저하 불허)', () => {
    async function asBuyerAdmin() {
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
    }

    it('클라이언트가 보낸 taxType 을 무시하고 서버 조회 결과를 저장한다', async () => {
      await asBuyerAdmin();

      const r = await updateWorkspaceBizProfileAction({
        // 국세청은 3456789012 를 simple 로 응답한다 — 클라는 general 이라 우긴다.
        bizProfile: { bizNo: '3456789012', taxType: 'general', status: 'active' },
      });

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const [row] = await db
        .select()
        .from(bizProfiles)
        .where(eq(bizProfiles.id, r.bizProfileId));
      expect(row.taxType).toBe('simple');
    });

    it('국세청이 폐업으로 응답하면 status 를 active 로 위조해도 거부한다', async () => {
      await asBuyerAdmin();
      const before = await db.select().from(bizProfiles);

      // 9999999999 = MockNtsClient 폐업 픽스처.
      const r = await updateWorkspaceBizProfileAction({
        bizProfile: { bizNo: '9999999999', taxType: 'general', status: 'active' },
      });

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toBe('BIZ_STATUS_NOT_ACTIVE');
      // 워크스페이스 포인터가 옮겨가지 않았다.
      expect(await db.select().from(bizProfiles)).toHaveLength(before.length);
    });

    it('국세청 장애면 저하로 통과시키지 않고 거부한다', async () => {
      await asBuyerAdmin();
      __setNtsClientForTest({
        lookup: async () => {
          throw new NtsError('NTS_UPSTREAM_DOWN');
        },
      });

      const r = await updateWorkspaceBizProfileAction({
        bizProfile: { bizNo: '3456789012', taxType: 'simple', status: 'active' },
      });

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toBe('BIZ_LOOKUP_UNAVAILABLE');
    });

    // grade 만 바꾸는 요청은 사업자번호를 건드리지 않으므로 조회가 필요 없다.
    it('grade 만 갱신할 때는 국세청을 조회하지 않는다', async () => {
      await asBuyerAdmin();
      const lookup = vi.fn(async () => {
        throw new NtsError('NTS_UPSTREAM_DOWN');
      });
      __setNtsClientForTest({ lookup });

      const r = await updateWorkspaceBizProfileAction({ grade: 'sole' });

      expect(r.ok).toBe(true);
      expect(lookup).not.toHaveBeenCalled();
    });
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
