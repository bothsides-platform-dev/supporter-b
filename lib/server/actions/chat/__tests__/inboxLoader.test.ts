// inboxLoader — RFP metadata enrichment tests for listConversationsForViewer.
//
// Tests that ConversationListItem includes rfpCode/rfpTitle/rfpStatus/rfpDeadline
// derived from the last message's rfpId.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedRfp,
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

import { sendChatMessageAction } from '../sendChatMessageAction';
import { listConversationsForViewer } from '../conversationLoaders';

let db: PgliteDB;

describe('listConversationsForViewer — RFP enrichment', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('counterparty 항목에 마지막 메시지의 RFP code/title/status/deadline을 포함한다', async () => {
    const buyerUser = await seedUser(db, { email: 'buyer2@b.com', name: '구매' });
    const buyerWs = await seedBuyerWorkspace(db);
    await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
    const pgWs = await seedPgWorkspace(db, 'PG사');
    const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyerUser.id });

    sessionRef.value = {
      user: { id: buyerUser.id, email: buyerUser.email, workspaceId: buyerWs.id, workspaceType: 'buyer', role: 'admin' },
    };

    await sendChatMessageAction({ counterpartyWorkspaceId: pgWs.id, body: '안녕', rfpId: rfp.id });

    const items = await listConversationsForViewer();
    const counterpartyItem = items.find((i) => i.counterparty.type === 'pg');
    expect(counterpartyItem).toBeDefined();
    expect(counterpartyItem!.rfpCode).toBeTruthy();
    expect(counterpartyItem!.rfpTitle).toBeTruthy();
    expect(counterpartyItem!.rfpStatus).toBeTruthy();
    expect(counterpartyItem!.rfpDeadline).toBeTruthy();
  });

  it('마지막 메시지에 rfpId가 없으면 rfpCode 등이 null이다', async () => {
    const buyerUser = await seedUser(db, { email: 'buyer3@b.com', name: '구매2' });
    const buyerWs = await seedBuyerWorkspace(db);
    await seedMembership(db, buyerWs.id, buyerUser.id, 'admin');
    const pgWs = await seedPgWorkspace(db, 'PG사2');

    sessionRef.value = {
      user: { id: buyerUser.id, email: buyerUser.email, workspaceId: buyerWs.id, workspaceType: 'buyer', role: 'admin' },
    };

    await sendChatMessageAction({ counterpartyWorkspaceId: pgWs.id, body: '안녕', rfpId: undefined });

    const items = await listConversationsForViewer();
    const counterpartyItem = items.find((i) => i.counterparty.type === 'pg');
    expect(counterpartyItem).toBeDefined();
    expect(counterpartyItem!.rfpCode).toBeNull();
    expect(counterpartyItem!.rfpTitle).toBeNull();
  });
});
