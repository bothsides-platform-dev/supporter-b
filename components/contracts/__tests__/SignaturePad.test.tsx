import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SignaturePad } from '../SignaturePad';

// jsdom 은 canvas 2D 를 구현하지 않는다 — getContext 는 스텁을, toDataURL 은 고정 PNG 를 돌려준다.
function makeCtxStub() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeCtxStub() as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,SIG');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SignaturePad', () => {
  it('renders draw and type tabs, defaulting to draw', () => {
    render(<SignaturePad name="김서명" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: '그리기' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '입력' })).toHaveAttribute('aria-selected', 'false');
  });

  it('reveals a name input seeded with `name` and emits a typed signature on tab switch', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SignaturePad name="김서명" onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: '입력' }));

    expect(screen.getByRole('textbox')).toHaveValue('김서명');
    expect(onChange).toHaveBeenLastCalledWith({
      imageDataUrl: 'data:image/png;base64,SIG',
      method: 'type',
    });
  });

  it('emits a null value when the typed name is cleared', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SignaturePad name="김서명" onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: '입력' }));
    await user.clear(screen.getByRole('textbox'));

    expect(onChange).toHaveBeenLastCalledWith({ imageDataUrl: null, method: 'type' });
  });

  it('emits the typed signature as the user types', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SignaturePad name="" onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: '입력' }));
    await user.type(screen.getByRole('textbox'), '홍길동');

    expect(onChange).toHaveBeenLastCalledWith({
      imageDataUrl: 'data:image/png;base64,SIG',
      method: 'type',
    });
  });

  it('exposes a "다시 그리기" control in draw mode', () => {
    render(<SignaturePad name="김서명" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '다시 그리기' })).toBeInTheDocument();
  });
});
