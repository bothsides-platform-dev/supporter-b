// useMentionPicker — TeamThreadView @멘션 컨트롤러. mention-input.ts 순수 함수(별도 테스트)를
// 감싸 상태/키보드 네비/선택/캐럿을 다룬다. 여기선 그 상태 배선을 고정한다.

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';

import { useMentionPicker } from '../useMentionPicker';

const members = [
  { userId: 'u1', name: 'Kim', joinedAt: '2026-01-01' },
  { userId: 'u2', name: 'Lee', joinedAt: '2026-01-02' },
];

function key(k: string) {
  return {
    key: k,
    shiftKey: false,
    preventDefault: () => {},
    nativeEvent: { isComposing: false },
  } as unknown as React.KeyboardEvent<HTMLTextAreaElement>;
}

function setup(draft = '', setDraft = vi.fn()) {
  const ref = { current: null } as RefObject<HTMLTextAreaElement | null>;
  const { result } = renderHook(() =>
    useMentionPicker({ teamMembers: members, viewerUserId: 'me', textareaRef: ref, draft, setDraft }),
  );
  return { result, setDraft };
}

describe('useMentionPicker', () => {
  it('opens the dropdown on an @-query and lists candidates', () => {
    const { result } = setup('@');
    act(() => result.current.onTextChange('@', 1));
    expect(result.current.dropdownVisible).toBe(true);
    expect(result.current.items.length).toBeGreaterThan(1);
  });

  it('closes the dropdown when there is no @-query', () => {
    const { result } = setup('hello');
    act(() => result.current.onTextChange('hello', 5));
    expect(result.current.dropdownVisible).toBe(false);
  });

  it('ArrowDown/ArrowUp cycle the active index and consume the key', () => {
    const { result } = setup('@');
    act(() => result.current.onTextChange('@', 1));
    let consumed = false;
    act(() => {
      consumed = result.current.onKeyDown(key('ArrowDown'));
    });
    expect(consumed).toBe(true);
    expect(result.current.activeIndex).toBe(1);
    act(() => result.current.onKeyDown(key('ArrowUp')));
    expect(result.current.activeIndex).toBe(0);
  });

  it('returns false from onKeyDown when the dropdown is closed (lets Enter send)', () => {
    const { result } = setup('hi');
    let consumed = true;
    act(() => {
      consumed = result.current.onKeyDown(key('Enter'));
    });
    expect(consumed).toBe(false);
  });

  it('Enter picks the active item: applies to draft, closes, consumes', () => {
    const setDraft = vi.fn();
    const { result } = setup('@K', setDraft);
    act(() => result.current.onTextChange('@K', 2));
    let consumed = false;
    act(() => {
      consumed = result.current.onKeyDown(key('Enter'));
    });
    expect(consumed).toBe(true);
    expect(setDraft).toHaveBeenCalled();
    expect(result.current.dropdownVisible).toBe(false);
  });

  it('Escape closes the dropdown and consumes the key', () => {
    const { result } = setup('@');
    act(() => result.current.onTextChange('@', 1));
    let consumed = false;
    act(() => {
      consumed = result.current.onKeyDown(key('Escape'));
    });
    expect(consumed).toBe(true);
    expect(result.current.dropdownVisible).toBe(false);
  });

  it('exposes nameById and duplicateNames for rendering', () => {
    const { result } = setup();
    expect(result.current.nameById.get('u1')).toBe('Kim');
    expect(result.current.duplicateNames.has('Kim')).toBe(false);
  });

  it('resolveBody returns plain text unchanged when nothing is tracked', () => {
    const { result } = setup();
    expect(result.current.resolveBody('plain text')).toBe('plain text');
  });
});
