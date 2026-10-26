'use client';
import { useEffect, useState } from 'react';
import { createStore, type StoreApi } from 'zustand';
import { useRfpDraftStore, type RfpDraftStore } from '@/lib/stores/rfp-draft';
import {
  createGuestDraft,
  deleteGuestDraft,
  draftData,
  loadGuestDraft,
  saveGuestDraft,
  type GuestDraft,
  type DraftData,
} from '@/lib/guest-rfp/draft';
// Browser persistence controller, intentionally separate from React render snapshots.
export class GuestSession {
  readonly store: StoreApi<RfpDraftStore>;
  readonly pendingFiles = new Map<string, File>();
  stop = () => {};
  private applyingEdit = false;
  constructor(
    readonly draft: GuestDraft,
    private readonly onError: (message: string) => void,
    private readonly onSave?: (status: 'saved' | 'error') => void,
  ) {
    this.store = createStore<RfpDraftStore>((set) => ({
      ...draft.data,
      setField: (key, value) => set({ [key]: value }),
      reset: () => set(draftData(useRfpDraftStore.getInitialState())),
    }));
  }
  save = () => {
    if (this.applyingEdit) return;
    this.draft.data = draftData(this.store.getState());
    try {
      saveGuestDraft(this.draft);
      this.onSave?.('saved');
    } catch (e) {
      this.onSave?.('error');
      throw e;
    }
    this.onError('');
  };
  commitEdit(data: DraftData) {
    const candidate = { ...this.draft, data: { ...data, contentQuestion: this.draft.data.contentQuestion } };
    saveGuestDraft(candidate);
    Object.assign(this.draft, candidate);
    this.applyingEdit = true;
    try {
      this.store.setState(candidate.data);
    } finally {
      this.applyingEdit = false;
    }
    this.onSave?.('saved');
    this.onError('');
  }
  restartAfterCancellation() {
    deleteGuestDraft(this.draft);
    this.draft.id = crypto.randomUUID();
    this.draft.revision = 0;
    delete this.draft.serverRevision;
    delete this.draft.owner;
    this.save();
  }
  complete() {
    this.draft.completed = true;
    this.save();
  }
  invalidateUploads(validIds: string[]) {
    for (const file of this.draft.files)
      if (file.uploaded && !validIds.includes(file.uploaded.id))
        delete file.uploaded;
  }
}
export function useGuestDraft(create: boolean) {
  const [session, setSession] = useState<GuestSession | null>(null);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  useEffect(() => {
    let session: GuestSession | undefined;
    // Browser storage is unavailable during SSR. Hydrate once after mounting.
    const hydrate = () => {
      try {
        const draft = loadGuestDraft() ?? (create ? createGuestDraft() : null);
        if (!draft) {
          setError(
            '이어 쓸 초안을 찾지 못했어요. 같은 브라우저에서 다시 열어봐요.',
          );
          return;
        }
        session = new GuestSession(draft, setError, setSaveStatus);
        session.stop = session.store.subscribe(() => {
          try {
            session!.save();
          } catch (e) {
            setError(
              e instanceof DOMException
                ? '초안을 저장하지 못했어요. 브라우저 저장 공간을 확인하고 다시 시도해요.'
                : e instanceof Error
                  ? e.message
                  : '초안을 저장하지 못했어요. 다시 시도해요.',
            );
          }
        });
        setSaveStatus(draft.revision > 0 ? 'saved' : 'idle');
        setSession(session);
      } catch {
        setError(
          '초안을 읽지 못했어요. 브라우저 저장 공간을 확인하고 새로고침해요.',
        );
      }
    };
    hydrate();
    return () => session?.stop();
  }, [create]);
  return { session, error, setError, saveStatus };
}
