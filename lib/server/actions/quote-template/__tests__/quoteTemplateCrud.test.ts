import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupRfpActionEnv, teardownRfpActionEnv } from '../../rfp/__tests__/_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

type SessionUser = {
  id: string;
  email: string;
  workspaceId: string;
  workspaceType: 'buyer' | 'pg';
  role: 'admin' | 'member';
};
const sessionRef: { value: { user: SessionUser } | null } = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
  requireBuyerSession: () =>
    sessionRef.value?.user.workspaceType === 'buyer'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_BUYER')),
  requirePgSession: () =>
    sessionRef.value?.user.workspaceType === 'pg'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_PG')),
}));

import { saveQuoteTemplateAction } from '../saveQuoteTemplateAction';
import { listQuoteTemplatesAction } from '../listQuoteTemplatesAction';
import { deleteQuoteTemplateAction } from '../deleteQuoteTemplateAction';
import { duplicateQuoteTemplateAction } from '../duplicateQuoteTemplateAction';
import { getBidQuoteTemplateRepo } from '@/lib/server/repositories/factory';

let db: PgliteDB;

const VALID = {
  name: '표준 요율',
  settleCycle: 'M+1',
  settleLimit: 5_000_000,
  guaranteeInsurance: 500_000,
  signupFee: 200_000,
  paymentFees: { card: 0.0125, virtual_account: 300 },
} as const;

async function setupPg(name = 'toss.im') {
  const user = await seedUser(db, { email: 'p@pg.com' });
  const ws = await seedPgWorkspace(db, name);
  await seedMembership(db, ws.id, user.id, 'admin');
  sessionRef.value = {
    user: {
      id: user.id,
      email: user.email,
      workspaceId: ws.id,
      workspaceType: 'pg',
      role: 'admin',
    },
  };
  return { user, ws };
}

describe('폐지된 견적 템플릿 액션', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('기존 데이터가 있어도 모든 액션은 DB 접근 없이 폐지 오류를 반환한다', async () => {
    const { user, ws } = await setupPg();
    const repo = await getBidQuoteTemplateRepo();
    const templateId = crypto.randomUUID();
    await repo.create({ ...VALID, id: templateId, pgWsId: ws.id, createdBy: user.id });
    const before = await repo.listByWorkspace(ws.id);
    // 영속 어댑터 경계: 조회를 포함해 SQL을 전혀 실행하지 않아야 한다.
    const query = vi.spyOn(db.$client, 'query');
    const results = [
      await listQuoteTemplatesAction(),
      await saveQuoteTemplateAction(VALID),
      await saveQuoteTemplateAction({ ...VALID, id: templateId, name: '변경' }),
      await duplicateQuoteTemplateAction({ templateId }),
      await deleteQuoteTemplateAction({ templateId }),
    ];
    expect(results).toEqual(Array(5).fill({ ok: false, error: 'QUOTE_TEMPLATE_FEATURE_REMOVED' }));
    expect(query).not.toHaveBeenCalled();
    query.mockRestore();
    expect(await repo.listByWorkspace(ws.id)).toEqual(before);
  });

  it('미인증 요청과 유효하지 않은 입력도 즉시 폐지 오류를 반환한다', async () => {
    const results = [
      await listQuoteTemplatesAction(),
      await saveQuoteTemplateAction({ ...VALID, name: '', settleLimit: -1 }),
      await duplicateQuoteTemplateAction({ templateId: '' }),
      await deleteQuoteTemplateAction({ templateId: '' }),
    ];
    expect(results).toEqual(Array(4).fill({ ok: false, error: 'QUOTE_TEMPLATE_FEATURE_REMOVED' }));
  });
});
