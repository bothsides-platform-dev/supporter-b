// useStringDraft — 키별 문자열 초안을 localStorage 에 동기 보존(디바운스 없음).
// 계약: 마운트 시 저장값 복원, 변경 시 즉시 기록, 빈 문자열이면 키 제거.

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useStringDraft } from '../useStringDraft';

beforeEach(() => localStorage.clear());

describe('useStringDraft', () => {
  it('initializes from localStorage on mount', () => {
    localStorage.setItem('chat-draft:c1', '작성 중');
    const { result } = renderHook(() => useStringDraft('chat-draft:c1'));
    expect(result.current[0]).toBe('작성 중');
  });

  it('defaults to empty string when nothing is stored', () => {
    const { result } = renderHook(() => useStringDraft('chat-draft:none'));
    expect(result.current[0]).toBe('');
  });

  it('persists synchronously on change', () => {
    const { result } = renderHook(() => useStringDraft('chat-draft:c1'));
    act(() => result.current[1]('안녕'));
    expect(result.current[0]).toBe('안녕');
    expect(localStorage.getItem('chat-draft:c1')).toBe('안녕');
  });

  it('removes the key when cleared to empty (e.g. after send)', () => {
    localStorage.setItem('chat-draft:c1', 'x');
    const { result } = renderHook(() => useStringDraft('chat-draft:c1'));
    act(() => result.current[1](''));
    expect(localStorage.getItem('chat-draft:c1')).toBeNull();
  });
});
