// DrizzleContractTemplateRepository — PG 계약서 템플릿 CRUD + ready 첨부 조인.
// 템플릿 자체는 파일을 소유하지 않는다 — attachments.contract_template_id
// (exclusive-arc 6번째 컬럼)의 status='ready' 행을 findById/listByWorkspace 가
// {id,name,size} 로 hydrate 한다(없으면 null — 발송 불가 상태를 나타냄).

import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { attachments, contractTemplates } from '@/lib/db/schema';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleContractTemplateRepository } from '../contract-template';
import { seedPgWorkspace, seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const user = await seedUser(db, { email: 'pg-admin@x.com' });
  const ws = await seedPgWorkspace(db, 'PG사');
  const repo = new DrizzleContractTemplateRepository(db);
  return { db, user, ws, repo };
}

describe('DrizzleContractTemplateRepository', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('create 후 findById 로 조회된다 — 첨부 없으면 attachment는 null', async () => {
    const id = randomUUID();
    await ctx.repo.create({
      id,
      pgWsId: ctx.ws.id,
      name: '표준 계약서',
      description: '기본 템플릿',
      createdBy: ctx.user.id,
    });

    const row = await ctx.repo.findById(id);

    expect(row).toBeDefined();
    expect(row!.name).toBe('표준 계약서');
    expect(row!.description).toBe('기본 템플릿');
    expect(row!.pgWsId).toBe(ctx.ws.id);
    expect(row!.attachment).toBeNull();
  });

  it('findById 는 없는 id 에 undefined 를 반환한다', async () => {
    expect(await ctx.repo.findById(randomUUID())).toBeUndefined();
  });

  it('ready 첨부가 연결돼 있으면 findById 가 attachment {id,name,size} 를 반환한다', async () => {
    const id = randomUUID();
    await ctx.repo.create({
      id,
      pgWsId: ctx.ws.id,
      name: '표준 계약서',
      description: '',
      createdBy: ctx.user.id,
    });
    const attId = randomUUID();
    await ctx.db.insert(attachments).values({
      id: attId,
      name: 'template.pdf',
      size: 4096,
      mimeType: 'application/pdf',
      uploadedBy: ctx.user.id,
      contractTemplateId: id,
      status: 'ready',
    });

    const row = await ctx.repo.findById(id);

    expect(row!.attachment).toEqual({ id: attId, name: 'template.pdf', size: 4096 });
  });

  it('pending 첨부는 attachment 로 노출되지 않는다 (fail-closed)', async () => {
    const id = randomUUID();
    await ctx.repo.create({
      id,
      pgWsId: ctx.ws.id,
      name: '표준 계약서',
      description: '',
      createdBy: ctx.user.id,
    });
    await ctx.db.insert(attachments).values({
      id: randomUUID(),
      name: 'pending.pdf',
      size: 100,
      mimeType: 'application/pdf',
      uploadedBy: ctx.user.id,
      contractTemplateId: id,
      status: 'pending',
    });

    const row = await ctx.repo.findById(id);
    expect(row!.attachment).toBeNull();
  });

  it('listByWorkspace 는 워크스페이스별로 격리되고 createdAt desc 로 정렬된다', async () => {
    const otherWs = await seedPgWorkspace(ctx.db, '다른 PG사');
    const first = randomUUID();
    await ctx.repo.create({
      id: first,
      pgWsId: ctx.ws.id,
      name: 'A',
      description: '',
      createdBy: ctx.user.id,
    });
    const second = randomUUID();
    await ctx.repo.create({
      id: second,
      pgWsId: ctx.ws.id,
      name: 'B',
      description: '',
      createdBy: ctx.user.id,
    });
    await ctx.repo.create({
      id: randomUUID(),
      pgWsId: otherWs.id,
      name: 'C (다른 워크스페이스)',
      description: '',
      createdBy: ctx.user.id,
    });
    // 정렬 결정성 확보 — 두 호출이 같은 tick의 now() 를 받을 수 있어 명시적으로 벌린다.
    await ctx.db
      .update(contractTemplates)
      .set({ createdAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(contractTemplates.id, first));
    await ctx.db
      .update(contractTemplates)
      .set({ createdAt: new Date('2026-01-02T00:00:00Z') })
      .where(eq(contractTemplates.id, second));

    const rows = await ctx.repo.listByWorkspace(ctx.ws.id);

    expect(rows.map((r) => r.id)).toEqual([second, first]);
  });

  it('countByWorkspace 는 워크스페이스별 템플릿 수를 반환한다', async () => {
    await ctx.repo.create({
      id: randomUUID(),
      pgWsId: ctx.ws.id,
      name: 'A',
      description: '',
      createdBy: ctx.user.id,
    });
    await ctx.repo.create({
      id: randomUUID(),
      pgWsId: ctx.ws.id,
      name: 'B',
      description: '',
      createdBy: ctx.user.id,
    });

    expect(await ctx.repo.countByWorkspace(ctx.ws.id)).toBe(2);
  });

  it('countByWorkspace 는 템플릿이 없으면 0을 반환한다', async () => {
    expect(await ctx.repo.countByWorkspace(ctx.ws.id)).toBe(0);
  });

  it('delete 는 해당 템플릿을 제거한다', async () => {
    const id = randomUUID();
    await ctx.repo.create({
      id,
      pgWsId: ctx.ws.id,
      name: 'A',
      description: '',
      createdBy: ctx.user.id,
    });

    await ctx.repo.delete(id);

    expect(await ctx.repo.findById(id)).toBeUndefined();
  });
});
