'use client';

import { useState, useRef, useCallback } from 'react';
import { http } from '@/lib/http';

export type PgWorkspace = { id: string; name: string; displayName: string };

export function useLazyPgWorkspaces() {
  const [pgList, setPgList] = useState<PgWorkspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await http
        .get('/api/workspaces/search', { searchParams: { type: 'pg' } })
        .json<{ workspaces: PgWorkspace[] }>()
      setPgList(data.workspaces)
    } catch {
      loadedRef.current = false;
      setError('불러오기 실패. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { pgList, loading, error, load };
}
