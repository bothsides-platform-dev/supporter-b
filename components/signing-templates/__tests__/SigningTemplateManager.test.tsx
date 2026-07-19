import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/server/actions/signing/issueSigningTemplateEmbedSessionAction', () => ({
  issueSigningTemplateEmbedSessionAction: vi.fn(async () => ({
    ok: true,
    iframeUrl: 'https://app.snowsign.jtsnowball.com/embed/abc',
    sessionId: 's1',
  })),
}));
vi.mock('@/lib/server/actions/signing/getSigningTemplateDetailAction', () => ({
  getSigningTemplateDetailAction: vi.fn(async () => ({
    ok: true,
    name: '표준 가맹계약서',
    roleNames: ['구매사', 'PG'],
    variables: [{ name: '정산주기', label: '정산 주기', required: true }],
  })),
}));
vi.mock('@/lib/server/actions/signing/linkSigningTemplateAction', () => ({
  linkSigningTemplateAction: vi.fn(async () => ({ ok: true, templateId: 't_new' })),
}));

import { SigningTemplateManager } from '../SigningTemplateManager';
import { issueSigningTemplateEmbedSessionAction } from '@/lib/server/actions/signing/issueSigningTemplateEmbedSessionAction';
import { getSigningTemplateDetailAction } from '@/lib/server/actions/signing/getSigningTemplateDetailAction';
import { linkSigningTemplateAction } from '@/lib/server/actions/signing/linkSigningTemplateAction';
import type { PgSigningTemplate } from '@/lib/types/signing';

afterEach(cleanup);

function tmpl(over: Partial<PgSigningTemplate> = {}): PgSigningTemplate {
  return {
    id: 't1',
    workspaceId: 'ws1',
    snowsignTemplateId: 'tmpl_9f3a',
    name: '표준 가맹계약서',
    roleMapping: { 구매사: 'buyer', PG: 'pg' },
    variableMapping: { 정산주기: 'bid.settleCycle', 수수료율: 'bid.settleLimit' },
    isDefault: true,
    createdBy: 'u1',
    createdAt: '2026-04-01T00:00:00Z',
    ...over,
  };
}

describe('SigningTemplateManager', () => {
  it('빈 상태: 안내 + 만들기 CTA', () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    expect(screen.getByText('서명 템플릿을 만들어 주세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '서명 템플릿 만들기' })).toBeInTheDocument();
  });

  it('목록: 링크된 템플릿 이름·기본 배지·요약을 렌더한다', () => {
    render(<SigningTemplateManager initialTemplates={[tmpl()]} />);
    expect(screen.getByText('표준 가맹계약서')).toBeInTheDocument();
    expect(screen.getByText('기본')).toBeInTheDocument();
    expect(screen.getByText(/tmpl_9f3a/)).toBeInTheDocument();
    expect(screen.getByText(/역할 2/)).toBeInTheDocument();
    expect(screen.getByText(/변수 2/)).toBeInTheDocument();
  });

  it('만들기 → 임베드 세션 발급 + iframe 렌더', async () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '서명 템플릿 만들기' }));
    await waitFor(() => expect(issueSigningTemplateEmbedSessionAction).toHaveBeenCalled());
    const iframe = await screen.findByTitle('스노우싸인 계약서 등록');
    expect(iframe).toHaveAttribute('src', 'https://app.snowsign.jtsnowball.com/embed/abc');
  });

  it('수동 폴백: 등록 완료 → 템플릿 ID 입력 → detail 조회 → 매핑 폼', async () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '서명 템플릿 만들기' }));
    await screen.findByTitle('스노우싸인 계약서 등록');

    await userEvent.click(screen.getByRole('button', { name: '등록을 마쳤어요' }));
    await userEvent.type(screen.getByLabelText('스노우싸인 템플릿 ID'), 'tmpl_manual');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    await waitFor(() =>
      expect(getSigningTemplateDetailAction).toHaveBeenCalledWith({ snowsignTemplateId: 'tmpl_manual' }),
    );
    expect(await screen.findByText('역할 매핑')).toBeInTheDocument();
    // 템플릿 역할 pill 이 detail 로부터 렌더된다.
    expect(screen.getByText('구매사')).toBeInTheDocument();
    expect(screen.getByText('PG')).toBeInTheDocument();
  });

  it('매핑 저장: 역할 매핑을 링크 액션으로 전달한다', async () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '서명 템플릿 만들기' }));
    await screen.findByTitle('스노우싸인 계약서 등록');
    await userEvent.click(screen.getByRole('button', { name: '등록을 마쳤어요' }));
    await userEvent.type(screen.getByLabelText('스노우싸인 템플릿 ID'), 'tmpl_manual');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('역할 매핑');

    // 역할 select: 구매사→buyer, PG→pg (라벨로 조회).
    await userEvent.selectOptions(screen.getByLabelText('역할 매핑: 구매사'), 'buyer');
    await userEvent.selectOptions(screen.getByLabelText('역할 매핑: PG'), 'pg');
    await userEvent.click(screen.getByRole('button', { name: '템플릿 저장' }));

    await waitFor(() => expect(linkSigningTemplateAction).toHaveBeenCalled());
    const arg = (linkSigningTemplateAction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.snowsignTemplateId).toBe('tmpl_manual');
    expect(arg.roleMapping).toEqual({ 구매사: 'buyer', PG: 'pg' });
  });
});
