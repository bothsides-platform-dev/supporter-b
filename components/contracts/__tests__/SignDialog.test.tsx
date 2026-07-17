import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SignDialog, type SignDialogProps } from '../SignDialog';
import {
  CONTRACT_CONSENT_TEXTS,
  CONTRACT_CONSENT_TEXT_VERSION,
} from '@/lib/types/contract-doc';

// base-ui Dialog(Popup)이 내부적으로 ResizeObserver 를 쓴다 — jsdom 스텁.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// jsdom canvas 미구현 — 타이핑 서명 PNG 를 고정값으로 돌려준다.
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

function setup(overrides: Partial<SignDialogProps> = {}) {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  render(
    <SignDialog
      open
      onOpenChange={onOpenChange}
      docCode="CT-2607-0001"
      docTitle="PG 가맹 계약서"
      signerName="김서명"
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { user, onSubmit, onOpenChange };
}

const CONFIRM_LABEL = '계약서 내용을 모두 확인했어요';
const AGREE_LABEL = '위 내용에 동의해요';
const submitBtn = () => screen.getByRole('button', { name: '서명 완료' });

describe('SignDialog', () => {
  it('renders the title, doc meta, guidance, and the versioned consent text', () => {
    setup();
    expect(screen.getByText('전자서명')).toBeInTheDocument();
    expect(screen.getByText('CT-2607-0001')).toBeInTheDocument();
    expect(screen.getByText('PG 가맹 계약서')).toBeInTheDocument();
    expect(screen.getByText('계약서 내용을 확인한 뒤 서명해 주세요.')).toBeInTheDocument();
    expect(
      screen.getByText(CONTRACT_CONSENT_TEXTS[CONTRACT_CONSENT_TEXT_VERSION]),
    ).toBeInTheDocument();
  });

  it('keeps 서명 완료 disabled until a signature and both consents are present', async () => {
    const { user } = setup();
    expect(submitBtn()).toBeDisabled(); // no signature, no consents

    await user.click(screen.getByRole('tab', { name: '입력' })); // pre-filled name -> signature present
    expect(submitBtn()).toBeDisabled(); // still no consents

    await user.click(screen.getByRole('checkbox', { name: CONFIRM_LABEL }));
    expect(submitBtn()).toBeDisabled(); // only one consent

    await user.click(screen.getByRole('checkbox', { name: AGREE_LABEL }));
    expect(submitBtn()).toBeEnabled(); // signature + both consents
  });

  it('submits the typed signature with method:type and a PNG data URL', async () => {
    const { user, onSubmit } = setup();

    await user.click(screen.getByRole('tab', { name: '입력' }));
    await user.click(screen.getByRole('checkbox', { name: CONFIRM_LABEL }));
    await user.click(screen.getByRole('checkbox', { name: AGREE_LABEL }));
    await user.click(submitBtn());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      imageDataUrl: expect.stringMatching(/^data:image\/png/),
      method: 'type',
    });
  });

  it('shows a loading label and disables both actions while submitting', () => {
    setup({ submitting: true });
    expect(screen.getByRole('button', { name: '서명 처리 중…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
  });

  it('calls onOpenChange(false) on cancel without submitting', async () => {
    const { user, onOpenChange, onSubmit } = setup();
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
