import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DealRoomCenter } from '../DealRoomCenter';

afterEach(cleanup);

const tabs = [
  { id: 'compare', label: '견적 비교', content: <p>비교 본문</p> },
  { id: 'request', label: '요청 조건', content: <p>요청 본문</p> },
];

describe('DealRoomCenter', () => {
  it('활성 탭의 본문만 렌더한다', () => {
    render(<DealRoomCenter tabs={tabs} activeId="compare" onChange={() => {}} />);
    expect(screen.getByText('비교 본문')).toBeInTheDocument();
    expect(screen.queryByText('요청 본문')).not.toBeInTheDocument();
  });

  it('탭 버튼을 모두 렌더하고 활성 탭에 aria-selected=true', () => {
    render(<DealRoomCenter tabs={tabs} activeId="request" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: '견적 비교' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: '요청 조건' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('요청 본문')).toBeInTheDocument();
  });

  it('탭 클릭 시 onChange(id) 를 호출한다', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DealRoomCenter tabs={tabs} activeId="compare" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: '요청 조건' }));
    expect(onChange).toHaveBeenCalledWith('request');
  });
});
