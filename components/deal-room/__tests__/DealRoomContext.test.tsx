// DealRoomContext — 한 딜룸 인스턴스로 스코프된 상태(상대방·탭). 전역 useChatRailStore
// (모듈 싱글턴, 딜룸 간 누수 footgun)를 대체한다. Provider 는 DealRoomShell 이 code 별로
// 마운트(key={code})하므로 딜룸을 옮기면 상태가 깨끗이 초기화된다.

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

import { DealRoomProvider, useDealRoom, type DealRoomCounterparty } from '../DealRoomContext';

const wrapper = ({ children }: { children: ReactNode }) => (
  <DealRoomProvider>{children}</DealRoomProvider>
);

describe('useDealRoom', () => {
  it('defaults to no counterparty and the counterparty tab', () => {
    const { result } = renderHook(() => useDealRoom(), { wrapper });
    expect(result.current.counterparty).toBeNull();
    expect(result.current.tab).toBe('counterparty');
  });

  it('setCounterparty updates the focused counterparty', () => {
    const { result } = renderHook(() => useDealRoom(), { wrapper });
    act(() =>
      result.current.setCounterparty({
        workspaceId: 'pg-1',
        name: 'OO페이',
        type: 'pg',
        logoUpdatedAt: null,
      }),
    );
    expect(result.current.counterparty).toEqual({
      workspaceId: 'pg-1',
      name: 'OO페이',
      type: 'pg',
      logoUpdatedAt: null,
    });
  });

  it('setTab switches the active tab', () => {
    const { result } = renderHook(() => useDealRoom(), { wrapper });
    act(() => result.current.setTab('team'));
    expect(result.current.tab).toBe('team');
  });

  it('throws when used outside a DealRoomProvider', () => {
    expect(() => renderHook(() => useDealRoom())).toThrow(/DealRoomProvider/);
  });

  it('DealRoomCounterparty includes logoUpdatedAt field', () => {
    const cp: DealRoomCounterparty = {
      workspaceId: 'w',
      name: 'N',
      type: 'pg',
      logoUpdatedAt: null,
    };
    expect(cp.logoUpdatedAt).toBeNull();
  });

  it('setCounterparty stores logoUpdatedAt value', () => {
    const { result } = renderHook(() => useDealRoom(), { wrapper });
    act(() =>
      result.current.setCounterparty({
        workspaceId: 'pg-1',
        name: 'OO페이',
        type: 'pg',
        logoUpdatedAt: '2024-01-01T00:00:00.000Z',
      }),
    );
    expect(result.current.counterparty?.logoUpdatedAt).toBe('2024-01-01T00:00:00.000Z');
  });
});
