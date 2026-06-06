import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// base-ui floating UI needs these in jsdom or it throws on mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

import { InfoTip } from '../info-tip';

afterEach(() => cleanup());

describe('InfoTip', () => {
  it('shows the term description when the icon is clicked', async () => {
    const user = userEvent.setup();
    render(<InfoTip term="정산주기" />);
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText(/판매대금/)).toBeInTheDocument();
  });

  it('does not submit a surrounding form when clicked', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <InfoTip term="정산주기" />
      </form>,
    );
    await user.click(screen.getByRole('button'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not bubble its click to a parent click handler', async () => {
    const onParentClick = vi.fn();
    const user = userEvent.setup();
    render(
      <div onClick={onParentClick}>
        <InfoTip term="정산주기" />
      </div>,
    );
    await user.click(screen.getByRole('button'));
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('renders nothing for an unknown term', () => {
    const { container } = render(<InfoTip term="없는키" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes an accessible label containing the term name', () => {
    render(<InfoTip term="정산주기" />);
    expect(screen.getByRole('button')).toHaveAccessibleName(/정산 주기/);
  });
});
