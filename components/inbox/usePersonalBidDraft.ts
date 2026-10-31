'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteBidDraftAction,
  loadBidDraftAction,
  saveBidDraftAction,
} from '@/lib/server/actions/bid-drafts';
import { BidDraftSchema, type BidDraftScope, type SavedBidDraft } from '@/lib/quote/draft-schema';
import { EMPTY_BID_DRAFT, type BidDraft } from '@/lib/quote/bid-draft';

export const personalDraftKey = (s: BidDraftScope) =>
  `bid-draft:v4:${s.userId}:${s.workspaceId}:${s.rfpId}:${s.roundKey}`;
type Recovery = { revision: number; content: BidDraft };
export function readPersonalRecovery(key: string): Recovery | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (raw && Number.isInteger(raw.revision) && BidDraftSchema.safeParse(raw.content).success)
      return raw;
  } catch {
    /* Keep damaged/unreadable originals; never delete on failed reads. */
  }
  return null;
}

/** Shared by modal close/previous/next and ordinary links. The form owns the reviewable dialog. */
export function leaveBidDraft(proceed: () => void) {
  const event = new CustomEvent('bid-draft-leave', {
    cancelable: true,
    detail: proceed,
  });
  if (window.dispatchEvent(event)) proceed();
}

export function usePersonalBidDraft(
  scope: BidDraftScope | undefined,
  initial: SavedBidDraft | null | undefined,
  readOnly = false,
) {
  const key = scope ? personalDraftKey(scope) : '';
  const [local] = useState(() => (key ? readPersonalRecovery(key) : null));
  const [draft] = useState(() => local?.content ?? initial?.content ?? null);
  const [conflict, setConflict] = useState<SavedBidDraft | null | undefined>(() =>
    local && local.revision !== (initial?.revision ?? 0) ? (initial ?? null) : undefined,
  );
  const conflictRef = useRef(conflict !== undefined);
  const revision = useRef(initial?.revision ?? 0);
  const latest = useRef<BidDraft | null>(draft);
  const lastSaved = useRef(initial ?? null);
  const saved = useRef(initial ? JSON.stringify(initial.content) : '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<SavedBidDraft | null> | null>(null);
  const consumed = useRef(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [leave, setLeave] = useState<(() => void) | null>(null);

  const preserve = useCallback(() => {
    if (!key || !latest.current || consumed.current) return true;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ revision: revision.current, content: latest.current }),
      );
      return true;
    } catch {
      return false;
    }
  }, [key]);

  const flush = useCallback(async (): Promise<SavedBidDraft | null> => {
    if (timer.current) clearTimeout(timer.current);
    if (!scope || readOnly || consumed.current || conflictRef.current || !latest.current)
      return null;
    while (inFlight.current) {
      const active = inFlight.current;
      await active;
      if (inFlight.current === active) inFlight.current = null;
    }
    if (consumed.current || conflictRef.current) return null;
    if (saved.current === JSON.stringify(latest.current)) return lastSaved.current;
    const content = latest.current;
    if (!content) return null;
    const localOk = preserve();
    setStatus('저장 중…');
    setError(null);
    const job = (async () => {
      try {
        const result = await saveBidDraftAction(scope, content, revision.current);
        if (!result.ok) {
          if (result.error === 'DRAFT_CONFLICT') {
            conflictRef.current = true;
            const server = await loadBidDraftAction(scope);
            setConflict(server.ok ? server.draft : null);
          }
          setError(result.error);
          setStatus(localOk ? '이 브라우저에만 보관했어요' : '저장하지 못했어요');
          return null;
        }
        lastSaved.current = result.draft;
        revision.current = result.draft.revision;
        saved.current = JSON.stringify(content);
        preserve();
        setStatus(
          saved.current === JSON.stringify(latest.current)
            ? '계정에 저장했어요'
            : '이 브라우저에만 보관했어요',
        );
        return result.draft;
      } catch {
        setError('DRAFT_SAVE_FAILED');
        setStatus(localOk ? '이 브라우저에만 보관했어요' : '저장하지 못했어요');
        return null;
      }
    })();
    inFlight.current = job;
    try {
      return await job;
    } finally {
      if (inFlight.current === job) inFlight.current = null;
    }
  }, [scope, readOnly, preserve]);

  const saveDraft = useCallback(
    (content: BidDraft) => {
      if (!scope || consumed.current || readOnly) return;
      latest.current = content;
      const localOk = preserve();
      if (timer.current) clearTimeout(timer.current);
      if (saved.current === JSON.stringify(content)) {
        setStatus('계정에 저장했어요');
        return;
      }
      setStatus(localOk ? '이 브라우저에만 보관했어요' : '저장하지 못했어요');
      if (!conflictRef.current)
        timer.current = setTimeout(() => {
          void flush();
        }, 800);
    },
    [scope, readOnly, preserve, flush],
  );

  const resolveConflict = async (useServer: boolean): Promise<BidDraft | null> => {
    if (!scope) return null;
    const result = await loadBidDraftAction(scope);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    if (result.draft?.submittedBidId || result.readOnly) {
      setError('DRAFT_READ_ONLY');
      return null;
    }
    // The user reviewed this exact revision. A changed server copy requires another review.
    if (result.draft?.revision !== conflict?.revision) {
      setConflict(result.draft);
      return null;
    }
    lastSaved.current = result.draft;
    revision.current = result.draft?.revision ?? 0;
    if (useServer) {
      latest.current = result.draft?.content ?? { ...EMPTY_BID_DRAFT };
      saved.current = result.draft ? JSON.stringify(result.draft.content) : '';
    }
    conflictRef.current = false;
    setConflict(undefined);
    setError(null);
    preserve();
    if (!useServer) await flush();
    return useServer ? latest.current : null;
  };

  const clearDraft = useCallback(async () => {
    if (!scope) return true;
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    if (revision.current) {
      const result = await deleteBidDraftAction(scope, revision.current);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
    }
    try {
      localStorage.removeItem(key);
    } catch {
      setError('LOCAL_DELETE_FAILED');
      return false;
    }
    lastSaved.current = null;
    revision.current = 0;
    latest.current = null;
    saved.current = '';
    setStatus('');
    return true;
  }, [scope, key]);
  const markSubmitted = useCallback(() => {
    consumed.current = true;
    latest.current = null;
    if (timer.current) clearTimeout(timer.current);
    try {
      localStorage.removeItem(key);
    } catch {
      /* Server receipt wins over stale local recovery. */
    }
  }, [key]);

  useEffect(() => {
    if (!scope) return;
    const dirty = () =>
      !consumed.current && !!latest.current && JSON.stringify(latest.current) !== saved.current;
    const unload = (event: BeforeUnloadEvent) => {
      preserve();
      if (dirty()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const guard = (event: Event) => {
      if (!dirty()) return;
      preserve();
      event.preventDefault();
      setLeave(() => (event as CustomEvent<() => void>).detail);
    };
    const links = (event: MouseEvent) => {
      if (
        !dirty() ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.button !== 0
      )
        return;
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (
        !link ||
        link.target === '_blank' ||
        link.download ||
        link.href === location.href ||
        link.getAttribute('href')?.startsWith('#')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      preserve();
      setLeave(() => () => {
        location.href = link.href;
      });
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== key || !dirty()) return;
      // Never replace live inputs due to a storage event from another tab.
      conflictRef.current = true;
      void loadBidDraftAction(scope)
        .then((r) => {
          setConflict(r.ok ? r.draft : null);
        })
        .catch(() => {
          setConflict(null);
          setError('DRAFT_SAVE_FAILED');
        });
    };
    const navigate = (event: NavigateEvent) => {
      if (!dirty() || !event.cancelable || event.navigationType !== 'traverse') return;
      preserve();
      event.preventDefault();
      const destination = event.destination.key;
      setLeave(() => () => {
        void window.navigation.traverseTo(destination);
      });
    };
    const hide = () => {
      preserve();
    };
    window.navigation?.addEventListener('navigate', navigate);
    window.addEventListener('beforeunload', unload);
    window.addEventListener('pagehide', hide);
    window.addEventListener('bid-draft-leave', guard);
    window.addEventListener('storage', storage);
    document.addEventListener('click', links, true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      preserve();
      window.navigation?.removeEventListener('navigate', navigate);
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('bid-draft-leave', guard);
      window.removeEventListener('storage', storage);
      document.removeEventListener('click', links, true);
    };
  }, [scope, key, preserve]);

  return {
    draft,
    status,
    error,
    conflict,
    saveDraft,
    flush,
    clearDraft,
    markSubmitted,
    resolveConflict,
    leave,
    cancelLeave: () => setLeave(null),
    confirmLeave: () => {
      preserve();
      consumed.current = true;
      leave?.();
    },
    preserve,
  };
}
