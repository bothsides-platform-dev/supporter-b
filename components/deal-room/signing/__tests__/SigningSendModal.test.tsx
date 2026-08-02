import type { ComponentProps } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { SigningSendModal } from '../SigningSendModal';

const IFRAME_SRC = 'https://app.snowsign.example/embed/abc';
const FRAME_TITLE = '스노우싸인 계약서 발송';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal(overrides: Partial<ComponentProps<typeof SigningSendModal>> = {}) {
  const onClose = vi.fn();
  const view = render(
    <SigningSendModal
      iframeUrl={IFRAME_SRC}
      onComplete={vi.fn(async () => true)}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onClose, view };
}

describe('SigningSendModal', () => {
  // 딜룸 모달은 Escape 를 router.back() 으로 매핑한다(DealRoomModal.tsx:58). 이 모달의
  // Escape 가 거기까지 새면 딜룸이 통째로 닫히고 작성 중인 계약서가 날아간다.
  it('Escape 가 바깥 Dialog 까지 전파되지 않는다', async () => {
    const outerOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DialogPrimitive.Root open onOpenChange={outerOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Popup>
            <SigningSendModal
              iframeUrl={IFRAME_SRC}
              onComplete={vi.fn(async () => true)}
              onClose={vi.fn()}
            />
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>,
    );

    await user.keyboard('{Escape}');

    expect(await screen.findByText('계약서 작성을 그만둘까요?')).toBeInTheDocument();
    expect(outerOpenChange).not.toHaveBeenCalled();
  });

  // 위 테스트의 한 단계 더 깊은 지점 — 확인창이 열린 상태의 Escape 다. 여기서 새면
  // 딜룸의 router.back() 이 돌아, 사용자가 "계속 작성" 을 고를 기회조차 없이
  // 작성 중인 계약서가 사라진다.
  it('확인창 위에서 Escape 를 눌러도 바깥 Dialog 까지 전파되지 않는다', async () => {
    const outerOpenChange = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DialogPrimitive.Root open onOpenChange={outerOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Popup>
            <SigningSendModal
              iframeUrl={IFRAME_SRC}
              onComplete={vi.fn(async () => true)}
              onClose={onClose}
            />
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>,
    );

    await user.click(screen.getByRole('button', { name: '닫기' }));
    await screen.findByText('계약서 작성을 그만둘까요?');

    await user.keyboard('{Escape}');

    // 확인창만 닫힌다.
    await waitFor(() =>
      expect(screen.queryByText('계약서 작성을 그만둘까요?')).not.toBeInTheDocument(),
    );
    // 모달과 iframe 은 살아 있고, 딜룸은 건드려지지 않았다.
    expect(screen.getByTitle(FRAME_TITLE)).toBeInTheDocument();
    expect(outerOpenChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('닫기 버튼은 바로 닫지 않고 확인을 받는다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(await screen.findByText('계약서 작성을 그만둘까요?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // 확인을 받는 동안에도 모달은 열려 있어야 한다 — 여기서 닫히면 작성물이 날아간다.
    expect(screen.getByTitle(FRAME_TITLE)).toBeInTheDocument();
  });

  it('백드롭 클릭도 바로 닫지 않고 확인을 받는다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByTestId('signing-send-backdrop'));

    expect(await screen.findByText('계약서 작성을 그만둘까요?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTitle(FRAME_TITLE)).toBeInTheDocument();
  });

  it('Escape 도 바로 닫지 않고 확인을 받는다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.keyboard('{Escape}');

    expect(await screen.findByText('계약서 작성을 그만둘까요?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  // 확인을 받는 의미가 여기 있다 — 되돌리면 작성물이 그대로 남아야 한다. iframe 이
  // 리마운트되면 스노우싸인 세션이 처음으로 돌아가 확인을 받은 보람이 없다.
  it('계속 작성하기를 고르면 iframe 이 리마운트되지 않는다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    const before = screen.getByTitle(FRAME_TITLE);

    await user.click(screen.getByRole('button', { name: '닫기' }));
    await user.click(await screen.findByRole('button', { name: '계속 작성하기' }));

    await waitFor(() =>
      expect(screen.queryByText('계약서 작성을 그만둘까요?')).not.toBeInTheDocument(),
    );
    expect(screen.getByTitle(FRAME_TITLE)).toBe(before);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('그만두기를 고르면 onClose 를 한 번 부른다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole('button', { name: '닫기' }));
    await user.click(await screen.findByRole('button', { name: '그만두기' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 리스 반납은 SigningTab 의 언마운트 effect 가 소유한다. 모달이 언마운트에서 또
  // onClose 를 부르면 죽은 토큰으로 반납이 두 번 나간다.
  it('언마운트만으로는 onClose 를 부르지 않는다', () => {
    const { onClose, view } = renderModal();
    view.unmount();
    expect(onClose).not.toHaveBeenCalled();
  });

  // 임베드는 참여자 프리필을 지원하지 않아 PG 가 수신자를 직접 타이핑한다. 오타 하나로
  // 엉뚱한 사람에게 계약이 나가므로 정확한 값이 눈앞에 있어야 한다.
  it('구매사 서명 담당자를 헤더에 보여준다', () => {
    renderModal({ buyerSigner: { name: '김구매', email: 'buyer@corp.com' } });
    expect(screen.getByText('buyer@corp.com')).toBeInTheDocument();
    expect(screen.getByText(/김구매/)).toBeInTheDocument();
  });
});
