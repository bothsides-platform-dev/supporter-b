import { describe, expect, it, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SigningTemplateService } from '../signing-template';
import type { PgSigningTemplateRepo } from '@/lib/server/repositories/types';
import { SnowSignError, type SnowSignClient } from '@/lib/server/signing/snowsign-client';
import type { PgSigningTemplate } from '@/lib/types/signing';
import { __resetUploadBudgetForTest } from '@/lib/server/signing/upload-session-budget';

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
  // 업로드 슬롯 회계는 모듈 수준 상태다(운영은 PM2 단일 fork) — 테스트 간 누수를 막는다.
  __resetUploadBudgetForTest();
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

    // 반환 계약: 원시 uploadId 자리에 서명 토큰이 온다.
    //
    // 여기서 "페이로드에 upl_1 문자열이 없다"를 단언하지 **않는다** — 그건 fake 가
    // `fields: {}` 를 주기 때문에만 참이고, 실제 presigned POST 의 `fields.key` 에는
    // 업로드 id 가 들어간다(공급자가 정한다). 불변식은 은닉이 아니라 위조 불가이며,
    // 그건 아래 '다른 워크스페이스는 거부한다' 테스트가 지킨다.
    expect(result.ok).toBe(true);
    expect(result.ok && result.uploadUrl).toBe('https://example.com/upload');
    expect(result.ok && typeof result.uploadToken).toBe('string');
    expect(result.ok && result.uploadToken).not.toBe('upl_1');
    expect(snowsign.createUploadSession).toHaveBeenCalledWith({
      purpose: 'template_document',
      filename: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 100,
    });
  });

  // 업로드 세션은 API 키(조직) 공유 자원이다 — 한 PG 가 다 먹으면 모든 PG 가 막힌다.
  // 거절은 반드시 **공급자 호출 앞에서** 나야 한다: 뒤에서 429 를 받으면 그 시점엔
  // 이미 남의 세션을 밀어낸 뒤다(해제 API 가 없어 되돌릴 수도 없다).
  it('createUploadSession() refuses once the org-wide slots are taken, without calling the provider', async () => {
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(fakeRepo(), snowsign);
    const big = { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 50 * 1024 * 1024 };

    // 서로 다른 워크스페이스가 조직 한도(3개)를 채운다.
    for (const ws of ['wsA', 'wsB', 'wsC']) {
      const r = await service.createUploadSession({ userId: 'u', workspaceId: ws }, big);
      expect(r.ok).toBe(true);
    }
    const callsBefore = (snowsign.createUploadSession as ReturnType<typeof vi.fn>).mock.calls.length;

    const blocked = await service.createUploadSession({ userId: 'u', workspaceId: 'wsD' }, big);

    expect(blocked).toEqual({ ok: false, error: 'UPLOAD_SLOTS_BUSY' });
    expect((snowsign.createUploadSession as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callsBefore,
    );
  });

  // 실패한 업로드가 **본인을** 가두면 안 된다(발송 리스 30분 고정 시절의 자기-잠김).
  it('createUploadSession() lets the same workspace retry after a provider failure', async () => {
    const failing = fakeSnowSign({
      createUploadSession: vi.fn(async () => {
        throw new SnowSignError('SNOWSIGN_NETWORK', 'boom');
      }),
    });
    const service = new SigningTemplateService(fakeRepo(), failing);
    const big = { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 50 * 1024 * 1024 };

    for (let i = 0; i < 4; i += 1) {
      const r = await service.createUploadSession(actor, big);
      // 매번 공급자까지 도달해야 한다 — 자기 예약에 막혀 UPLOAD_SLOTS_BUSY 가 되면 안 된다.
      expect(r).toEqual({ ok: false, error: 'SNOWSIGN_NETWORK' });
    }
    expect(failing.createUploadSession).toHaveBeenCalledTimes(4);
  });

  // 시크릿이 없으면 토큰을 서명할 수 없다 — 그런데 그 판정을 SnowSign 호출 **뒤에**
  // 하면 이미 만들어진 업로드 세션이 버려진다. 세션은 조직(API 키) 공유 동시 3개
  // 한도에 10분 TTL·해제 API 부재라, 설정 오류 3번이면 모든 PG 의 업로드가 막힌다.
  // 게다가 실패가 SNOWSIGN_ERROR 로 나가면 운영자가 env 대신 공급자를 쫓는다.
  it('createUploadSession() fails before touching SnowSign when AUTH_SECRET is missing', async () => {
    delete process.env.AUTH_SECRET;
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(fakeRepo(), snowsign);

    const result = await service.createUploadSession(actor, {
      filename: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 100,
    });

    expect(result).toEqual({ ok: false, error: 'SIGNING_MISCONFIGURED' });
    expect(snowsign.createUploadSession).not.toHaveBeenCalled();
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
