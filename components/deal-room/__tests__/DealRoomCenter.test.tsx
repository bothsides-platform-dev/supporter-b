import { useState } from 'react';
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

  // keepMounted 탭은 한 번 열리면 DOM 에 남는다. PG 가 계약 탭의 스노우싸인 임베드에
  // PDF 를 올리고 서명칸을 배치하던 중 '요청 조건'을 확인하러 탭을 옮기면, 언마운트가
  // iframe 을 통째로 죽여 그 수작업이 전부 사라진다(리스도 함께 반납된다).
  it('keepMounted 탭은 비활성이 돼도 언마운트하지 않고 숨긴다', async () => {
    const user = userEvent.setup();
    const keep = [
      { id: 'contract', label: '계약', content: <p>계약 본문</p>, keepMounted: true },
      { id: 'request', label: '요청 조건', content: <p>요청 본문</p> },
    ];
    function Host() {
      const [active, setActive] = useState('contract');
      return <DealRoomCenter tabs={keep} activeId={active} onChange={setActive} />;
    }
    render(<Host />);
    expect(screen.getByText('계약 본문')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: '요청 조건' }));
    expect(screen.getByText('요청 본문')).toBeVisible();
    // 살아 있되 보이지 않는다.
    const kept = screen.getByText('계약 본문');
    expect(kept).toBeInTheDocument();
    expect(kept).not.toBeVisible();
  });

  it('keepMounted 가 아닌 탭은 열기 전까지 마운트하지 않는다', () => {
    const keep = [
      { id: 'contract', label: '계약', content: <p>계약 본문</p>, keepMounted: true },
      { id: 'request', label: '요청 조건', content: <p>요청 본문</p> },
    ];
    render(<DealRoomCenter tabs={keep} activeId="contract" onChange={() => {}} />);
    expect(screen.queryByText('요청 본문')).not.toBeInTheDocument();
  });

  it('탭 바 wrapper 가 overflow-x-auto 로 소형 화면에서 가로 스크롤을 허용한다', () => {
    render(<DealRoomCenter tabs={tabs} activeId="compare" onChange={() => {}} />);
    const tablist = screen.getByRole('tablist');
    expect(tablist.parentElement?.className).toMatch(/overflow-x-auto/);
  });
});
