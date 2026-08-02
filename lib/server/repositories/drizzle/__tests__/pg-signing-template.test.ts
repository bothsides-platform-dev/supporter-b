import { describe, expect, it } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzlePgSigningTemplateRepository } from '../pg-signing-template';
import { seedPgWorkspace, seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  return { db, repo: new DrizzlePgSigningTemplateRepository(db) };
}

describe('DrizzlePgSigningTemplateRepository', () => {
  it('create() + findById() round-trips a template', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tpl1');
    const user = await seedUser(db);

    await repo.create({
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      workspaceId: ws.id,
      snowsignTemplateId: 'sst-1',
      name: '표준 계약서',
      createdBy: user.id,
    });

    const found = await repo.findById('aaaaaaaa-0000-4000-8000-000000000001');
    expect(found?.workspaceId).toBe(ws.id);
    expect(found?.snowsignTemplateId).toBe('sst-1');
    expect(found?.name).toBe('표준 계약서');
    expect(found?.createdBy).toBe(user.id);
  });

  it('findById() returns undefined for a missing id', async () => {
    const { repo } = await setup();
    const found = await repo.findById('aaaaaaaa-0000-4000-8000-000000000099');
    expect(found).toBeUndefined();
  });

  it('listByWorkspace() returns only that workspace templates, oldest first', async () => {
    const { db, repo } = await setup();
    const wsA = await seedPgWorkspace(db, 'signing.tplA');
    const wsB = await seedPgWorkspace(db, 'signing.tplB');
    const user = await seedUser(db);

    await repo.create({ workspaceId: wsA.id, snowsignTemplateId: 'a1', name: '첫번째', createdBy: user.id });
    await repo.create({ workspaceId: wsA.id, snowsignTemplateId: 'a2', name: '두번째', createdBy: user.id });
    await repo.create({ workspaceId: wsB.id, snowsignTemplateId: 'b1', name: '다른워크스페이스', createdBy: user.id });

    const rows = await repo.listByWorkspace(wsA.id);
    expect(rows.map((r) => r.name)).toEqual(['첫번째', '두번째']);
  });

  it('updateName() renames a template', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplRename');
    const user = await seedUser(db);
    await repo.create({ id: 'aaaaaaaa-0000-4000-8000-000000000002', workspaceId: ws.id, snowsignTemplateId: 's', name: '원래이름', createdBy: user.id });

    await repo.updateName('aaaaaaaa-0000-4000-8000-000000000002', '새이름');

    const found = await repo.findById('aaaaaaaa-0000-4000-8000-000000000002');
    expect(found?.name).toBe('새이름');
  });

  it('remove() hard-deletes a template', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplRemove');
    const user = await seedUser(db);
    await repo.create({ id: 'aaaaaaaa-0000-4000-8000-000000000003', workspaceId: ws.id, snowsignTemplateId: 's', name: '지울것', createdBy: user.id });

    await repo.remove('aaaaaaaa-0000-4000-8000-000000000003');

    expect(await repo.findById('aaaaaaaa-0000-4000-8000-000000000003')).toBeUndefined();
  });
});
