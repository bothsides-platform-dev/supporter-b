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

const actor = { ok: true as const, userId: 'u1', workspaceId: 'ws1', email: 'u1@example.com' };

function fakeService(overrides: Record<string, unknown> = {}) {
  return {
    createUploadSession: vi.fn(async () => ({ ok: true, uploadId: 'u', uploadUrl: 'https://x', fields: {} })),
    createTemplate: vi.fn(async () => ({ ok: true, templateId: 't1' })),
    list: vi.fn(async () => ({ ok: true, templates: [] })),
    rename: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
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

    expect(result).toEqual({ ok: true, uploadId: 'u', uploadUrl: 'https://x', fields: {} });
    expect(service.createUploadSession).toHaveBeenCalledWith(
      { userId: 'u1', workspaceId: 'ws1' },
      { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10 },
    );
  });

  it('createSigningTemplateAction() rejects invalid input without calling the service', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await createSigningTemplateAction({ name: '', documentUploadId: 'u', fields: [] });

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(service.createTemplate).not.toHaveBeenCalled();
  });

  it('createSigningTemplateAction() delegates valid input to the service', async () => {
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await createSigningTemplateAction({
      name: '표준',
      documentUploadId: 'upl_1',
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

  it('propagates FORBIDDEN_PG when the session is not a PG actor', async () => {
    vi.mocked(requirePgActor).mockResolvedValue({ ok: false, error: 'FORBIDDEN_PG' });
    const service = fakeService();
    __setSigningTemplateServiceForTest(service as never);

    const result = await listSigningTemplatesAction();

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
    expect(service.list).not.toHaveBeenCalled();
  });
});
