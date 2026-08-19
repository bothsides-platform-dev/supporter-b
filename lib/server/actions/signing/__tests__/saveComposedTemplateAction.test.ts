import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/actions/_session', () => ({ requirePgActor: vi.fn() }));
vi.mock('@/lib/server/services/signing-template', () => ({
  getSigningTemplateService: vi.fn(),
}));

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import { saveComposedTemplateAction } from '../saveComposedTemplateAction';

const actor = { ok: true as const, userId: 'u1', workspaceId: 'ws1', email: 'u1@example.com' };

const DOC = {
  _v: 1 as const,
  title: '전자결제 서비스 이용계약서',
  preamble: '갑과 을은 다음과 같이 계약을 체결한다.',
  clauses: [{ id: 'c1', kind: 'text' as const, heading: '목적', body: '본 계약은 목적을 정한다.' }],
  closing: '각 1부씩 보관한다.',
};

function svc() {
  const createComposedTemplate = vi.fn(async () => ({ ok: true, templateId: 'new-id' }));
  const updateComposedTemplate = vi.fn(async () => ({ ok: true }));
  vi.mocked(getSigningTemplateService).mockResolvedValue({
    createComposedTemplate,
    updateComposedTemplate,
  } as never);
  return { createComposedTemplate, updateComposedTemplate };
}

beforeEach(() => {
  vi.mocked(requirePgActor).mockResolvedValue(actor);
});
afterEach(() => vi.clearAllMocks());

describe('saveComposedTemplateAction', () => {
  // 폼이 하나이므로 액션도 하나 — id 유무가 생성/수정을 가른다.
  it('templateId 가 없으면 생성한다', async () => {
    const { createComposedTemplate, updateComposedTemplate } = svc();

    const result = await saveComposedTemplateAction({ name: '조항형', document: DOC });

    expect(result).toEqual({ ok: true, templateId: 'new-id' });
    expect(createComposedTemplate).toHaveBeenCalledWith(
      { userId: 'u1', workspaceId: 'ws1' },
      { name: '조항형', document: DOC },
    );
    expect(updateComposedTemplate).not.toHaveBeenCalled();
  });

  it('templateId 가 있으면 수정한다', async () => {
    const { createComposedTemplate, updateComposedTemplate } = svc();

    const result = await saveComposedTemplateAction({
      templateId: 't1',
      name: '개정판',
      document: DOC,
    });

    expect(result).toEqual({ ok: true });
    expect(updateComposedTemplate).toHaveBeenCalledWith(
      { userId: 'u1', workspaceId: 'ws1' },
      { templateId: 't1', name: '개정판', document: DOC },
    );
    expect(createComposedTemplate).not.toHaveBeenCalled();
  });

  it('PG 액터가 아니면 서비스에 닿지 않는다', async () => {
    vi.mocked(requirePgActor).mockResolvedValue({ ok: false, error: 'FORBIDDEN_PG' } as never);

    const result = await saveComposedTemplateAction({ name: 'x', document: DOC });

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
    expect(getSigningTemplateService).not.toHaveBeenCalled();
  });

  it('빈 이름은 INVALID_INPUT', async () => {
    svc();
    expect(await saveComposedTemplateAction({ name: '', document: DOC })).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
  });

  // 스키마가 discriminatedUnion 이라 종류에 없는 필드가 실린 조항은 통과하지 못한다 —
  // 통과시키면 렌더가 그 필드를 조용히 잃는다.
  it('조항 종류에 없는 필드가 섞이면 INVALID_INPUT', async () => {
    svc();
    const bad = {
      ...DOC,
      clauses: [{ id: 'c1', kind: 'text' as const, heading: '목적', body: '본문', intro: '섞임' }],
    };
    expect(
      await saveComposedTemplateAction({ name: '조항형', document: bad as never }),
    ).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('조항 수 상한을 넘으면 INVALID_INPUT', async () => {
    svc();
    const many = {
      ...DOC,
      clauses: Array.from({ length: 200 }, (_, i) => ({
        id: `c${i}`,
        kind: 'text' as const,
        heading: '조',
        body: '본문',
      })),
    };
    expect(await saveComposedTemplateAction({ name: '조항형', document: many })).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    });
  });
});
