import { describe, expect, it, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SigningTemplateService } from '../signing-template';
import type { PgSigningTemplateRepo } from '@/lib/server/repositories/types';
import type { SnowSignClient } from '@/lib/server/signing/snowsign-client';
import type { PgSigningTemplate } from '@/lib/types/signing';

function fakeRepo(seed: PgSigningTemplate[] = []): PgSigningTemplateRepo {
  const rows = [...seed];
  return {
    create: vi.fn(async (t) => {
      rows.push({
        id: t.id ?? randomUUID(),
        workspaceId: t.workspaceId,
        snowsignTemplateId: t.snowsignTemplateId,
        name: t.name,
        createdBy: t.createdBy,
        createdAt: new Date().toISOString(),
      });
    }),
    findById: vi.fn(async (id) => rows.find((r) => r.id === id)),
    listByWorkspace: vi.fn(async (wsId) => rows.filter((r) => r.workspaceId === wsId)),
    updateName: vi.fn(async (id, name) => {
      const row = rows.find((r) => r.id === id);
      if (row) row.name = name;
    }),
    remove: vi.fn(async (id) => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx >= 0) rows.splice(idx, 1);
    }),
  };
}

function fakeSnowSign(overrides: Partial<SnowSignClient> = {}): SnowSignClient {
  return {
    createEmbedSession: vi.fn(),
    listContracts: vi.fn(),
    getContract: vi.fn(),
    getStatus: vi.fn(),
    downloadUrl: vi.fn(),
    auditCertificateUrl: vi.fn(),
    remind: vi.fn(),
    cancel: vi.fn(),
    createUploadSession: vi.fn(async () => ({
      uploadId: 'upl_1',
      uploadUrl: 'https://example.com/upload',
      fields: {},
      maxSizeBytes: 52428800,
    })),
    createTemplate: vi.fn(async () => ({ templateId: 'sst_1' })),
    createContractFromTemplate: vi.fn(),
    sendContract: vi.fn(),
    ...overrides,
  };
}

const actor = { userId: 'u1', workspaceId: 'ws1' };

// 토큰은 서명값이라 손으로 만들 수 없다 — 발급 경로를 그대로 태워 얻는다.
async function issueToken(service: SigningTemplateService): Promise<string> {
  const r = await service.createUploadSession(actor, {
    filename: 'a.pdf',
    contentType: 'application/pdf',
    sizeBytes: 100,
  });
  if (!r.ok) throw new Error('업로드 세션 발급 실패');
  return r.uploadToken;
}

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret-for-signing-template';
});
const signableField = {
  id: 'f1',
  type: 'signature' as const,
  party: 'buyer' as const,
  pageNumber: 1,
  x: 0,
  y: 0,
  width: 100,
  height: 40,
};
const pgSignableField = { ...signableField, id: 'f2', party: 'pg' as const };

describe('SigningTemplateService', () => {
  it('createUploadSession() delegates to SnowSignClient with purpose=template_document', async () => {
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(fakeRepo(), snowsign);

    const result = await service.createUploadSession(actor, {
      filename: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 100,
    });

    // 원시 uploadId 는 더 이상 클라이언트로 나가지 않는다 — 워크스페이스에 서명
    // 바인딩된 불투명 토큰만 나간다(조직 공유 업로드 세션의 크로스-테넌트 클레임 차단).
    expect(result.ok).toBe(true);
    expect(result.ok && result.uploadUrl).toBe('https://example.com/upload');
    expect(result.ok && result.fields).toEqual({});
    expect(result.ok && typeof result.uploadToken).toBe('string');
    expect(JSON.stringify(result)).not.toContain('upl_1');
    expect(snowsign.createUploadSession).toHaveBeenCalledWith({
      purpose: 'template_document',
      filename: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 100,
    });
  });

  // 업로드 세션은 워크스페이스가 아니라 **API 키(조직 전체)** 단위라, 다른 PG 의
  // 진행 중 `upl_…` 을 알아낸 워크스페이스가 그 PDF 로 자기 템플릿을 만들 수 있었다.
  // 세션 발급 때 서명해 둔 소유를 생성 시점에 대조해 그 경로를 닫는다.
  it('createTemplate() rejects an upload token minted for another workspace', async () => {
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(fakeRepo(), snowsign);

    const issued = await service.createUploadSession(
      { userId: 'other', workspaceId: 'ws-OTHER' },
      { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 100 },
    );
    expect(issued.ok).toBe(true);

    const result = await service.createTemplate(actor, {
      name: '남의 PDF',
      uploadToken: issued.ok ? issued.uploadToken : '',
      fields: [signableField, pgSignableField],
    });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(snowsign.createTemplate).not.toHaveBeenCalled();
  });

  it('createTemplate() rejects when fields fail validation, without calling SnowSign', async () => {
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(fakeRepo(), snowsign);

    const result = await service.createTemplate(actor, {
      name: '표준',
      uploadToken: await issueToken(service),
      fields: [signableField], // pg 쪽 서명 필드 없음
    });

    expect(result).toEqual({ ok: false, error: 'MISSING_SIGNABLE_FIELD' });
    expect(snowsign.createTemplate).not.toHaveBeenCalled();
  });

  it('createTemplate() calls SnowSign with fixed signers and persists the link row', async () => {
    const repo = fakeRepo();
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(repo, snowsign);

    const result = await service.createTemplate(actor, {
      name: '표준 계약서',
      uploadToken: await issueToken(service),
      fields: [signableField, pgSignableField],
    });

    expect(result.ok).toBe(true);
    expect(snowsign.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ name: '표준 계약서', documentUploadId: 'upl_1', signers: ['구매사', 'PG사'] }),
    );
    const listed = await service.list(actor);
    expect(listed.ok && listed.templates.map((t) => t.name)).toEqual(['표준 계약서']);
  });

  it('rename() returns TEMPLATE_NOT_FOUND for a missing id', async () => {
    const service = new SigningTemplateService(fakeRepo(), fakeSnowSign());
    const result = await service.rename(actor, 'missing', 'x');
    expect(result).toEqual({ ok: false, error: 'TEMPLATE_NOT_FOUND' });
  });

  it('rename() returns FORBIDDEN for another workspace template', async () => {
    const repo = fakeRepo([
      { id: 't1', workspaceId: 'other-ws', snowsignTemplateId: 's', name: '남의것', createdBy: 'u9', createdAt: new Date().toISOString() },
    ]);
    const service = new SigningTemplateService(repo, fakeSnowSign());
    const result = await service.rename(actor, 't1', '새이름');
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('remove() deletes an owned template', async () => {
    const repo = fakeRepo([
      { id: 't1', workspaceId: actor.workspaceId, snowsignTemplateId: 's', name: '내것', createdBy: actor.userId, createdAt: new Date().toISOString() },
    ]);
    const service = new SigningTemplateService(repo, fakeSnowSign());
    const result = await service.remove(actor, 't1');
    expect(result).toEqual({ ok: true });
    expect(repo.remove).toHaveBeenCalledWith('t1');
  });
});
