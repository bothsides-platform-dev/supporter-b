'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const SAVE_SUCCESS_CUE_MS = 800;

type SaveResult = { ok: boolean };

export function useSaveFeedback() {
  const [phase, setPhase] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const run = useCallback(
    async <T extends SaveResult>(action: () => Promise<T>, onSuccess: (result: T) => void) => {
      if (phase === 'saving') return null;
      setPhase('saving');
      try {
        const result = await action();
        if (!result.ok) {
          setPhase('idle');
          return result;
        }
        setPhase('saved');
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setPhase('idle');
          onSuccess(result);
        }, SAVE_SUCCESS_CUE_MS);
        return result;
      } catch (error) {
        setPhase('idle');
        throw error;
      }
    },
    [phase],
  );

  const complete = useCallback(<T,>(result: T, onSuccess: (result: T) => void) => {
    setPhase('saved');
    onSuccess(result);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setPhase('idle');
    }, SAVE_SUCCESS_CUE_MS);
  }, []);

  return { phase, run, complete };
}
