import { describe, expect, it, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SigningTemplateService } from '../signing-template';
import type { PgSigningTemplateRepo } from '@/lib/server/repositories/types';
import { SnowSignError, type SnowSignClient } from '@/lib/server/signing/snowsign-client';
import type { PgSigningTemplate } from '@/lib/types/signing';
import { __resetUploadBudgetForTest } from '@/lib/server/signing/upload-session-budget';
import { SIGNING_DEADLINE_DAYS } from '@/lib/signing/deadline';

function fakeRepo(seed: PgSigningTemplate[] = []): PgSigningTemplateRepo {
  const rows = [...seed];
  return {
    create: vi.fn(async (t) => {
      rows.push({
        id: t.id ?? randomUUID(),
        workspaceId: t.workspaceId,
        kind: 'pdf',
        snowsignTemplateId: t.snowsignTemplateId,
        name: t.name,
        createdBy: t.createdBy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }),
    createComposed: vi.fn(async (t) => {
      rows.push({
        id: t.id ?? randomUUID(),
        workspaceId: t.workspaceId,
        kind: 'composed',
        document: t.document,
        name: t.name,
        createdBy: t.createdBy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }),
    updateComposedDocument: vi.fn(async (id, name, document) => {
      const row = rows.find((r) => r.id === id && r.kind === 'composed');
      if (!row || row.kind !== 'composed') return false;
      row.name = name;
      row.document = document;
      return true;
    }),
    findById: vi.fn(async (id) => rows.find((r) => r.id === id)),
    listByWorkspace: vi.fn(async (wsId) => rows.filter((r) => r.workspaceId === wsId)),
    updateName: vi.fn(async (id, name) => {
      const row = rows.find((r) => r.id === id);
      if (row) row.name = name;
    }),
    // 실제 레포와 같이 **pdf 행만** 대상으로 삼는다 — fake 가 더 관대하면
    // 종류를 넘나드는 쓰기를 서비스 테스트가 놓친다.
    updateProviderTemplate: vi.fn(async (id, snowsignTemplateId, name) => {
      const row = rows.find((r) => r.id === id);
      if (!row || row.kind !== 'pdf') return false;
      row.snowsignTemplateId = snowsignTemplateId;
      row.name = name;
      return true;
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
    createContract: vi.fn(),
    sendContract: vi.fn(),
    getTemplate: vi.fn(),
    templateDownloadUrl: vi.fn(),
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

  it('createTemplate() sends the default signing deadline — 만료 없는 계약을 만들지 않는다', async () => {
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
      expect.objectContaining({ deadlineDays: SIGNING_DEADLINE_DAYS }),
    );
  });

  it('rename() returns TEMPLATE_NOT_FOUND for a missing id', async () => {
    const service = new SigningTemplateService(fakeRepo(), fakeSnowSign());
    const result = await service.rename(actor, 'missing', 'x');
    expect(result).toEqual({ ok: false, error: 'TEMPLATE_NOT_FOUND' });
  });

  it('rename() returns FORBIDDEN for another workspace template', async () => {
    const repo = fakeRepo([
      { id: 't1', workspaceId: 'other-ws', kind: 'pdf', snowsignTemplateId: 's', name: '남의것', createdBy: 'u9', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);
    const service = new SigningTemplateService(repo, fakeSnowSign());
    const result = await service.rename(actor, 't1', '새이름');
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('remove() deletes an owned template', async () => {
    const repo = fakeRepo([
      { id: 't1', workspaceId: actor.workspaceId, kind: 'pdf', snowsignTemplateId: 's', name: '내것', createdBy: actor.userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);
    const service = new SigningTemplateService(repo, fakeSnowSign());
    const result = await service.remove(actor, 't1');
    expect(result).toEqual({ ok: true });
    expect(repo.remove).toHaveBeenCalledWith('t1');
  });
});

// ── 수정 플로: getDetail / getDocumentDownloadUrl / update ─────────────────
const ownedRow: PgSigningTemplate = {
  id: 't1',
  workspaceId: actor.workspaceId,
  kind: 'pdf',
  updatedAt: new Date().toISOString(),
  snowsignTemplateId: 'sst-old',
  name: '로컬 이름',
  createdBy: actor.userId,
  createdAt: new Date().toISOString(),
};

describe('SigningTemplateService.getDetail', () => {
  it('returns TEMPLATE_NOT_FOUND for a missing id without touching the provider', async () => {
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(fakeRepo(), snowsign);
    const result = await service.getDetail(actor, 'missing');
    expect(result).toEqual({ ok: false, error: 'TEMPLATE_NOT_FOUND' });
    expect(snowsign.getTemplate).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN for another workspace template', async () => {
    const service = new SigningTemplateService(
      fakeRepo([{ ...ownedRow, workspaceId: 'other-ws' }]),
      fakeSnowSign(),
    );
    const result = await service.getDetail(actor, 't1');
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  // name 은 **로컬 행**이 출처다 — rename 은 로컬만 갱신하므로 provider name 은
  // 의도적으로 스테일이다. 필드는 role_name 역매핑 + 에디터용 id 부여.
  it('maps provider fields back to editor inputs and takes the name from the local row', async () => {
    const snowsign = fakeSnowSign({
      getTemplate: vi.fn(async () => ({
        templateId: 'sst-old',
        name: 'provider 의 낡은 이름',
        hasVariables: false,
        signers: [{ roleName: '구매사', securityMethod: 'easy_cert' }, { roleName: 'PG사', securityMethod: 'easy_cert' }],
        signatureFields: [
          { roleName: '구매사', type: 'signature', pageNumber: 1, positionX: 72, positionY: 160, width: 180, height: 48 },
          { roleName: 'PG사', type: 'date', pageNumber: 2, positionX: 5, positionY: 6, width: 100, height: 24 },
        ],
      })),
    });
    const service = new SigningTemplateService(fakeRepo([{ ...ownedRow }]), snowsign);

    const result = await service.getDetail(actor, 't1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBe('로컬 이름');
    expect(snowsign.getTemplate).toHaveBeenCalledWith('sst-old');
    expect(result.fields).toHaveLength(2);
    expect(result.fields[0]).toMatchObject({
      party: 'buyer',
      type: 'signature',
      pageNumber: 1,
      x: 72,
      y: 160,
      width: 180,
      height: 48,
    });
    expect(result.fields[1]).toMatchObject({ party: 'pg', type: 'date', pageNumber: 2 });
    // 에디터 상태 키로 쓸 id 가 서로 달라야 한다.
    expect(result.fields[0]!.id).toBeTruthy();
    expect(result.fields[0]!.id).not.toBe(result.fields[1]!.id);
  });

  it('translates provider SNOWSIGN_NOT_FOUND into TEMPLATE_NOT_FOUND', async () => {
    const snowsign = fakeSnowSign({
      getTemplate: vi.fn(async () => {
        throw new SnowSignError('SNOWSIGN_NOT_FOUND', 'TEMPLATE_NOT_FOUND');
      }),
    });
    const service = new SigningTemplateService(fakeRepo([{ ...ownedRow }]), snowsign);
    const result = await service.getDetail(actor, 't1');
    expect(result).toEqual({ ok: false, error: 'TEMPLATE_NOT_FOUND' });
  });

  // 미지 role/type 은 필드를 조용히 버리지 않고 전체를 거부한다 — 버린 채 저장하면
  // 그 필드가 provider 에서 소실된다(우리 앱이 만든 템플릿은 4타입·2롤뿐이라 정상
  // 경로에선 나오지 않는다).
  it('rejects unknown role_name as TEMPLATE_UNSUPPORTED instead of dropping the field', async () => {
    const snowsign = fakeSnowSign({
      getTemplate: vi.fn(async () => ({
        templateId: 'sst-old',
        hasVariables: false,
        signers: [{ roleName: '구매사', securityMethod: 'easy_cert' }, { roleName: 'PG사', securityMethod: 'easy_cert' }],
        signatureFields: [
          { roleName: '판매사', type: 'signature', pageNumber: 1, positionX: 1, positionY: 2, width: 3, height: 4 },
        ],
      })),
    });
    const service = new SigningTemplateService(fakeRepo([{ ...ownedRow }]), snowsign);
    const result = await service.getDetail(actor, 't1');
    expect(result).toEqual({ ok: false, error: 'TEMPLATE_UNSUPPORTED' });
  });

  it('rejects an unsupported field type (stamp 등) as TEMPLATE_UNSUPPORTED', async () => {
    const snowsign = fakeSnowSign({
      getTemplate: vi.fn(async () => ({
        templateId: 'sst-old',
        hasVariables: false,
        signers: [{ roleName: '구매사', securityMethod: 'easy_cert' }, { roleName: 'PG사', securityMethod: 'easy_cert' }],
        signatureFields: [
          { roleName: '구매사', type: 'stamp', pageNumber: 1, positionX: 1, positionY: 2, width: 3, height: 4 },
        ],
      })),
    });
    const service = new SigningTemplateService(fakeRepo([{ ...ownedRow }]), snowsign);
    const result = await service.getDetail(actor, 't1');
    expect(result).toEqual({ ok: false, error: 'TEMPLATE_UNSUPPORTED' });
  });

  // 변수를 실은 템플릿(콘솔 제작)은 재생성 저장이 변수를 되살릴 수 없다 —
  // 서명칸 게이트만으로는 통과해 버려, 저장하는 순간 변수가 소실된다.
  it('rejects a template carrying variables as TEMPLATE_UNSUPPORTED (lossy recreate)', async () => {
    const snowsign = fakeSnowSign({
      getTemplate: vi.fn(async () => ({
        templateId: 'sst-old',
        hasVariables: true,
        signers: [{ roleName: '구매사', securityMethod: 'easy_cert' }, { roleName: 'PG사', securityMethod: 'easy_cert' }],
        signatureFields: [
          { roleName: '구매사', type: 'signature', pageNumber: 1, positionX: 1, positionY: 2, width: 3, height: 4 },
        ],
      })),
    });
    const service = new SigningTemplateService(fakeRepo([{ ...ownedRow }]), snowsign);
    const result = await service.getDetail(actor, 't1');
    expect(result).toEqual({ ok: false, error: 'TEMPLATE_UNSUPPORTED' });
  });

  // NOT_FOUND 외의 provider 오류는 코드 그대로 통과하고, SnowSignError 가 아닌
  // throwable 은 일반 코드로 접힌다 — 번역이 과잉 적용되면 네트워크 오류가
  // "템플릿이 삭제됐다"는 엉뚱한 안내로 나간다.
  it('passes non-NOT_FOUND provider errors through and folds unknown throwables', async () => {
    const netFail = fakeSnowSign({
      getTemplate: vi.fn(async () => {
        throw new SnowSignError('SNOWSIGN_NETWORK', undefined, 'timeout');
      }),
    });
    const s1 = new SigningTemplateService(fakeRepo([{ ...ownedRow }]), netFail);
    expect(await s1.getDetail(actor, 't1')).toEqual({ ok: false, error: 'SNOWSIGN_NETWORK' });

    const weirdFail = fakeSnowSign({
      getTemplate: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const s2 = new SigningTemplateService(fakeRepo([{ ...ownedRow }]), weirdFail);
    expect(await s2.getDetail(actor, 't1')).toEqual({ ok: false, error: 'SNOWSIGN_ERROR' });
  });
});

describe('SigningTemplateService.getDocumentDownloadUrl', () => {
  it('returns the provider download url for an owned template', async () => {
    const snowsign = fakeSnowSign({
      templateDownloadUrl: vi.fn(async () => ({
        downloadUrl: 'https://s3.example.com/tpl.pdf?sig=1',
        filename: '표준.pdf',
      })),
    });
    const service = new SigningTemplateService(fakeRepo([{ ...ownedRow }]), snowsign);

    const result = await service.getDocumentDownloadUrl(actor, 't1');

    expect(result).toEqual({ ok: true, url: 'https://s3.example.com/tpl.pdf?sig=1', filename: '표준.pdf' });
    expect(snowsign.templateDownloadUrl).toHaveBeenCalledWith('sst-old');
  });

  it('returns FORBIDDEN for another workspace template without touching the provider', async () => {
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(
      fakeRepo([{ ...ownedRow, workspaceId: 'other-ws' }]),
      snowsign,
    );
    const result = await service.getDocumentDownloadUrl(actor, 't1');
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(snowsign.templateDownloadUrl).not.toHaveBeenCalled();
  });

  it('translates provider SNOWSIGN_NOT_FOUND into TEMPLATE_NOT_FOUND', async () => {
    const snowsign = fakeSnowSign({
      templateDownloadUrl: vi.fn(async () => {
        throw new SnowSignError('SNOWSIGN_NOT_FOUND', 'TEMPLATE_FILE_NOT_FOUND');
      }),
    });
    const service = new SigningTemplateService(fakeRepo([{ ...ownedRow }]), snowsign);
    const result = await service.getDocumentDownloadUrl(actor, 't1');
    expect(result).toEqual({ ok: false, error: 'TEMPLATE_NOT_FOUND' });
  });
});

// ── 종류 게이트: 조항형(composed) 서식은 PDF 경로로 흘러들면 안 된다 ──────────
//
// 두 종류가 한 테이블에 살기 때문에 id 하나로 어느 경로든 부를 수 있다. 그래서
// "조항형인데 PDF 인 척" 하는 요청을 각 진입점이 스스로 막아야 한다.
const composedRow: PgSigningTemplate = {
    id: 'tc1',
    workspaceId: actor.workspaceId,
    kind: 'composed',
    document: {
      _v: 1,
      title: '조항형 계약서',
      preamble: '',
      clauses: [{ id: 'c1', kind: 'text', heading: '목적', body: '본문' }],
      closing: '',
    },
    name: '조항형',
    createdBy: actor.userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

describe('SigningTemplateService — 조항형 서식은 PDF 경로를 타지 않는다', () => {
  it('getDetail() 은 조항형을 거부하고 공급자를 부르지 않는다', async () => {
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(fakeRepo([composedRow]), snowsign);

    const result = await service.getDetail(actor, 'tc1');

    expect(result).toEqual({ ok: false, error: 'TEMPLATE_KIND_MISMATCH' });
    expect(snowsign.getTemplate).not.toHaveBeenCalled();
  });

  // 이 거부가 pdfjs 에디터를 막는 **실제 게이트**다 — 목록 UI 분기와 타입
  // 불가능성은 그 위의 편의층이고, 손으로 만든 문서 프록시 요청은 여기서 접힌다.
  it('getDocumentDownloadUrl() 은 조항형에 TEMPLATE_NOT_FOUND 를 돌려준다', async () => {
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(fakeRepo([composedRow]), snowsign);

    const result = await service.getDocumentDownloadUrl(actor, 'tc1');

    expect(result).toEqual({ ok: false, error: 'TEMPLATE_NOT_FOUND' });
    expect(snowsign.templateDownloadUrl).not.toHaveBeenCalled();
  });
});

// ── 조항형 서식 CRUD ────────────────────────────────────────────────────────
//
// **provider 왕복이 없다.** 문서가 우리 DB 에 있으므로 저장은 로컬 INSERT/UPDATE
// 하나로 끝난다 — PDF 서식이 "재생성 후 id 교체" 를 해야 하는 것과 대조적이다.
describe('SigningTemplateService — 조항형 CRUD', () => {
  const doc = {
    _v: 1 as const,
    title: '전자결제 서비스 이용계약서',
    preamble: '{{구매사.상호}}와 {{PG사.상호}}는 다음과 같이 계약을 체결한다.',
    clauses: [{ id: 'c1', kind: 'text' as const, heading: '목적', body: '본 계약은 목적을 정한다.' }],
    closing: '각 1부씩 보관한다.',
  };

  it('createComposed() 는 공급자를 부르지 않고 저장한다', async () => {
    const repo = fakeRepo();
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(repo, snowsign);

    const result = await service.createComposedTemplate(actor, { name: '조항형', document: doc });

    expect(result.ok).toBe(true);
    expect(snowsign.createUploadSession).not.toHaveBeenCalled();
    expect(snowsign.createTemplate).not.toHaveBeenCalled();
    expect(repo.createComposed).toHaveBeenCalled();
  });

  // 오타 토큰이 인쇄된 계약서가 서명되면 되돌릴 수 없다 — 저장에서 막는다.
  it('미등록 토큰이 있으면 저장을 거부한다', async () => {
    const repo = fakeRepo();
    const service = new SigningTemplateService(repo, fakeSnowSign());

    const result = await service.createComposedTemplate(actor, {
      name: '조항형',
      document: { ...doc, preamble: '{{구매사.상후}}는' },
    });

    // 저장 거절은 **원인을 이름으로** 돌려줘야 한다. 세 원인이 한 코드로 뭉치면
    // 사용자는 "계약서 내용을 불러오지 못했어요"(발송 경로용 문구)를 받는데,
    // 그는 아무것도 불러온 적이 없고 이미 편집기 안이라 그 처방("템플릿에서 확인하고
    // 다시 저장")이 제자리를 맴돈다. 무엇을 고쳐야 하는지가 원인마다 다르다.
    expect(result).toEqual({ ok: false, error: 'COMPOSE_UNKNOWN_TOKEN' });
    expect(repo.createComposed).not.toHaveBeenCalled();
  });

  // 폰트에 없는 문자는 PDF 에 **빈칸으로** 찍힌다 — 발송 때가 아니라 작성 때 막는다.
  it('폰트가 못 그리는 문자가 있으면 저장을 거부한다', async () => {
    const repo = fakeRepo();
    const service = new SigningTemplateService(repo, fakeSnowSign());

    const result = await service.createComposedTemplate(actor, {
      name: '조항형',
      document: { ...doc, closing: '株式會社 확인' },
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe('COMPOSE_UNSUPPORTED_CHARACTER');
    expect(repo.createComposed).not.toHaveBeenCalled();
  });

  // 항목별 zod 상한(60조 × 4000자)을 다 지켜도 합은 ~490K 자까지 커진다. 총량 상한이
  // 미리보기 라우트에만 있으면 **저장은 되는데 자기 미리보기가 400 인** 문서가 생기고,
  // 발송 경로는 그 문서를 같은 단일 fork 위에서 조판·렌더한다.
  it('전체 크기가 상한을 넘으면 저장을 거부한다', async () => {
    const repo = fakeRepo();
    const service = new SigningTemplateService(repo, fakeSnowSign());

    const result = await service.createComposedTemplate(actor, {
      name: '조항형',
      document: {
        ...doc,
        clauses: Array.from({ length: 60 }, (_, i) => ({
          id: `c${i}`,
          kind: 'text' as const,
          heading: '조',
          body: '가'.repeat(2_000),
        })),
      },
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe('COMPOSE_DOCUMENT_TOO_LARGE');
    expect(repo.createComposed).not.toHaveBeenCalled();
  });

  // 조항 **제목**의 토큰은 등록된 것이라도 거부한다(제목은 치환 대상이 아니라
  // `{{계약일}}` 이 그대로 인쇄된 채 서명된다). 본문 오타와 원인이 다르므로 코드도
  // 달라야 한다 — "등록 안 된 토큰을 지우세요"는 여기서 틀린 처방이다.
  it('조항 제목에 토큰이 있으면 제목 전용 코드로 거부한다', async () => {
    const repo = fakeRepo();
    const service = new SigningTemplateService(repo, fakeSnowSign());

    const result = await service.createComposedTemplate(actor, {
      name: '조항형',
      document: {
        ...doc,
        clauses: [{ id: 'c1', kind: 'text' as const, heading: '목적 {{계약일}}', body: '본문' }],
      },
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe('COMPOSE_TOKEN_IN_HEADING');
    expect(repo.createComposed).not.toHaveBeenCalled();
  });

  it('updateComposed() 는 행 id 를 유지한 채 문서를 갈아끼운다', async () => {
    const repo = fakeRepo([composedRow]);
    const service = new SigningTemplateService(repo, fakeSnowSign());

    const result = await service.updateComposedTemplate(actor, {
      templateId: 'tc1',
      name: '개정판',
      document: doc,
    });

    expect(result).toEqual({ ok: true });
    expect(repo.updateComposedDocument).toHaveBeenCalledWith('tc1', '개정판', doc);
  });

  it('남의 워크스페이스 서식은 수정할 수 없다', async () => {
    const repo = fakeRepo([{ ...composedRow, workspaceId: 'other-ws' }]);
    const service = new SigningTemplateService(repo, fakeSnowSign());

    const result = await service.updateComposedTemplate(actor, {
      templateId: 'tc1',
      name: 'x',
      document: doc,
    });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(repo.updateComposedDocument).not.toHaveBeenCalled();
  });

  // 종류 게이트의 대칭 — PDF 서식을 조항형 저장 경로로 덮어쓰면 안 된다.
  it('PDF 서식을 조항형으로 수정하려 하면 거부한다', async () => {
    const repo = fakeRepo([{ ...ownedRow }]);
    const service = new SigningTemplateService(repo, fakeSnowSign());

    const result = await service.updateComposedTemplate(actor, {
      templateId: 't1',
      name: 'x',
      document: doc,
    });

    expect(result).toEqual({ ok: false, error: 'TEMPLATE_KIND_MISMATCH' });
    expect(repo.updateComposedDocument).not.toHaveBeenCalled();
  });

  it('사라진 서식은 TEMPLATE_NOT_FOUND', async () => {
    const repo = fakeRepo();
    const service = new SigningTemplateService(repo, fakeSnowSign());

    const result = await service.updateComposedTemplate(actor, {
      templateId: 'gone',
      name: 'x',
      document: doc,
    });

    expect(result).toEqual({ ok: false, error: 'TEMPLATE_NOT_FOUND' });
  });
});

describe('SigningTemplateService.update', () => {
  it('recreates the provider template and swaps the link row in place (no new row)', async () => {
    const repo = fakeRepo([{ ...ownedRow }]);
    const snowsign = fakeSnowSign({ createTemplate: vi.fn(async () => ({ templateId: 'sst-new' })) });
    const service = new SigningTemplateService(repo, snowsign);

    const result = await service.update(actor, {
      templateId: 't1',
      name: '개정판',
      uploadToken: await issueToken(service),
      fields: [signableField, pgSignableField],
    });

    expect(result).toEqual({ ok: true, templateId: 't1' });
    // provider 재생성은 create 와 같은 고정 signers + 서명 마감으로 나간다.
    expect(snowsign.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '개정판',
        documentUploadId: 'upl_1',
        signers: ['구매사', 'PG사'],
        deadlineDays: SIGNING_DEADLINE_DAYS,
      }),
    );
    // 행은 교체이지 신규가 아니다 — bids FK 보존의 핵심.
    expect(repo.updateProviderTemplate).toHaveBeenCalledWith('t1', 'sst-new', '개정판');
    expect(repo.create).not.toHaveBeenCalled();
    const found = await repo.findById('t1');
    expect(found?.snowsignTemplateId).toBe('sst-new');
    expect(found?.name).toBe('개정판');
  });

  it('rejects an upload token minted for another workspace before touching the provider', async () => {
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(fakeRepo([{ ...ownedRow }]), snowsign);
    const issued = await service.createUploadSession(
      { userId: 'other', workspaceId: 'ws-OTHER' },
      { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 100 },
    );
    expect(issued.ok).toBe(true);

    const result = await service.update(actor, {
      templateId: 't1',
      name: 'x',
      uploadToken: issued.ok ? issued.uploadToken : '',
      fields: [signableField, pgSignableField],
    });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(snowsign.createTemplate).not.toHaveBeenCalled();
  });

  it('rejects invalid fields without calling SnowSign', async () => {
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(fakeRepo([{ ...ownedRow }]), snowsign);

    const result = await service.update(actor, {
      templateId: 't1',
      name: 'x',
      uploadToken: await issueToken(service),
      fields: [signableField], // pg 쪽 서명 필드 없음
    });

    expect(result).toEqual({ ok: false, error: 'MISSING_SIGNABLE_FIELD' });
    expect(snowsign.createTemplate).not.toHaveBeenCalled();
  });

  // 소유 검증은 provider 변이 **앞**이어야 한다 — 뒤면 남의 templateId 로도 새
  // provider 템플릿이 만들어진 다음에야 거부돼 고아만 남는다.
  it('rejects another workspace template before creating anything at the provider', async () => {
    const snowsign = fakeSnowSign();
    const service = new SigningTemplateService(
      fakeRepo([{ ...ownedRow, workspaceId: 'other-ws' }]),
      snowsign,
    );

    const result = await service.update(actor, {
      templateId: 't1',
      name: 'x',
      uploadToken: await issueToken(service),
      fields: [signableField, pgSignableField],
    });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(snowsign.createTemplate).not.toHaveBeenCalled();
  });

  it('passes the provider error through and leaves the link row untouched', async () => {
    const repo = fakeRepo([{ ...ownedRow }]);
    const snowsign = fakeSnowSign({
      createTemplate: vi.fn(async () => {
        throw new SnowSignError('SNOWSIGN_QUOTA_EXCEEDED', 'QUOTA_EXCEEDED');
      }),
    });
    const service = new SigningTemplateService(repo, snowsign);

    const result = await service.update(actor, {
      templateId: 't1',
      name: 'x',
      uploadToken: await issueToken(service),
      fields: [signableField, pgSignableField],
    });

    expect(result).toEqual({ ok: false, error: 'SNOWSIGN_QUOTA_EXCEEDED' });
    expect(repo.updateProviderTemplate).not.toHaveBeenCalled();
    const found = await repo.findById('t1');
    expect(found?.snowsignTemplateId).toBe('sst-old');
  });

  // 소유 검증과 UPDATE 사이에 provider 왕복이 있어 동료의 삭제가 끼어들 수 있다 —
  // 0행 스왑을 성공으로 돌려주면 에디터가 거짓 '저장했어요'를 띄우고 목록에서
  // 템플릿이 사라진 것과 모순된다.
  it('reports TEMPLATE_NOT_FOUND when the row vanished between requireOwned and the swap', async () => {
    const repo = fakeRepo([{ ...ownedRow }]);
    (repo.updateProviderTemplate as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const service = new SigningTemplateService(repo, fakeSnowSign());

    const result = await service.update(actor, {
      templateId: 't1',
      name: 'x',
      uploadToken: await issueToken(service),
      fields: [signableField, pgSignableField],
    });

    expect(result).toEqual({ ok: false, error: 'TEMPLATE_NOT_FOUND' });
  });

  // 업로드가 템플릿으로 소비되면 조직 공유 슬롯(3개)을 즉시 반납해야 한다 —
  // 반납이 빠지면 10분 TTL 안에 수정 3번으로 모든 PG 의 업로드가 막힌다.
  // (이 단언이 없으면 releaseUploadSlotByUploadId 호출을 지워도 스위트가 초록이다.)
  it('releases the org-wide upload slot after a successful update', async () => {
    const service = new SigningTemplateService(fakeRepo([{ ...ownedRow }]), fakeSnowSign());
    const big = { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 50 * 1024 * 1024 };

    const result = await service.update(actor, {
      templateId: 't1',
      name: '개정판',
      uploadToken: await issueToken(service),
      fields: [signableField, pgSignableField],
    });
    expect(result.ok).toBe(true);

    // 슬롯이 반납됐다면 조직 한도(3개)를 다시 꽉 채울 수 있다.
    for (const ws of ['wsA', 'wsB', 'wsC']) {
      const r = await service.createUploadSession({ userId: 'u', workspaceId: ws }, big);
      expect(r.ok).toBe(true);
    }
  });
});
