import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PgWorkspacePanels } from '../PgWorkspacePanels';
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
afterEach(cleanup);
function Example() {
  const [active, setActive] = useState('write');
  return <PgWorkspacePanels active={active} onChange={setActive} writeLabel="견적 작성"
    request={<p>요청 내용과 첨부</p>} work={<input aria-label="수수료" defaultValue="" />} />;
}
it('요청 정보를 확인해도 작성 입력과 스크롤 컨테이너를 유지한다', async () => {
  const user = userEvent.setup();
  render(<Example />);
  const input = screen.getByRole('textbox');
  const panel = screen.getByRole('tabpanel', { name: '견적 작성' });
  await user.type(input, '1.25');
  panel.scrollTop = 120;
  fireEvent.scroll(panel);
  await user.click(screen.getByRole('tab', { name: '요청 조건' }));
  await user.click(screen.getByRole('tab', { name: '견적 작성' }));
  expect(screen.getByRole('textbox')).toBe(input);
  expect(input).toHaveValue('1.25');
  expect(screen.getByRole('tabpanel', { name: '견적 작성' })).toBe(panel);
  expect(panel.scrollTop).toBe(120);
});
it('화살표 키로 탭을 전환하고 연결된 영역을 표시한다', async () => {
  render(<Example />);
  const write = screen.getByRole('tab', { name: '견적 작성' });
  write.focus();
  fireEvent.keyDown(write, { key: 'ArrowLeft' });
  expect(screen.getByRole('tab', { name: '요청 조건' })).toHaveFocus();
  expect(screen.getByRole('tabpanel', { name: '요청 조건' })).toHaveTextContent('요청 내용과 첨부');
});
