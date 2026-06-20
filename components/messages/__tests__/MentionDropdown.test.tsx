import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MentionDropdown } from '../MentionDropdown';
import type { MentionItem } from '../mention-input';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';

afterEach(() => cleanup());

const items: MentionItem[] = [
  { kind: 'all' },
  { kind: 'member', userId: U1, name: '김민수', joinedAt: '2026-03-14T00:00:00.000Z', avatarUpdatedAt: null },
  { kind: 'member', userId: U2, name: '김민수', joinedAt: '2026-04-01T00:00:00.000Z', avatarUpdatedAt: null },
  { kind: 'member', userId: U3, name: '이영희', joinedAt: '2026-05-01T00:00:00.000Z', avatarUpdatedAt: null },
];

describe('MentionDropdown', () => {
  it('동명이인(김민수)에만 합류일자를 표시한다', () => {
    render(
      <MentionDropdown
        items={items}
        activeIndex={0}
        duplicateNames={new Set(['김민수'])}
        onPick={vi.fn()}
        onHover={vi.fn()}
      />,
    );
    // 김민수 2명 → 각각 합류일자(2026. 03. 14. / 2026. 04. 01.) 표시.
    expect(screen.getByText('2026. 03. 14.')).toBeInTheDocument();
    expect(screen.getByText('2026. 04. 01.')).toBeInTheDocument();
    // 이영희는 유일 → 합류일자 없음.
    expect(screen.queryByText('2026. 05. 01.')).not.toBeInTheDocument();
  });

  it('@전체 행과 아바타(이니셜)를 렌더', () => {
    render(
      <MentionDropdown items={items} activeIndex={1} duplicateNames={new Set()} onPick={vi.fn()} onHover={vi.fn()} />,
    );
    expect(screen.getByText('전체')).toBeInTheDocument();
    // 멤버 행은 이름 표시.
    expect(screen.getAllByText('김민수')).toHaveLength(2);
  });

  it('클릭 시 onPick(item) 호출', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(
      <MentionDropdown items={items} activeIndex={0} duplicateNames={new Set()} onPick={onPick} onHover={vi.fn()} />,
    );
    await user.click(screen.getByText('이영희'));
    expect(onPick).toHaveBeenCalledWith(items[3]);
  });
});

it('renders a member photo for a member item with avatarUpdatedAt', () => {
  const photoItems: MentionItem[] = [
    { kind: 'member', userId: 'u-3', name: '박멘션', joinedAt: '2026-06-01T00:00:00.000Z', avatarUpdatedAt: '2026-06-21T00:00:00.000Z' },
  ];
  render(<MentionDropdown items={photoItems} activeIndex={0} duplicateNames={new Set()} onPick={vi.fn()} onHover={vi.fn()} />);
  const img = screen.getByRole('img');
  expect(img).toHaveAttribute('src', `/api/user/u-3/avatar?v=${Date.parse('2026-06-21T00:00:00.000Z')}`);
});
