import { describe, expect, it } from 'vitest';
import { toSigningTemplateOption } from '../signing-template-option';
import type { PgSigningTemplate } from '@/lib/types/signing';

const base = {
  id: 't1',
  workspaceId: 'ws1',
  name: '표준 계약서',
  createdBy: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

const pdfRow: PgSigningTemplate = { ...base, kind: 'pdf', snowsignTemplateId: 'sst-1' };
const composedRow: PgSigningTemplate = {
  ...base,
  kind: 'composed',
  document: {
    _v: 1,
    title: '전자결제 서비스 이용계약서',
    preamble: '갑과 을은',
    clauses: [{ id: 'c1', kind: 'text', heading: '목적', body: '본문' }],
    closing: '끝',
  },
};

describe('toSigningTemplateOption', () => {
  // 키 집합을 못박는다 — 필드를 늘리면 그 값이 모든 딜룸 페이로드에 실린다.
  it('id·name·kind 만 내보낸다', () => {
    expect(Object.keys(toSigningTemplateOption(pdfRow)).sort()).toEqual(['id', 'kind', 'name']);
  });

  /**
   * 조항형 서식의 `document` 는 위저드 픽커가 **전혀 쓰지 않는데**(이름만 렌더한다)
   * 그대로 넘기면 PG 가 가진 서식 수만큼 모든 딜룸 RSC 페이로드가 문서째로 불어난다.
   */
  it('조항 문서를 페이로드에 싣지 않는다', () => {
    const option = toSigningTemplateOption(composedRow);
    expect(option).toEqual({ id: 't1', name: '표준 계약서', kind: 'composed' });
    expect('document' in option).toBe(false);
  });

  it('서버 전용 값(createdBy·workspaceId)을 흘리지 않는다', () => {
    const option = toSigningTemplateOption(pdfRow) as Record<string, unknown>;
    expect(option.createdBy).toBeUndefined();
    expect(option.workspaceId).toBeUndefined();
    expect(option.snowsignTemplateId).toBeUndefined();
  });

  it('딜룸이 발송 경로를 가를 수 있도록 kind 는 유지한다', () => {
    expect(toSigningTemplateOption(pdfRow).kind).toBe('pdf');
    expect(toSigningTemplateOption(composedRow).kind).toBe('composed');
  });
});
