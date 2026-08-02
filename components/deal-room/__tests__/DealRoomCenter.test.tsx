import { useEffect, useState } from 'react';
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

  // toBeInTheDocument + not.toBeVisible 만으로는 부족하다 — 재마운트돼도 둘 다 참이라
  // '유지'를 전혀 보장하지 못한다. 실제로 그 함정에 빠져 동작하지 않는 구현이 통과했다.
  // 마운트 횟수가 유일하게 정직한 신호다.
  it('keepMounted 탭은 탭을 옮겨도 재마운트되지 않는다', async () => {
    const user = userEvent.setup();
    let mounts = 0;
    function Probe() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <p>프로브</p>;
    }
    const keep = [
      { id: 'contract', label: '계약', content: <Probe />, keepMounted: true },
      { id: 'request', label: '요청 조건', content: <p>요청 본문</p> },
    ];
    function Host() {
      const [active, setActive] = useState('contract');
      return <DealRoomCenter tabs={keep} activeId={active} onChange={setActive} />;
    }
    render(<Host />);
    expect(mounts).toBe(1);
    await user.click(screen.getByRole('tab', { name: '요청 조건' }));
    expect(mounts).toBe(1);
    await user.click(screen.getByRole('tab', { name: '계약' }));
    expect(mounts).toBe(1);
  });

  // seen 게이트를 실제로 건드리려면 **양쪽 다** keepMounted 여야 한다. 한쪽만 켜면
  // 그 탭은 filter 의 첫 항(활성)에서 걸러져 seen 을 지워도 초록이다.
  it('열어본 적 없는 keepMounted 탭은 마운트하지 않는다', () => {
    const keep = [
      { id: 'a', label: 'A', content: <p>A 본문</p>, keepMounted: true },
      { id: 'b', label: 'B', content: <p>B 본문</p>, keepMounted: true },
    ];
    render(<DealRoomCenter tabs={keep} activeId="a" onChange={() => {}} />);
    expect(screen.queryByText('B 본문')).not.toBeInTheDocument();
  });

  it('탭 바 wrapper 가 overflow-x-auto 로 소형 화면에서 가로 스크롤을 허용한다', () => {
    render(<DealRoomCenter tabs={tabs} activeId="compare" onChange={() => {}} />);
    const tablist = screen.getByRole('tablist');
    expect(tablist.parentElement?.className).toMatch(/overflow-x-auto/);
  });
});
