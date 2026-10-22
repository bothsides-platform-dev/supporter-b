'use client';

import { z } from 'zod';
import { createRfpDraftStore } from '@/lib/stores/rfp-draft';
import { guestAnswersSchema, selectGuestAnswers, type GuestAnswers, type ServerGuestDraft } from './answers';
import { GUEST_DRAFT_TTL_MS, sameOwner, type DraftOwner } from './draft';

type SaveInput = { id: string; revision: number; answers: GuestAnswers; files: string[] };
type Save = (input: SaveInput, actor: DraftOwner) => Promise<{ ok: true; revision: number } | { ok: false; error: string }>;
const BACKUP_PREFIX = 'support-b-server-guest-draft-v1:';
const backupSchema = z.object({
  version: z.literal(1),
  owner: z.object({ userId: z.string(), workspaceId: z.string() }).strict(),
  draftId: z.string(),
  baseRevision: z.number().int().min(1),
  updatedAt: z.number().finite(),
  writer: z.string(),
  answers: guestAnswersSchema,
  files: z.array(z.object({ id: z.string(), name: z.string(), size: z.number().nonnegative() }).strict()).max(5),
}).strict();
type Backup = z.infer<typeof backupSchema>;
function backupKey(actor: DraftOwner, id: string) {
  return BACKUP_PREFIX + encodeURIComponent(JSON.stringify([actor.userId, actor.workspaceId, id]));
}

// Call only after the server has confirmed the user's explicit draft deletion.
export function clearServerDraftBackup(actor: DraftOwner, id: string) {
  try { localStorage.removeItem(backupKey(actor, id)); } catch { /* Browser storage can be unavailable. */ }
}

/**
 * A session owns one server revision, a serialized save queue and a synchronous
 * recovery copy. stop() cancels future saves but retains that copy; complete()
 * removes only this session's copy. An in-flight response may acknowledge older
 * edits after stop, but can never erase a replacement session's recovery copy.
 * Recovery data is untrusted input: save/refresh still enforce actor, revision
 * and attachment ownership on the server.
 */
export function createServerDraftSession({ draft, actor, save, refresh, onError }: {
  draft: ServerGuestDraft;
  actor: DraftOwner;
  save: Save;
  refresh: () => Promise<ServerGuestDraft>;
  onError: (code: string) => void;
}) {
  const key = backupKey(actor, draft.id);
  const writer = crypto.randomUUID();
  let backupRaw: string | null = null;
  let recovered: Backup | undefined;
  let backupUnavailable = false;
  try {
    backupRaw = localStorage.getItem(key);
    const parsed = backupRaw && backupSchema.safeParse(JSON.parse(backupRaw));
    if (parsed && parsed.success && sameOwner(parsed.data.owner, actor) && parsed.data.draftId === draft.id) {
      if (Date.now() - parsed.data.updatedAt >= GUEST_DRAFT_TTL_MS || parsed.data.updatedAt > Date.now()) {
        localStorage.removeItem(key);
        backupRaw = null;
      } else recovered = parsed.data;
    }
  } catch { backupUnavailable = true; }
  const store = createRfpDraftStore({
    ...draft.answers,
    ...recovered?.answers,
    matchingRequestKey: draft.requestKey,
    rfpFiles: recovered?.files ?? draft.files,
  });
  let revision = draft.revision;
  let baseRevision = recovered?.baseRevision ?? revision;
  let conflicted = !!recovered && baseRevision !== revision;
  let generation = recovered ? 1 : 0;
  let updatedAt = recovered?.updatedAt ?? Date.now();
  let savedGeneration = 0;
  let queue: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let completed = false;
  let applyingServer = false;
  const notify = (code: string) => { if (!stopped) onError(code); };
  const snapshot = () => ({ answers: selectGuestAnswers(store.getState()), files: structuredClone(store.getState().rfpFiles) });
  const preserve = () => {
    try {
      if (localStorage.getItem(key) !== backupRaw) {
        conflicted = true;
        notify('GUEST_DRAFT_CHANGED');
        return;
      }
      const next: Backup = { version: 1, owner: actor, draftId: draft.id, baseRevision, updatedAt, writer, ...snapshot() };
      const raw = JSON.stringify(backupSchema.parse(next));
      localStorage.setItem(key, raw);
      backupRaw = raw;
      backupUnavailable = false;
    } catch {
      backupUnavailable = true;
      notify('GUEST_BACKUP_UNAVAILABLE');
    }
  };
  const removeOwnedBackup = () => {
    try {
      if (backupRaw !== null && localStorage.getItem(key) === backupRaw) {
        localStorage.removeItem(key);
        backupRaw = null;
      }
    } catch { backupUnavailable = true; }
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!conflicted && !stopped) timer = setTimeout(() => { void flush().catch(() => {}); }, 400);
  };
  const flush = async () => {
    clearTimeout(timer);
    if (stopped) throw new Error('GUEST_SESSION_CLOSED');
    if (conflicted) throw new Error('GUEST_DRAFT_CHANGED');
    const data = snapshot();
    const savingGeneration = generation;
    queue = queue.catch(() => {}).then(async () => {
      if (stopped) throw new Error('GUEST_SESSION_CLOSED');
      if (conflicted) throw new Error('GUEST_DRAFT_CHANGED');
      const result = await save({ id: draft.id, revision, answers: data.answers, files: data.files.map(file => file.id) }, actor);
      if (!result.ok) throw new Error(result.error);
      revision = result.revision;
      baseRevision = revision;
      savedGeneration = savingGeneration;
      if (!completed) {
        if (generation === savedGeneration) removeOwnedBackup();
        else preserve();
      }
      if (!conflicted) notify(backupUnavailable && generation !== savedGeneration ? 'GUEST_BACKUP_UNAVAILABLE' : '');
    }).catch(error => {
      const code = error instanceof Error ? error.message : 'SAVE_FAILED';
      if (code === 'GUEST_DRAFT_CHANGED') conflicted = true;
      notify(code);
      throw error;
    });
    await queue;
    return { id: draft.id, revision };
  };
  const unsubscribe = store.subscribe(() => {
    if (applyingServer || stopped) return;
    generation += 1;
    updatedAt = Date.now();
    preserve();
    schedule();
  });
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
  };
  const complete = () => {
    completed = true;
    stop();
    removeOwnedBackup();
  };
  const resolveConflict = async (choice: 'local' | 'server') => {
    if (stopped) throw new Error('GUEST_SESSION_CLOSED');
    await queue.catch(() => {});
    if (stopped) throw new Error('GUEST_SESSION_CLOSED');
    const latest = await refresh();
    if (stopped) throw new Error('GUEST_SESSION_CLOSED');
    if (latest.id !== draft.id || latest.requestKey !== draft.requestKey) throw new Error('GUEST_DRAFT_CHANGED');
    revision = latest.revision;
    baseRevision = revision;
    if (choice === 'server') {
      // The confirmation explicitly discards this browser's recovery copy for
      // this owner/draft. Automatic acknowledgements use removeOwnedBackup.
      try {
        localStorage.removeItem(key);
        backupRaw = null;
      } catch {
        notify('GUEST_BACKUP_UNAVAILABLE');
        throw new Error('GUEST_BACKUP_UNAVAILABLE');
      }
      applyingServer = true;
      try {
        store.getState().reset();
        store.setState({ ...latest.answers, matchingRequestKey: latest.requestKey, rfpFiles: latest.files });
      } finally { applyingServer = false; }
      savedGeneration = ++generation;
    }
    conflicted = false;
    notify('');
    if (choice === 'local') {
      // This replacement is allowed only after the explicit conflict choice.
      try { backupRaw = localStorage.getItem(key); } catch { backupUnavailable = true; }
      generation += 1;
      updatedAt = Date.now();
      preserve();
      schedule();
    }
  };
  if (recovered) {
    preserve(); // Claim the recovery copy so an old response cannot remove it.
    if (conflicted) notify('GUEST_DRAFT_CHANGED');
    else schedule();
  } else if (backupUnavailable) notify('GUEST_BACKUP_UNAVAILABLE');
  return { draft, store, flush, stop, complete, resolveConflict, get conflicted() { return conflicted; } };
}

export type ServerDraftSession = ReturnType<typeof createServerDraftSession>;
