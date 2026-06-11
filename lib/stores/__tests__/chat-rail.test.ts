// chat-rail store — page→rail cross-boundary slot (header-actions 선례).
//
// RfpDetailContent는 RSC라 콜백 전달이 불가능하므로, FocusComparison('use
// client')이 포커스된 PG를 publish하고 ChatRail이 consume한다. open/tab은
// 토글·레일 헤더가 공유하는 UI 상태.

import { beforeEach, describe, expect, it } from 'vitest';

import { useChatRailStore } from '../chat-rail';

describe('useChatRailStore', () => {
  beforeEach(() => {
    useChatRailStore.getState().reset();
  });

  it('initial state: closed, counterparty tab, no counterparty', () => {
    const s = useChatRailStore.getState();
    expect(s.open).toBe(false);
    expect(s.tab).toBe('counterparty');
    expect(s.counterparty).toBeNull();
  });

  it('setOpen / setTab / setCounterparty update state', () => {
    const s = useChatRailStore.getState();
    s.setOpen(true);
    s.setTab('team');
    s.setCounterparty({ workspaceId: 'ws-1', name: 'OO페이', type: 'pg' });

    const next = useChatRailStore.getState();
    expect(next.open).toBe(true);
    expect(next.tab).toBe('team');
    expect(next.counterparty).toEqual({
      workspaceId: 'ws-1',
      name: 'OO페이',
      type: 'pg',
    });
  });

  it('reset restores the initial state (page unmount cleanup)', () => {
    const s = useChatRailStore.getState();
    s.setOpen(true);
    s.setTab('team');
    s.setCounterparty({ workspaceId: 'ws-1', name: 'OO페이', type: 'pg' });

    useChatRailStore.getState().reset();

    const next = useChatRailStore.getState();
    expect(next.open).toBe(false);
    expect(next.tab).toBe('counterparty');
    expect(next.counterparty).toBeNull();
  });
});
