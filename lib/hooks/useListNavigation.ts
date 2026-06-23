'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isEditable } from './keyboard-utils';

export type ListKeyHandlers = {
  onEnter?: (index: number) => void;
  onEdit?: (index: number) => void;
};

export function useListNavigation(length: number, handlers: ListKeyHandlers = {}) {
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
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const len = lengthRef.current;
      if (len === 0) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setStored((i) => Math.min(len - 1, Math.max(0, i) + (i < 0 ? 0 : 1)));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setStored((i) => Math.max(0, Math.max(0, i) - (i < 0 ? 0 : 1)));
      } else if (e.key === 'Enter') {
        const idx = activeRef.current;
        if (idx >= 0 && handlersRef.current.onEnter) {
          e.preventDefault();
          handlersRef.current.onEnter(idx);
        }
      } else if (e.key === 'e' || e.key === 'E') {
        const idx = activeRef.current;
        if (idx >= 0 && handlersRef.current.onEdit) {
          e.preventDefault();
          handlersRef.current.onEdit(idx);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return { active, setActive: setStored };
}
