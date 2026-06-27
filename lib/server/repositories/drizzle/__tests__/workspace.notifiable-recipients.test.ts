import { describe, expect, it, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleWorkspaceRepository } from '../workspace';
import { seedBuyerWorkspace, seedMembership, seedUser } from './_seed';

/**
 * 인앱 알림/이메일 수신자 해소는 "실제로 로그인해 알림을 읽을 수 있는 계정"을
 * 대상으로 한다. 화면(roster/profile)에선 숨겨지지만 실제 사람인 master/ops 계정
 * (isSystemAccount=true, 실 해시)은 **포함**하고, 영구 로그인 불가 데모 placeholder
 * (passwordHash '!')만 **제외**한다. (표시용 surface 는 isSystemAccount 로 계속 숨김.)
 */
describe('DrizzleWorkspaceRepository — 알림 수신자는 master 계정 포함, 데모 placeholder 만 제외', () => {
  let repo: DrizzleWorkspaceRepository;
  let db: Awaited<ReturnType<typeof createPgliteDb>>;

  beforeEach(async () => {
    db = await createPgliteDb();
    repo = new DrizzleWorkspaceRepository(db);
  });

  it('memberUserIds: 숨겨진 master(isSystemAccount) 포함, 데모 placeholder(!) 제외', async () => {
    const ws = await seedBuyerWorkspace(db);
    const real = await seedUser(db, { name: '일반' });
    const master = await seedUser(db, { name: '운영자', isSystemAccount: true });
    const demo = await seedUser(db, { name: '데모', isSystemAccount: true, passwordHash: '!' });
    await seedMembership(db, ws.id, real.id, 'admin');
    await seedMembership(db, ws.id, master.id, 'member');
    await seedMembership(db, ws.id, demo.id, 'member');

    const ids = await repo.memberUserIds(ws.id);

    expect(ids).toContain(real.id);
    expect(ids).toContain(master.id);
    expect(ids).not.toContain(demo.id);
  });

  it('memberUserIdsBatch: master 포함, 데모 placeholder 제외', async () => {
    const ws = await seedBuyerWorkspace(db);
    const master = await seedUser(db, { name: '운영자', isSystemAccount: true });
    const demo = await seedUser(db, { name: '데모', isSystemAccount: true, passwordHash: '!' });
    await seedMembership(db, ws.id, master.id, 'admin');
    await seedMembership(db, ws.id, demo.id, 'member');

    const map = await repo.memberUserIdsBatch([ws.id]);

    expect(map.get(ws.id)).toContain(master.id);
    expect(map.get(ws.id)).not.toContain(demo.id);
  });

  it('memberRecipients: master 포함, 데모 placeholder 제외', async () => {
    const ws = await seedBuyerWorkspace(db);
    const master = await seedUser(db, { name: '운영자', email: 'ops@real.com', isSystemAccount: true });
    const demo = await seedUser(db, {
      name: '데모',
      email: 'demo@sample.invalid',
      isSystemAccount: true,
      passwordHash: '!',
    });
    await seedMembership(db, ws.id, master.id, 'admin');
    await seedMembership(db, ws.id, demo.id, 'member');

    const recipients = await repo.memberRecipients(ws.id);
    const userIds = recipients.map((r) => r.userId);

    expect(userIds).toContain(master.id);
    expect(userIds).not.toContain(demo.id);
  });

  it('memberRecipientsBatch: master 포함, 데모 placeholder 제외', async () => {
    const ws = await seedBuyerWorkspace(db);
    const master = await seedUser(db, { name: '운영자', email: 'ops2@real.com', isSystemAccount: true });
    const demo = await seedUser(db, {
      name: '데모',
      email: 'demo2@sample.invalid',
      isSystemAccount: true,
      passwordHash: '!',
    });
    await seedMembership(db, ws.id, master.id, 'admin');
    await seedMembership(db, ws.id, demo.id, 'member');

    const rows = await repo.memberRecipientsBatch([ws.id]);
    const userIds = rows.map((r) => r.userId);

    expect(userIds).toContain(master.id);
    expect(userIds).not.toContain(demo.id);
  });
});
