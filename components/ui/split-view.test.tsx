import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplitView } from '@/components/ui/split-view';

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

  it('panel 있으면 flex row 래퍼 렌더', () => {
    const { container } = render(
      <SplitView list={<div>목록</div>} panel={<div>패널</div>} />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('flex');
  });
});
