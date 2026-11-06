import { useId, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getTabId, getTabPanelId, Tabs } from '../Tabs';

afterEach(cleanup);

const options = [
  { id: 'overview', label: '요청 조건' },
  { id: 'quotes', label: '견적 비교' },
  { id: 'contract', label: '계약' },
];

function Host({ onChange = () => {} }: { onChange?: (id: string) => void }) {
  const id = useId();
  const [active, setActive] = useState('overview');
  return <>
    <button>이전</button>
    <Tabs id={id} label="견적 상세" tabs={options} active={active} onChange={(value) => {
      onChange(value);
      setActive(value);
    }} />
    {options.map((tab) => (
      <div key={tab.id} id={getTabPanelId(id, tab.id)} role="tabpanel"
        aria-labelledby={getTabId(id, tab.id)} hidden={active !== tab.id} tabIndex={0}>
        {tab.label} 본문
      </div>
    ))}
    <button>다음</button>
  </>;
}

describe('Tabs — manual activation', () => {
  it('방향키/Home/End는 초점만 옮기고 Enter와 Space로 선택한다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    await user.tab();
    await user.tab();
    const first = screen.getByRole('tab', { name: '요청 조건' });
    const second = screen.getByRole('tab', { name: '견적 비교' });
    const last = screen.getByRole('tab', { name: '계약' });
    expect(first).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(last).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(first).toHaveFocus();
    await user.keyboard('{End}');
    expect(last).toHaveFocus();
    await user.keyboard('{Home}{ArrowRight}');
    expect(second).toHaveFocus();
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('요청 조건');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getAllByRole('tab').filter((tab) => tab.tabIndex === 0)).toEqual([second]);

    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('quotes');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('견적 비교');
    await user.keyboard('{ArrowRight} ');
    expect(onChange).toHaveBeenLastCalledWith('contract');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(last).toHaveAttribute('aria-selected', 'true');
  });

  it('Tab으로 목록을 빠져나가면 선택한 탭을 다음 진입점으로 사용한다', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.tab();
    await user.tab();
    await user.keyboard('{End}');
    await user.tab();
    expect(screen.getByRole('tabpanel')).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('tab', { name: '요청 조건' })).toHaveFocus();
    await user.click(screen.getByRole('tab', { name: '계약' }));
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('계약');
  });

  it('각 인스턴스의 탭 목록 이름과 탭/패널 연결이 구분된다', () => {
    render(<><Host /><Host /></>);
    const lists = screen.getAllByRole('tablist', { name: '견적 상세' });
    const ids = new Set<string>();
    for (const list of lists) {
      for (const tab of within(list).getAllByRole('tab')) {
        expect(ids.has(tab.id)).toBe(false);
        ids.add(tab.id);
        const panel = document.getElementById(tab.getAttribute('aria-controls')!);
        expect(panel).toHaveAttribute('role', 'tabpanel');
        expect(panel).toHaveAttribute('aria-labelledby', tab.id);
      }
    }
  });

  it('외부 선택 변경과 항목 제거 뒤에도 하나의 유효한 진입점이 남는다', () => {
    const view = render(<Tabs id="details" label="상세" tabs={options} active="overview" onChange={() => {}} />);
    view.rerender(<Tabs id="details" label="상세" tabs={options} active="contract" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: '계약' })).toHaveAttribute('tabindex', '0');
    view.rerender(<Tabs id="details" label="상세" tabs={options.slice(0, 2)} active="contract" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: '요청 조건' })).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('tab').filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
  });
});
