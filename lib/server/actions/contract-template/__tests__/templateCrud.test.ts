// contract-template actions: save (create) / delete. PG 전용 — 계약서 PDF 템플릿
// CRUD. ContractTemplateService(Wave 3)는 __setContractTemplateServiceForTest 로
// 모킹해, 이 테스트는 액션 레이어 책임(세션 게이트·입력 검증·위임 인자·결과
// 패스스루)만 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

type SessionUser = { id: string; email: string; workspaceId: string; workspaceType: 'buyer' | 'pg' };
const sessionRef: { value: { user: SessionUser } | null } = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requirePgSession: () =>
    sessionRef.value?.user.workspaceType === 'pg'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN_PG')),
}));

import {
  ContractTemplateService,
  __resetContractTemplateServiceForTest,
  __setContractTemplateServiceForTest,
} from '@/lib/server/services/contract-template';
import { saveContractTemplateAction } from '../saveContractTemplateAction';
import { deleteContractTemplateAction } from '../deleteContractTemplateAction';

const ATTACHMENT_ID = randomUUID();
const TEMPLATE_ID = randomUUID();

function mockService(methods: Record<string, ReturnType<typeof vi.fn>>) {
  const fake = Object.assign(Object.create(ContractTemplateService.prototype), methods);
  __setContractTemplateServiceForTest(fake);
  return fake;
}

beforeEach(() => {
  sessionRef.value = { user: { id: 'u1', email: 'x@x.com', workspaceId: 'ws1', workspaceType: 'pg' } };
});

afterEach(() => {
  __resetContractTemplateServiceForTest();
  sessionRef.value = null;
  vi.clearAllMocks();
});

describe('saveContractTemplateAction', () => {
  it('rejects a buyer session → FORBIDDEN_PG', async () => {
    sessionRef.value = { user: { id: 'u1', email: 'b@x.com', workspaceId: 'ws1', workspaceType: 'buyer' } };
    const spy = vi.fn();
    mockService({ save: spy });
    const r = await saveContractTemplateAction({ name: '표준 계약서', attachmentId: ATTACHMENT_ID });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an empty name → INVALID_INPUT', async () => {
    const spy = vi.fn();
    mockService({ save: spy });
    const r = await saveContractTemplateAction({ name: '', attachmentId: ATTACHMENT_ID });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a name over 80 chars → INVALID_INPUT', async () => {
    const spy = vi.fn();
    mockService({ save: spy });
    const r = await saveContractTemplateAction({ name: 'x'.repeat(81), attachmentId: ATTACHMENT_ID });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a description over 200 chars → INVALID_INPUT', async () => {
    const spy = vi.fn();
    mockService({ save: spy });
    const r = await saveContractTemplateAction({
      name: '표준 계약서',
      description: 'x'.repeat(201),
      attachmentId: ATTACHMENT_ID,
    });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid attachmentId → INVALID_INPUT', async () => {
    const spy = vi.fn();
    mockService({ save: spy });
    const r = await saveContractTemplateAction({ name: '표준 계약서', attachmentId: 'nope' });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('delegates {name, description, attachmentId} + actor to ContractTemplateService.save', async () => {
    sessionRef.value = { user: { id: 'pg-1', email: 'x@x.com', workspaceId: 'pg-ws-1', workspaceType: 'pg' } };
    const spy = vi.fn(async () => ({ ok: true as const, templateId: TEMPLATE_ID }));
    mockService({ save: spy });

    const res = await saveContractTemplateAction({
      name: '표준 계약서',
      description: '기본 서비스 계약서 양식',
      attachmentId: ATTACHMENT_ID,
    });

    expect(res).toEqual({ ok: true, templateId: TEMPLATE_ID });
    expect(spy).toHaveBeenCalledWith(
      { name: '표준 계약서', description: '기본 서비스 계약서 양식', attachmentId: ATTACHMENT_ID },
      { userId: 'pg-1', workspaceId: 'pg-ws-1' },
    );
  });

  it('omits description entirely when not provided (no undefined leaks as an explicit field mismatch)', async () => {
    const spy = vi.fn(async () => ({ ok: true as const, templateId: TEMPLATE_ID }));
    mockService({ save: spy });
    await saveContractTemplateAction({ name: '표준 계약서', attachmentId: ATTACHMENT_ID });
    expect(spy).toHaveBeenCalledWith(
      { name: '표준 계약서', description: undefined, attachmentId: ATTACHMENT_ID },
      { userId: 'u1', workspaceId: 'ws1' },
    );
  });

  it('passes through a service error unchanged (e.g. LIMIT_REACHED)', async () => {
    const spy = vi.fn(async () => ({ ok: false as const, error: 'LIMIT_REACHED' }));
    mockService({ save: spy });
    const r = await saveContractTemplateAction({ name: '표준 계약서', attachmentId: ATTACHMENT_ID });
    expect(r).toEqual({ ok: false, error: 'LIMIT_REACHED' });
  });
});

describe('deleteContractTemplateAction', () => {
  it('rejects a buyer session → FORBIDDEN_PG', async () => {
    sessionRef.value = { user: { id: 'u1', email: 'b@x.com', workspaceId: 'ws1', workspaceType: 'buyer' } };
    const spy = vi.fn();
    mockService({ remove: spy });
    const r = await deleteContractTemplateAction({ templateId: TEMPLATE_ID });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid templateId → INVALID_INPUT', async () => {
    const spy = vi.fn();
    mockService({ remove: spy });
    const r = await deleteContractTemplateAction({ templateId: 'nope' });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('delegates templateId + actor to ContractTemplateService.remove', async () => {
    sessionRef.value = { user: { id: 'pg-1', email: 'x@x.com', workspaceId: 'pg-ws-1', workspaceType: 'pg' } };
    const spy = vi.fn(async () => ({ ok: true as const }));
    mockService({ remove: spy });

    const res = await deleteContractTemplateAction({ templateId: TEMPLATE_ID });

    expect(res).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith(TEMPLATE_ID, { userId: 'pg-1', workspaceId: 'pg-ws-1' });
  });

  it('passes through a service error unchanged (e.g. FORBIDDEN)', async () => {
    const spy = vi.fn(async () => ({ ok: false as const, error: 'FORBIDDEN' }));
    mockService({ remove: spy });
    const r = await deleteContractTemplateAction({ templateId: TEMPLATE_ID });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});
