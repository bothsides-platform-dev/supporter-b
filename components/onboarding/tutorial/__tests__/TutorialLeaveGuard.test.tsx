import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const updateOnboardingMock = vi.fn(
  async (_i: unknown): Promise<{ ok: boolean; error?: string }> => ({ ok: true }),
);
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (i: unknown) => updateOnboardingMock(i),
}));

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({ toast: (...args: unknown[]) => toastMock(...args) }));
vi.mock('@/lib/observability/capture', () => ({ captureActionError: vi.fn() }));

import { TutorialLeaveGuard } from '../TutorialLeaveGuard';

// jsdom은 실제 내비게이션이 없으므로 pass-through 케이스의 콘솔 에러를 막기 위해
// 링크에 버블 단계 preventDefault를 단다(가드는 capture 단계라 영향 없음).
function renderWithLink(
  href: string,
  attrs: Record<string, string> = {},
  variant: 'buyer' | 'pg' = 'buyer',
) {
  render(<TutorialLeaveGuard variant={variant} />);
  const a = document.createElement('a');
  a.href = href;
  a.textContent = 'link';
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.addEventListener('click', (e) => e.preventDefault());
  document.body.appendChild(a);
  return a;
}

beforeEach(() => {
  pushMock.mockClear();
  updateOnboardingMock.mockClear();
  toastMock.mockClear();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('TutorialLeaveGuard', () => {
  it('/tutorial 밖 내부 링크 클릭을 가로채 확인 다이얼로그를 띄운다', async () => {
    const a = renderWithLink('/quote-templates');
    await userEvent.click(a);
    expect(await screen.findByText('튜토리얼을 나갈까요?')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('나중에 하기 → dismissed 스탬프 후 목적지로 이동한다', async () => {
    const a = renderWithLink('/home');
    await userEvent.click(a);
    await userEvent.click(await screen.findByRole('button', { name: '나중에 하기' }));
    expect(updateOnboardingMock).toHaveBeenCalledWith({ key: 'buyerTutorial', event: 'dismissed' });
    expect(pushMock).toHaveBeenCalledWith('/home');
  });

  it('pg variant: 나중에 하기 → pgTutorial 키로 dismissed 스탬프 후 목적지로 이동한다', async () => {
    const a = renderWithLink('/home', {}, 'pg');
    await userEvent.click(a);
    await userEvent.click(await screen.findByRole('button', { name: '나중에 하기' }));
    expect(updateOnboardingMock).toHaveBeenCalledWith({ key: 'pgTutorial', event: 'dismissed' });
    expect(pushMock).toHaveBeenCalledWith('/home');
  });

  it('건너뛰기 → completed 스탬프 후 목적지로 이동한다', async () => {
    const a = renderWithLink('/rfp');
    await userEvent.click(a);
    await userEvent.click(await screen.findByRole('button', { name: '건너뛰기' }));
    expect(updateOnboardingMock).toHaveBeenCalledWith({ key: 'buyerTutorial', event: 'completed' });
    expect(pushMock).toHaveBeenCalledWith('/rfp');
  });

  it('스탬프가 {ok:false}로 실패해도 이동은 진행되고 에러 토스트로 알린다', async () => {
    updateOnboardingMock.mockImplementationOnce(async () => ({
      ok: false,
      error: 'FORBIDDEN_BUYER',
    }));
    const a = renderWithLink('/home');
    await userEvent.click(a);
    await userEvent.click(await screen.findByRole('button', { name: '나중에 하기' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/home'));
    expect(toastMock).toHaveBeenCalledWith('체험 기록을 저장하지 못했어요', { type: 'error' });
  });

  // stamp-then-move — 같은 틱 push 는 /home RSC 읽기가 쓰기를 앞질러 환영 모달을
  // 재노출시킬 수 있다. await 를 지우면 이 테스트가 잡는다(순서 단언).
  it('이동은 스탬프 쓰기가 settle 된 뒤에만 일어난다 (stamp-then-move)', async () => {
    let resolveAction!: (v: { ok: boolean }) => void;
    updateOnboardingMock.mockImplementationOnce(
      () =>
        new Promise<{ ok: boolean }>((res) => {
          resolveAction = res;
        }),
    );
    const a = renderWithLink('/home');
    await userEvent.click(a);
    await userEvent.click(await screen.findByRole('button', { name: '나중에 하기' }));

    expect(updateOnboardingMock).toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled(); // settle 전 push 금지

    resolveAction({ ok: true });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/home'));
  });

  it('계속 체험하기 → 잔류(스탬프·이동 없음)', async () => {
    const a = renderWithLink('/home');
    await userEvent.click(a);
    await userEvent.click(await screen.findByRole('button', { name: '계속 체험하기' }));
    await waitFor(() =>
      expect(screen.queryByText('튜토리얼을 나갈까요?')).not.toBeInTheDocument(),
    );
    expect(updateOnboardingMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('/tutorial 내부 링크·수정키 클릭·target=_blank는 가로채지 않는다', async () => {
    const inTutorial = renderWithLink('/tutorial');
    await userEvent.click(inTutorial);
    expect(screen.queryByText('튜토리얼을 나갈까요?')).not.toBeInTheDocument();

    const blank = document.createElement('a');
    blank.href = '/home';
    blank.setAttribute('target', '_blank');
    blank.textContent = 'blank';
    blank.addEventListener('click', (e) => e.preventDefault());
    document.body.appendChild(blank);
    await userEvent.click(blank);
    expect(screen.queryByText('튜토리얼을 나갈까요?')).not.toBeInTheDocument();

    const meta = document.createElement('a');
    meta.href = '/home';
    meta.textContent = 'meta';
    meta.addEventListener('click', (e) => e.preventDefault());
    document.body.appendChild(meta);
    const user = userEvent.setup();
    await user.keyboard('{Meta>}');
    await user.click(meta);
    await user.keyboard('{/Meta}');
    expect(screen.queryByText('튜토리얼을 나갈까요?')).not.toBeInTheDocument();
  });

  it('외부 URL(http로 시작) 링크는 가로채지 않는다', async () => {
    const a = renderWithLink('https://example.com');
    await userEvent.click(a);
    expect(screen.queryByText('튜토리얼을 나갈까요?')).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  // protocol-relative(//host)는 '/'로 시작하지만 외부 오리진이다 — 내부로 오판해
  // 가로채면 [나중에 하기/건너뛰기]가 router.push('//evil…')로 외부 이동까지
  // 수행하게 된다. 백슬래시 변형(/\host)도 브라우저가 //로 정규화하므로 함께 거부.
  it('protocol-relative(//host) href는 가로채지 않는다', async () => {
    const a = renderWithLink('//evil.example.com/path');
    await userEvent.click(a);
    expect(screen.queryByText('튜토리얼을 나갈까요?')).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('백슬래시 변형(/\\host) href는 가로채지 않는다', async () => {
    const a = renderWithLink('/\\evil.example.com/path');
    await userEvent.click(a);
    expect(screen.queryByText('튜토리얼을 나갈까요?')).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('download 속성이 있는 내부 링크는 가로채지 않는다', async () => {
    const a = renderWithLink('/home', { download: '' });
    await userEvent.click(a);
    expect(screen.queryByText('튜토리얼을 나갈까요?')).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('Esc로 닫으면 스탬프·이동 없이 dialog만 닫히고, 같은 링크 재클릭 시 다시 열린다', async () => {
    const a = renderWithLink('/home');
    await userEvent.click(a);
    expect(await screen.findByText('튜토리얼을 나갈까요?')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByText('튜토리얼을 나갈까요?')).not.toBeInTheDocument(),
    );
    expect(updateOnboardingMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();

    // pendingHref가 비워졌으므로 가드는 여전히 무장 상태 — 같은 링크 재클릭 시 다시 열린다.
    await userEvent.click(a);
    expect(await screen.findByText('튜토리얼을 나갈까요?')).toBeInTheDocument();
  });
});
