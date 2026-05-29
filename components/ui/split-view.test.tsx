import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SplitView } from '@/components/ui/split-view';

// SplitView 의 패널 분기는 PeekBackdrop(client, next/navigation 사용)을 렌더한다.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/rfp',
  useSearchParams: () => new URLSearchParams('peek=P-2605-0042'),
}));

afterEach(cleanup);

describe('SplitView', () => {
  it('panel 없으면 list만 렌더', () => {
    render(<SplitView list={<div>목록</div>} />);
    expect(screen.getByText('목록')).toBeInTheDocument();
  });

  it('panel 있으면 list와 panel 모두 렌더', () => {
    render(<SplitView list={<div>목록</div>} panel={<div>패널</div>} />);
    expect(screen.getByText('목록')).toBeInTheDocument();
    expect(screen.getByText('패널')).toBeInTheDocument();
  });

  it('panel 있으면 flex 래퍼 렌더', () => {
    const { container } = render(
      <SplitView list={<div>목록</div>} panel={<div>패널</div>} />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('flex');
  });

  it('panel 있어도 목록을 w-60 레일로 감싸지 않는다 (reflow 없음)', () => {
    const { container } = render(
      <SplitView list={<div>목록</div>} panel={<div>패널</div>} />
    );
    expect(container.innerHTML).not.toContain('w-60');
  });

  it('패널은 absolute 오버레이로 렌더', () => {
    render(<SplitView list={<div>목록</div>} panel={<div>패널</div>} />);
    const panelWrapper = screen.getByText('패널').parentElement as HTMLElement;
    expect(panelWrapper.className).toContain('absolute');
  });
});
