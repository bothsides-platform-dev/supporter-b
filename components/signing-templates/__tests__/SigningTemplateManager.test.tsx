import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// refresh 는 호이스팅해야 단언할 수 있다 — useRouter() 안에서 vi.fn() 을 만들면
// 호출마다 새 mock 이라 toHaveBeenCalled 가 영원히 false 다.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (m: string, o?: unknown) => toastMock(m, o) }));
const captureMock = vi.fn();
vi.mock('@/lib/observability/capture', () => ({
  captureActionError: (...a: unknown[]) => captureMock(...a),
}));
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
vi.mock('@/lib/server/actions/signing/renameSigningTemplateAction', () => ({
  renameSigningTemplateAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/server/actions/signing/deleteSigningTemplateAction', () => ({
  deleteSigningTemplateAction: vi.fn(async () => ({ ok: true })),
}));

import { SigningTemplateManager } from '../SigningTemplateManager';
import { issueSigningTemplateEmbedSessionAction } from '@/lib/server/actions/signing/issueSigningTemplateEmbedSessionAction';
import { getSigningTemplateDetailAction } from '@/lib/server/actions/signing/getSigningTemplateDetailAction';
import { linkSigningTemplateAction } from '@/lib/server/actions/signing/linkSigningTemplateAction';
import { renameSigningTemplateAction } from '@/lib/server/actions/signing/renameSigningTemplateAction';
import { deleteSigningTemplateAction } from '@/lib/server/actions/signing/deleteSigningTemplateAction';
import type { PgSigningTemplate } from '@/lib/types/signing';

afterEach(cleanup);

const issueMock = vi.mocked(issueSigningTemplateEmbedSessionAction);
const detailMock = vi.mocked(getSigningTemplateDetailAction);
const linkMock = vi.mocked(linkSigningTemplateAction);
const renameMock = vi.mocked(renameSigningTemplateAction);
const deleteMock = vi.mocked(deleteSigningTemplateAction);

beforeEach(() => {
  toastMock.mockClear();
  captureMock.mockClear();
  refresh.mockClear();
  issueMock.mockReset();
  detailMock.mockReset();
  linkMock.mockReset();
  issueMock.mockResolvedValue({
    ok: true,
    iframeUrl: 'https://app.snowsign.jtsnowball.com/embed/abc',
    sessionId: 's1',
  });
  detailMock.mockResolvedValue({
    ok: true,
    name: '표준 가맹계약서',
    roleNames: ['구매사', 'PG'],
    variables: [{ name: '정산주기', label: '정산 주기', required: true }],
  });
  linkMock.mockResolvedValue({ ok: true, templateId: 't_new' });
  renameMock.mockReset();
  deleteMock.mockReset();
  renameMock.mockResolvedValue({ ok: true });
  deleteMock.mockResolvedValue({ ok: true });
});

function tmpl(over: Partial<PgSigningTemplate> = {}): PgSigningTemplate {
  return {
    id: 't1',
    workspaceId: 'ws1',
    snowsignTemplateId: 'tmpl_9f3a',
    name: '표준 가맹계약서',
    roleMapping: { 구매사: 'buyer', PG: 'pg' },
    variableMapping: { 정산주기: 'bid.settleCycle', 수수료율: 'bid.settleLimit' },
    createdBy: 'u1',
    createdAt: '2026-04-01T00:00:00Z',
    ...over,
  };
}

describe('SigningTemplateManager', () => {
  it('빈 상태: 공유 EmptyState(제목·CTA)를 보여준다', () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    expect(screen.getByText('아직 등록한 계약서 템플릿이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '새 템플릿 만들기' })).toBeInTheDocument();
  });

  // 한 화면에 primary 액션 하나 — 견적 템플릿과 같은 규칙.
  it('빈 목록이면 헤더 액션을 감추고, 목록이 있으면 보여준다', () => {
    const { unmount } = render(<SigningTemplateManager initialTemplates={[]} />);
    expect(screen.queryByTestId('page-header-action')).not.toBeInTheDocument();
    unmount();
    render(<SigningTemplateManager initialTemplates={[tmpl()]} />);
    expect(screen.getByTestId('page-header-action')).toBeInTheDocument();
  });

  it('목록: 링크된 템플릿 이름·요약을 렌더한다', () => {
    render(<SigningTemplateManager initialTemplates={[tmpl()]} />);
    expect(screen.getByText('표준 가맹계약서')).toBeInTheDocument();
    expect(screen.getByText(/tmpl_9f3a/)).toBeInTheDocument();
    expect(screen.getByText(/역할 2/)).toBeInTheDocument();
    expect(screen.getByText(/변수 2/)).toBeInTheDocument();
  });

  it('템플릿 수를 헤더 카운트 칩으로 표시한다', () => {
    render(<SigningTemplateManager initialTemplates={[tmpl()]} />);
    expect(screen.getByTestId('page-header-count')).toHaveTextContent('1');
  });

  // 빈 화면에 "0" 칩이 뜨면 바로 아래 "아직 …없어요" 와 같은 말을 두 번 하는 셈이다.
  it('빈 목록이면 개수 칩을 띄우지 않는다', () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    expect(screen.queryByTestId('page-header-count')).not.toBeInTheDocument();
  });

  it('만들기 → 임베드 세션 발급 + iframe 렌더', async () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await waitFor(() => expect(issueSigningTemplateEmbedSessionAction).toHaveBeenCalled());
    const iframe = await screen.findByTitle('스노우싸인 계약서 등록');
    expect(iframe).toHaveAttribute('src', 'https://app.snowsign.jtsnowball.com/embed/abc');
  });

  it('수동 폴백: 등록 완료 → 템플릿 ID 입력 → detail 조회 → 매핑 폼', async () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
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
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
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

  // 세 액션은 try/catch 없이 await 했다 — 서버 액션이 throw 하면 busy 가 true 로
  // 남아 화면의 모든 버튼이 새로고침 전까지 영구 비활성이 된다.
  it('임베드 세션 발급이 throw 해도 버튼이 다시 눌린다', async () => {
    issueMock.mockRejectedValue(new Error('boom'));
    render(<SigningTemplateManager initialTemplates={[]} />);
    const cta = screen.getByRole('button', { name: '새 템플릿 만들기' });
    await userEvent.click(cta);
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(cta).toBeEnabled();
    expect(captureMock).toHaveBeenCalled();
  });

  // 취소가 헤더로 올라갔으므로 푸터의 중복은 없어야 한다 — 한 화면에 같은 액션 하나.
  it('매핑 화면에 취소 버튼이 하나만 있다', async () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await screen.findByTitle('스노우싸인 계약서 등록');
    await userEvent.click(screen.getByRole('button', { name: '등록을 마쳤어요' }));
    await userEvent.type(screen.getByLabelText('스노우싸인 템플릿 ID'), 'tmpl_manual');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('역할 매핑');

    expect(screen.getAllByRole('button', { name: '취소' })).toHaveLength(1);
  });

  // origin 파싱이 실패해 origin 이 '' 이 되면 가드가 통째로 건너뛰어져 임의 프레임이
  // goToMapping 을 부를 수 있었다 — fail-closed 여야 한다.
  it('다른 origin 의 postMessage 는 무시한다', async () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await screen.findByTitle('스노우싸인 계약서 등록');
    detailMock.mockClear();

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://evil.example',
        data: { type: 'template.created', template_id: 'tmpl_attacker' },
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(detailMock).not.toHaveBeenCalled();
  });

  // 이게 fail-closed 전환을 실제로 못박는 테스트다. 위의 '다른 origin' 케이스는
  // 픽스처 URL 이 항상 파싱돼 origin 이 truthy 라, 옛 `if (origin && …)` 가드에도
  // 똑같이 통과한다 — 회귀를 재현하려면 URL 파싱을 깨뜨려야 한다.
  it('iframeUrl 파싱이 실패하면 어떤 postMessage 도 받지 않는다', async () => {
    issueMock.mockResolvedValue({ ok: true, iframeUrl: 'not-a-url', sessionId: 's1' });
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await screen.findByTitle('스노우싸인 계약서 등록');
    detailMock.mockClear();

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: '',
        data: { type: 'template.created', template_id: 'tmpl_attacker' },
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(detailMock).not.toHaveBeenCalled();
  });

  it('임베드 origin 의 postMessage 는 매핑으로 넘어간다', async () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await screen.findByTitle('스노우싸인 계약서 등록');
    detailMock.mockClear();

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://app.snowsign.jtsnowball.com',
        data: { type: 'template.created', template_id: 'tmpl_auto' },
      }),
    );
    await waitFor(() =>
      expect(detailMock).toHaveBeenCalledWith({ snowsignTemplateId: 'tmpl_auto' }),
    );
  });

  // run() 의 핵심은 "throw 했다"(→ 일반 문구)와 "정상 응답인데 ok:false"(→ 코드별
  // 매핑 문구)를 가르는 것이다. throw 쪽만 잠겨 있어 !ok 쪽을 못박는다.
  it('임베드 세션 발급이 ok:false 면 코드별 문구로 알리고 화면을 안 넘긴다', async () => {
    issueMock.mockResolvedValue({ ok: false, error: 'SNOWSIGN_NO_KEY' });
    render(<SigningTemplateManager initialTemplates={[]} />);
    const cta = screen.getByRole('button', { name: '새 템플릿 만들기' });
    await userEvent.click(cta);
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        '전자서명 서비스 설정에 문제가 있어요. 잠시 후 다시 시도하거나 문의해 주세요.',
        { type: 'error' },
      ),
    );
    expect(screen.queryByTitle('스노우싸인 계약서 등록')).not.toBeInTheDocument();
    expect(cta).toBeEnabled();
  });

  it('템플릿 정보 조회가 throw 해도 다음 버튼이 다시 눌린다', async () => {
    detailMock.mockRejectedValue(new Error('boom'));
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await screen.findByTitle('스노우싸인 계약서 등록');
    await userEvent.click(screen.getByRole('button', { name: '등록을 마쳤어요' }));
    await userEvent.type(screen.getByLabelText('스노우싸인 템플릿 ID'), 'tmpl_manual');
    const next = screen.getByRole('button', { name: '다음' });
    await userEvent.click(next);
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('템플릿 정보를 불러오지 못했어요', { type: 'error' }),
    );
    expect(captureMock).toHaveBeenCalled();
    expect(next).toBeEnabled();
  });

  // 역할 매핑이 비면 서버까지 가지 않고 무엇이 빠졌는지 먼저 알려야 한다.
  it('구매사·PG 서명자를 다 지정하지 않으면 저장하지 않고 안내한다', async () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await screen.findByTitle('스노우싸인 계약서 등록');
    await userEvent.click(screen.getByRole('button', { name: '등록을 마쳤어요' }));
    await userEvent.type(screen.getByLabelText('스노우싸인 템플릿 ID'), 'tmpl_manual');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('역할 매핑');

    // 한쪽만 지정 — 양쪽(buyer·pg)이 다 있어야 통과다.
    await userEvent.selectOptions(screen.getByLabelText('역할 매핑: 구매사'), 'buyer');
    await userEvent.click(screen.getByRole('button', { name: '템플릿 저장' }));

    expect(toastMock).toHaveBeenCalledWith('구매사·PG 서명자를 모두 지정해 주세요.', {
      type: 'error',
    });
    expect(linkMock).not.toHaveBeenCalled();
  });

  it('저장에 성공하면 토스트 + 목록 복귀 + 새로고침', async () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await screen.findByTitle('스노우싸인 계약서 등록');
    await userEvent.click(screen.getByRole('button', { name: '등록을 마쳤어요' }));
    await userEvent.type(screen.getByLabelText('스노우싸인 템플릿 ID'), 'tmpl_manual');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('역할 매핑');
    await userEvent.selectOptions(screen.getByLabelText('역할 매핑: 구매사'), 'buyer');
    await userEvent.selectOptions(screen.getByLabelText('역할 매핑: PG'), 'pg');
    await userEvent.click(screen.getByRole('button', { name: '템플릿 저장' }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('계약서 템플릿을 저장했어요', { type: 'success' }),
    );
    expect(refresh).toHaveBeenCalled();
    // list 뷰로 돌아왔다 — 빈 상태가 다시 보인다.
    expect(await screen.findByText('아직 등록한 계약서 템플릿이 없어요')).toBeInTheDocument();
  });

  it('저장이 ok:false 면 코드별 문구로 알리고 매핑 화면에 머문다', async () => {
    linkMock.mockResolvedValue({ ok: false, error: 'TEMPLATE_ALREADY_LINKED' });
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await screen.findByTitle('스노우싸인 계약서 등록');
    await userEvent.click(screen.getByRole('button', { name: '등록을 마쳤어요' }));
    await userEvent.type(screen.getByLabelText('스노우싸인 템플릿 ID'), 'tmpl_manual');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('역할 매핑');
    await userEvent.selectOptions(screen.getByLabelText('역할 매핑: 구매사'), 'buyer');
    await userEvent.selectOptions(screen.getByLabelText('역할 매핑: PG'), 'pg');
    const saveBtn = screen.getByRole('button', { name: '템플릿 저장' });
    await userEvent.click(saveBtn);

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith('이미 다른 곳에서 사용 중인 템플릿이에요.', {
        type: 'error',
      }),
    );
    expect(screen.getByText('역할 매핑')).toBeInTheDocument();
    expect(saveBtn).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('템플릿 저장이 throw 해도 저장 버튼이 다시 눌린다', async () => {
    linkMock.mockRejectedValue(new Error('boom'));
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await screen.findByTitle('스노우싸인 계약서 등록');
    await userEvent.click(screen.getByRole('button', { name: '등록을 마쳤어요' }));
    await userEvent.type(screen.getByLabelText('스노우싸인 템플릿 ID'), 'tmpl_manual');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('역할 매핑');
    await userEvent.selectOptions(screen.getByLabelText('역할 매핑: 구매사'), 'buyer');
    await userEvent.selectOptions(screen.getByLabelText('역할 매핑: PG'), 'pg');

    const saveBtn = screen.getByRole('button', { name: '템플릿 저장' });
    await userEvent.click(saveBtn);
    await waitFor(() => expect(linkMock).toHaveBeenCalled());
    expect(saveBtn).toBeEnabled();
  });
});

describe('SigningTemplateManager — 기본 템플릿 개념 제거', () => {
  it('목록에 기본 칩을 보여주지 않는다', () => {
    render(<SigningTemplateManager initialTemplates={[tmpl()]} />);
    expect(screen.queryByText('기본')).not.toBeInTheDocument();
  });

  it('매핑 화면에 기본 템플릿 체크박스가 없고 저장 페이로드에도 isDefault 가 없다', async () => {
    render(<SigningTemplateManager initialTemplates={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '새 템플릿 만들기' }));
    await screen.findByTitle('스노우싸인 계약서 등록');
    await userEvent.click(screen.getByRole('button', { name: '등록을 마쳤어요' }));
    await userEvent.type(screen.getByLabelText('스노우싸인 템플릿 ID'), 'tmpl_manual');
    await userEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('역할 매핑');

    expect(screen.queryByLabelText(/기본 템플릿으로 사용/)).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('역할 매핑: 구매사'), 'buyer');
    await userEvent.selectOptions(screen.getByLabelText('역할 매핑: PG'), 'pg');
    await userEvent.click(screen.getByRole('button', { name: '템플릿 저장' }));

    await waitFor(() => expect(linkMock).toHaveBeenCalled());
    expect(linkMock.mock.calls[0][0]).not.toHaveProperty('isDefault');
  });
});

describe('SigningTemplateManager — 이름 변경 / 삭제', () => {
  async function openRowMenu() {
    render(<SigningTemplateManager initialTemplates={[tmpl()]} />);
    await userEvent.click(screen.getByRole('button', { name: '표준 가맹계약서 관리' }));
  }

  it('이름 바꾸기로 renameSigningTemplateAction 을 부른다', async () => {
    await openRowMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: '이름 바꾸기' }));

    const input = await screen.findByLabelText('템플릿 이름');
    await userEvent.clear(input);
    await userEvent.type(input, '가맹계약서 v3');
    await userEvent.click(screen.getByRole('button', { name: '바꿀게요' }));

    await waitFor(() => expect(renameMock).toHaveBeenCalledWith({ templateId: 't1', name: '가맹계약서 v3' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('빈 이름으로는 바꾸지 못한다', async () => {
    await openRowMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: '이름 바꾸기' }));
    const input = await screen.findByLabelText('템플릿 이름');
    await userEvent.clear(input);

    expect(screen.getByRole('button', { name: '바꿀게요' })).toBeDisabled();
    expect(renameMock).not.toHaveBeenCalled();
  });

  it('삭제는 확인창을 거치고, 이미 보낸 계약은 그대로라고 안내한다', async () => {
    await openRowMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: '삭제' }));

    expect(await screen.findByText(/이미 보낸 계약서와 서명 기록은 그대로 남아요/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '삭제할게요' }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith({ templateId: 't1' }));
    expect(refresh).toHaveBeenCalled();
  });

  // run() 게이트가 throw 를 삼키지 않으면 busy 가 true 로 굳어 화면 전체가 잠긴다.
  it('삭제 액션이 throw 해도 화면이 굳지 않는다', async () => {
    deleteMock.mockRejectedValue(new Error('boom'));
    await openRowMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: '삭제' }));
    await userEvent.click(screen.getByRole('button', { name: '삭제할게요' }));

    await waitFor(() => expect(captureMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '새 템플릿' })).toBeEnabled(),
    );
  });
});
