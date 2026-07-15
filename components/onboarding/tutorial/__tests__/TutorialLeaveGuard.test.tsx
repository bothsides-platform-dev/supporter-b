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

const updateOnboardingMock = vi.fn(async (_i: unknown) => ({ ok: true as const }));
vi.mock('@/lib/server/actions/onboarding/updateOnboardingAction', () => ({
  updateOnboardingAction: (i: unknown) => updateOnboardingMock(i),
}));

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
});
