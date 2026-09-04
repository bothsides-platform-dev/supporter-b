import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToasterProvider } from '../Toaster';
import { toast, toastManager } from '@/lib/toast';

afterEach(() => {
  cleanup();
  toastManager.close();
});

describe('ToasterProvider', () => {
  it('토스트 액션을 실행한 뒤 닫기 콜백을 한 번 호출한다', async () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    render(
      <ToasterProvider>
        <div />
      </ToasterProvider>,
    );

    toast('파일을 삭제했어요', {
      action: { label: '되돌리기', onClick },
      onClose,
    });

    await userEvent.click(await screen.findByRole('button', { name: '되돌리기' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
