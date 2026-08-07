import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/actions/_session', () => ({
  requirePgActor: vi.fn(),
}));

import { requirePgActor } from '@/lib/server/actions/_session';
import {
  __setSigningTemplateServiceForTest,
  __resetSigningTemplateServiceForTest,
} from '@/lib/server/services/signing-template';
import { createSigningTemplateUploadSessionAction } from '../createSigningTemplateUploadSessionAction';
import { createSigningTemplateAction } from '../createSigningTemplateAction';
import { listSigningTemplatesAction } from '../listSigningTemplatesAction';
import { renameSigningTemplateAction } from '../renameSigningTemplateAction';
import { deleteSigningTemplateAction } from '../deleteSigningTemplateAction';
import { getSigningTemplateDetailAction } from '../getSigningTemplateDetailAction';
import { updateSigningTemplateAction } from '../updateSigningTemplateAction';

const actor = { ok: true as const, userId: 'u1', workspaceId: 'ws1', email: 'u1@example.com' };

function fakeService(overrides: Record<string, unknown> = {}) {
  return {
    createUploadSession: vi.fn(async () => ({ ok: true, uploadToken: 'tok', uploadUrl: 'https://x', fields: {} })),
    createTemplate: vi.fn(async () => ({ ok: true, templateId: 't1' })),
    list: vi.fn(async () => ({ ok: true, templates: [] })),
    rename: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
    getDetail: vi.fn(async () => ({ ok: true, name: '표준', fields: [] })),
    update: vi.fn(async () => ({ ok: true, templateId: 't1' })),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(requirePgActor).mockResolvedValue(actor);
});
afterEach(() => {
  __resetSigningTemplateServiceForTest();
  vi.clearAllMocks();
});

describe('signing template actions', () => {
  it('createSigningTemplateUploadSessionAction() delegates to the service with the resolved actor', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await createSigningTemplateUploadSessionAction({
      filename: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
    });

    expect(result).toEqual({ ok: true, uploadToken: 'tok', uploadUrl: 'https://x', fields: {} });
    expect(service.createUploadSession).toHaveBeenCalledWith(
      { userId: 'u1', workspaceId: 'ws1' },
      { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10 },
    );
  });

  it('createSigningTemplateAction() rejects invalid input without calling the service', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await createSigningTemplateAction({ name: '', uploadToken: 'tok', fields: [] });

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(service.createTemplate).not.toHaveBeenCalled();
  });

  it('createSigningTemplateAction() delegates valid input to the service', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await createSigningTemplateAction({
      name: '표준',
      uploadToken: 'tok',
      fields: [
        { id: 'f1', type: 'signature', party: 'buyer', pageNumber: 1, x: 0, y: 0, width: 10, height: 10 },
      ],
    });

    expect(result).toEqual({ ok: true, templateId: 't1' });
  });

  it('listSigningTemplatesAction() returns the actor workspace templates', async () => {
    const service = fakeService({ list: vi.fn(async () => ({ ok: true, templates: [{ id: 't1' }] })) });
    __setSigningTemplateServiceForTest(service as never);

    const result = await listSigningTemplatesAction();

    expect(result).toEqual({ ok: true, templates: [{ id: 't1' }] });
  });

  it('renameSigningTemplateAction() rejects an empty name', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await renameSigningTemplateAction({ templateId: 't1', name: '' });

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(service.rename).not.toHaveBeenCalled();
  });

  it('deleteSigningTemplateAction() delegates to the service', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await deleteSigningTemplateAction({ templateId: 't1' });

    expect(result).toEqual({ ok: true });
    expect(service.remove).toHaveBeenCalledWith({ userId: 'u1', workspaceId: 'ws1' }, 't1');
  });

  it('getSigningTemplateDetailAction() delegates to the service with the resolved actor', async () => {
    const service = fakeService({
      getDetail: vi.fn(async () => ({
        ok: true,
        name: '표준',
        fields: [{ id: 'f1', type: 'signature', party: 'buyer', pageNumber: 1, x: 1, y: 2, width: 3, height: 4 }],
      })),
    });
    __setSigningTemplateServiceForTest(service as never);

    const result = await getSigningTemplateDetailAction({ templateId: 't1' });

    expect(result).toEqual({
      ok: true,
      name: '표준',
      fields: [{ id: 'f1', type: 'signature', party: 'buyer', pageNumber: 1, x: 1, y: 2, width: 3, height: 4 }],
    });
    expect(service.getDetail).toHaveBeenCalledWith({ userId: 'u1', workspaceId: 'ws1' }, 't1');
  });

  it('getSigningTemplateDetailAction() rejects an empty templateId without calling the service', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await getSigningTemplateDetailAction({ templateId: '' });

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(service.getDetail).not.toHaveBeenCalled();
  });

  it('updateSigningTemplateAction() delegates valid input to the service', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await updateSigningTemplateAction({
      templateId: 't1',
      name: '개정판',
      uploadToken: 'tok',
      fields: [
        { id: 'f1', type: 'signature', party: 'buyer', pageNumber: 1, x: 0, y: 0, width: 10, height: 10 },
      ],
    });

    expect(result).toEqual({ ok: true, templateId: 't1' });
    expect(service.update).toHaveBeenCalledWith(
      { userId: 'u1', workspaceId: 'ws1' },
      {
        templateId: 't1',
        name: '개정판',
        uploadToken: 'tok',
        fields: [
          { id: 'f1', type: 'signature', party: 'buyer', pageNumber: 1, x: 0, y: 0, width: 10, height: 10 },
        ],
      },
    );
  });

  it('updateSigningTemplateAction() rejects empty fields without calling the service', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await updateSigningTemplateAction({
      templateId: 't1',
      name: '개정판',
      uploadToken: 'tok',
      fields: [],
    });

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(service.update).not.toHaveBeenCalled();
  });

  // 액션마다 게이트를 검증한다 — list 하나만 커버하면 신규 액션에서 requirePgActor
  // 를 지워도 스위트가 초록이다(적대 리뷰). update 는 파괴적 경로라 특히 그렇다.
  const validField = { id: 'f1', type: 'signature', party: 'buyer', pageNumber: 1, x: 0, y: 0, width: 10, height: 10 } as const;
  it.each([
    ['listSigningTemplatesAction', () => listSigningTemplatesAction(), 'list'],
    ['getSigningTemplateDetailAction', () => getSigningTemplateDetailAction({ templateId: 't1' }), 'getDetail'],
    [
      'updateSigningTemplateAction',
      () => updateSigningTemplateAction({ templateId: 't1', name: 'x', uploadToken: 'tok', fields: [validField] }),
      'update',
    ],
  ] as const)('%s propagates FORBIDDEN_PG without touching the service', async (_name, call, serviceMethod) => {
    vi.mocked(requirePgActor).mockResolvedValue({ ok: false, error: 'FORBIDDEN_PG' });
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await call();

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
    expect(service[serviceMethod]).not.toHaveBeenCalled();
  });

  // 좌표·크기의 서버측 경계는 이 스키마가 유일한 방어다(clampToPage 는 클라 전용) —
  // 빈 배열·빈 이름만 테스트하면 per-field 규칙을 느슨하게 풀어도 초록이다.
  it.each([
    ['pageNumber 0', { ...validField, pageNumber: 0 }],
    ['음수 x', { ...validField, x: -1 }],
    ['width 0', { ...validField, width: 0 }],
    ['미지 키(.strict())', { ...validField, extra: 1 } as unknown as typeof validField],
  ])('updateSigningTemplateAction rejects a malformed field (%s) as INVALID_INPUT', async (_label, field) => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await updateSigningTemplateAction({
      templateId: 't1',
      name: 'x',
      uploadToken: 'tok',
      fields: [field],
    });

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(service.update).not.toHaveBeenCalled();
  });

  it('createSigningTemplateAction rejects the same malformed fields (shared schema)', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await createSigningTemplateAction({
      name: 'x',
      uploadToken: 'tok',
      fields: [{ ...validField, height: 0 }],
    });

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(service.createTemplate).not.toHaveBeenCalled();
  });
});
