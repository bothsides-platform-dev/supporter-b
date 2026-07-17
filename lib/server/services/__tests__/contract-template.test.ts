// ContractTemplateService — 전자계약 템플릿(계약서 PDF) CRUD 서비스.
// PGlite 실 DB + InMemoryStorage + 실 validateTemplatePdf 로 검증한다
// (QuoteTemplateService 는 순수 fake repo 였지만, 이 서비스는 storage 바이트
// 읽기 + PDF 검증 + attachment claim + audit 를 함께 하므로 rfp.test.ts 의
// PGlite 전례를 따른다).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getAttachmentRepo,
  getAuditLogRepo,
  getContractTemplateRepo,
} from '@/lib/server/repositories/factory';
import {
  __resetStorageForTest,
  __setStorageForTest,
} from '@/lib/server/storage';
import { InMemoryStorage } from '@/lib/server/storage/memory';
import {
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { makeKoreanTemplate } from '@/lib/server/contracts/__tests__/_fixtures';
import { attachments, auditLogs, contractTemplates } from '@/lib/db/schema';
import {
  ContractTemplateService,
  __resetContractTemplateServiceForTest,
  __setContractTemplateServiceForTest,
  getContractTemplateService,
} from '../contract-template';
import type { PgliteDB } from '@/lib/db/client-pglite';
import type { Actor } from '../types';

let db: PgliteDB;
let storage: InMemoryStorage;
let svc: ContractTemplateService;

async function buildService(): Promise<ContractTemplateService> {
  const [templateRepo, attRepo, auditRepo] = await Promise.all([
    getContractTemplateRepo(),
    getAttachmentRepo(),
    getAuditLogRepo(),
  ]);
  return new ContractTemplateService(db, templateRepo, attRepo, auditRepo);
}

type Env = {
  pgWs: { id: string };
  pgUser: { id: string };
  actor: Actor;
};

async function seedEnv(): Promise<Env> {
  const pgWs = await seedPgWorkspace(db, 'PG사');
  const pgUser = await seedUser(db, { email: 'pg@x.com', name: 'PG담당' });
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');
  return { pgWs, pgUser, actor: { userId: pgUser.id, workspaceId: pgWs.id } };
}

// ready 첨부 1건을 storage + attachments 에 심는다. bytes 미지정 시 실제 PDF.
async function seedAttachment(opts: {
  bytes: Buffer;
  uploadedBy: string;
}): Promise<string> {
  const attRepo = await getAttachmentRepo();
  const id = randomUUID();
  await storage.save(id, opts.bytes, 'application/pdf');
  await attRepo.save({
    id,
    name: 'template.pdf',
    size: opts.bytes.length,
    mimeType: 'application/pdf',
    url: `/api/files/${id}`,
    uploadedBy: opts.uploadedBy,
    status: 'ready',
  });
  return id;
}

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  storage = new InMemoryStorage();
  __setStorageForTest(storage);
  svc = await buildService();
});

afterEach(() => {
  __resetForTest();
  __resetStorageForTest();
});

describe('ContractTemplateService.save', () => {
  it('creates a template row, claims the attachment, writes an audit log', async () => {
    const { pgWs, pgUser, actor } = await seedEnv();
    const attId = await seedAttachment({
      bytes: await makeKoreanTemplate(1),
      uploadedBy: pgUser.id,
    });

    const r = await svc.save({ name: '표준 계약서', attachmentId: attId }, actor);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const rows = await db
      .select()
      .from(contractTemplates)
      .where(eq(contractTemplates.pgWsId, pgWs.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(r.templateId);
    expect(rows[0].name).toBe('표준 계약서');
    expect(rows[0].createdBy).toBe(pgUser.id);

    // attachment claimed to this template.
    const [attRow] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attId));
    expect(attRow.contractTemplateId).toBe(r.templateId);

    // audit row.
    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'contract_template.save'));
    expect(audits).toHaveLength(1);
    expect(audits[0].entityId).toBe(r.templateId);
    expect(audits[0].actorUserId).toBe(pgUser.id);
  });

  it('caps a workspace at MAX_CONTRACT_TEMPLATES (20) → LIMIT_REACHED', async () => {
    const { pgWs, pgUser, actor } = await seedEnv();
    const templateRepo = await getContractTemplateRepo();
    for (let i = 0; i < 20; i++) {
      await templateRepo.create({
        id: randomUUID(),
        pgWsId: pgWs.id,
        name: `t-${i}`,
        description: '',
        createdBy: pgUser.id,
      });
    }
    const attId = await seedAttachment({
      bytes: await makeKoreanTemplate(1),
      uploadedBy: pgUser.id,
    });
    const r = await svc.save({ name: 't-20', attachmentId: attId }, actor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('LIMIT_REACHED');
  });

  it('rejects an attachment uploaded by another user → INVALID_ATTACHMENT', async () => {
    const { actor } = await seedEnv();
    const stranger = await seedUser(db, { email: 'stranger@y.com' });
    const attId = await seedAttachment({
      bytes: await makeKoreanTemplate(1),
      uploadedBy: stranger.id,
    });
    const r = await svc.save({ name: '남의 첨부', attachmentId: attId }, actor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_ATTACHMENT');
    // no row created.
    const rows = await db.select().from(contractTemplates);
    expect(rows).toHaveLength(0);
  });

  it('rejects a non-PDF attachment → TEMPLATE_PDF_INVALID, no row created', async () => {
    const { pgUser, actor } = await seedEnv();
    const attId = await seedAttachment({
      bytes: Buffer.from('this is definitely not a pdf'),
      uploadedBy: pgUser.id,
    });
    const r = await svc.save({ name: '가짜 PDF', attachmentId: attId }, actor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TEMPLATE_PDF_INVALID');
    const rows = await db.select().from(contractTemplates);
    expect(rows).toHaveLength(0);
  });

  it('rejects a missing attachment → INVALID_ATTACHMENT', async () => {
    const { actor } = await seedEnv();
    const r = await svc.save({ name: '없는 첨부', attachmentId: randomUUID() }, actor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_ATTACHMENT');
  });
});

describe('ContractTemplateService.remove', () => {
  it('deletes an owned template + writes an audit log', async () => {
    const { pgWs, pgUser, actor } = await seedEnv();
    const templateRepo = await getContractTemplateRepo();
    const templateId = randomUUID();
    await templateRepo.create({
      id: templateId,
      pgWsId: pgWs.id,
      name: 'mine',
      description: '',
      createdBy: pgUser.id,
    });

    const r = await svc.remove(templateId, actor);
    expect(r.ok).toBe(true);
    expect(await templateRepo.findById(templateId)).toBeUndefined();

    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'contract_template.delete'));
    expect(audits).toHaveLength(1);
    expect(audits[0].entityId).toBe(templateId);
  });

  it("rejects removing another workspace's template → FORBIDDEN", async () => {
    const { actor } = await seedEnv();
    const otherWs = await seedPgWorkspace(db, '다른PG');
    const otherUser = await seedUser(db, { email: 'other@z.com' });
    const templateRepo = await getContractTemplateRepo();
    const templateId = randomUUID();
    await templateRepo.create({
      id: templateId,
      pgWsId: otherWs.id,
      name: 'theirs',
      description: '',
      createdBy: otherUser.id,
    });

    const r = await svc.remove(templateId, actor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN');
    // still there.
    expect(await templateRepo.findById(templateId)).toBeDefined();
  });

  it('returns TEMPLATE_NOT_FOUND for a non-existent template', async () => {
    const { actor } = await seedEnv();
    const r = await svc.remove(randomUUID(), actor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TEMPLATE_NOT_FOUND');
  });
});

describe('ContractTemplateService factory singleton', () => {
  afterEach(() => {
    __resetContractTemplateServiceForTest();
  });

  it('getContractTemplateService returns the injected instance', async () => {
    const injected = await buildService();
    __setContractTemplateServiceForTest(injected);
    expect(await getContractTemplateService()).toBe(injected);
  });

  it('__reset clears the cached instance', async () => {
    const injected = await buildService();
    __setContractTemplateServiceForTest(injected);
    __resetContractTemplateServiceForTest();
    // A fresh resolve builds a new instance (repos come from the pglite bundle).
    expect(await getContractTemplateService()).not.toBe(injected);
  });
});
