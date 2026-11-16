'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isEditable } from './keyboard-utils';

export type ListKeyHandlers = {
  onEnter?: (index: number) => void;
  onEdit?: (index: number) => void;
  /**
   * 키(J/K·방향키)로 강조를 옮긴 직후에만 부른다. 목록이 줄어 강조 위치가 조정될 때는
   * 부르지 않으므로, 여기서 포커스를 옮겨도 검색창 같은 다른 곳의 포커스를 빼앗지 않는다.
   */
  onMove?: (index: number) => void;
};

export type ListNavigationOptions = {
  /**
   * false 면 키를 듣지 않는다. 같은 목록이 랜딩 데모에 임베드될 때처럼, 문서 전체의
   * 키 입력을 가로채면 안 되는 곳에서 끈다.
   */
  enabled?: boolean;
};

/**
 * 한글 자판에서는 같은 물리 키의 `e.key` 가 'ㅓ'·'ㅏ'·'ㄷ' 이 된다. 물리 키(`e.code`)로도
 * 판정해 입력 언어와 무관하게 같은 단축키가 동작하게 한다. Shift 를 누른 물리 키는 다른
 * 뜻일 수 있어 `e.code` 판정에서는 제외한다.
 */
function isKey(e: KeyboardEvent, letter: 'j' | 'k' | 'e'): boolean {
  if (e.key === letter) return true;
  if (letter === 'e' && e.key === 'E') return true;
  return !e.shiftKey && e.code === `Key${letter.toUpperCase()}`;
}

/**
 * Enter 는 버튼·링크가 스스로 처리한다. 목록 행이 강조된 채로 필터 칩·페이지 이동·확인창의
 * 버튼에서 Enter 를 누르면, 여기서 가로채 강조된 행을 열고 버튼은 눌리지 않았다.
 */
const INTERACTIVE =
  'button, a[href], summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"]';

/** 확인창·모달 안의 키는 그 창의 것이다 — 뒤에 깔린 목록이 반응하지 않는다. */
const DIALOG = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/** 방향키를 스스로 쓰는 위젯(탭·라디오 묶음·목록 상자·메뉴 등) 안에서는 방향키를 빼앗지 않는다. */
const ARROW_WIDGET =
  '[role="tablist"], [role="radiogroup"], [role="listbox"], [role="menu"], [role="menubar"], [role="grid"], [role="tree"], [role="slider"], [role="spinbutton"]';

export function useListNavigation(
  length: number,
  handlers: ListKeyHandlers = {},
  { enabled = true }: ListNavigationOptions = {},
) {
  const [stored, setStored] = useState(-1);
  const active = length === 0 ? -1 : stored < 0 ? -1 : Math.min(stored, length - 1);

  const handlersRef = useRef(handlers);
  const activeRef = useRef(active);
  const lengthRef = useRef(length);

  useLayoutEffect(() => {
    handlersRef.current = handlers;
    activeRef.current = active;
    lengthRef.current = length;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(DIALOG)) return;
      const len = lengthRef.current;
      if (len === 0) return;

      const arrow = e.key === 'ArrowDown' || e.key === 'ArrowUp';
      if (arrow && target?.closest(ARROW_WIDGET)) return;

      // 처음 누르면 첫 행, 그다음부터 한 칸씩. 목록이 줄어 잘린 위치(active)에서 출발한다.
      const move = (delta: 1 | -1) => {
        e.preventDefault();
        const current = activeRef.current;
        const next = current < 0 ? 0 : Math.min(len - 1, Math.max(0, current + delta));
        // 다시 그리기 전에 키가 반복돼도 다음 위치에서 출발하도록 바로 맞춘다.
        activeRef.current = next;
        setStored(next);
        handlersRef.current.onMove?.(next);
      };

      if (isKey(e, 'j') || e.key === 'ArrowDown') {
        move(1);
      } else if (isKey(e, 'k') || e.key === 'ArrowUp') {
        move(-1);
      } else if (e.key === 'Enter') {
        if (target?.closest(INTERACTIVE)) return;
        const idx = activeRef.current;
        if (idx >= 0 && handlersRef.current.onEnter) {
          e.preventDefault();
          handlersRef.current.onEnter(idx);
        }
      } else if (isKey(e, 'e')) {
        // E 는 버튼·링크의 기본 동작과 겹치지 않으므로 포커스 위치와 무관하게 단축키로 쓴다.
        const idx = activeRef.current;
        if (idx >= 0 && handlersRef.current.onEdit) {
          e.preventDefault();
          handlersRef.current.onEdit(idx);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled]);

  return { active, setActive: setStored };
}
