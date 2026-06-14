import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DealRoomActionRail } from '../DealRoomActionRail';

afterEach(cleanup);

const icon = <svg data-testid="icon" />;

describe('DealRoomActionRail', () => {
  it('액션 라벨을 모두 버튼으로 렌더한다', () => {
    render(
      <DealRoomActionRail
        actions={[
          { id: 'award', label: '선정', icon, onSelect: () => {} },
          { id: 'requote', label: '재요청', icon, onSelect: () => {} },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: '선정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '재요청' })).toBeInTheDocument();
  });

  it('버튼 클릭 시 해당 onSelect 를 호출한다', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <DealRoomActionRail actions={[{ id: 'award', label: '선정', icon, onSelect }]} />,
    );
    await user.click(screen.getByRole('button', { name: '선정' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('disabled 액션은 비활성화되고 클릭해도 onSelect 가 호출되지 않는다', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <DealRoomActionRail
        actions={[{ id: 'award', label: '선정', icon, onSelect, disabled: true }]}
      />,
    );
    const btn = screen.getByRole('button', { name: '선정' });
    expect(btn).toBeDisabled();
    await user.click(btn).catch(() => {});
    expect(onSelect).not.toHaveBeenCalled();
  });
});
