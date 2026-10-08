'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Attachment } from '@/lib/types/common';

type FailedMessage = {
  id: string;
  body: string;
  createdAt: string;
  attachments: Attachment[];
  rfpId?: string | null;
  unconfirmed?: boolean;
};

type RecoverableMessage = FailedMessage & { pending?: boolean; failed?: boolean; localKey?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readFailures(key: string): FailedMessage[] | null {
  if (typeof window === 'undefined') return [];
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(saved)) return [];
    const ids = new Set<string>();
    return saved.flatMap((row): FailedMessage[] => {
      if (!isRecord(row) || typeof row.id !== 'string' || !/^pending-[\w-]+$/.test(row.id)
        || row.id.length > 64 || ids.has(row.id) || typeof row.body !== 'string'
        || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))
        || !Array.isArray(row.attachments)
        || (row.unconfirmed !== undefined && typeof row.unconfirmed !== 'boolean')
        || (row.rfpId != null && (typeof row.rfpId !== 'string' || !/^[\w-]+$/.test(row.rfpId)))) return [];
      const attachments: Attachment[] = [];
      for (const attachment of row.attachments) {
        if (!isRecord(attachment) || typeof attachment.id !== 'string' || !/^[\w-]+$/.test(attachment.id)
          || typeof attachment.name !== 'string' || typeof attachment.mimeType !== 'string'
          || typeof attachment.size !== 'number' || !Number.isFinite(attachment.size) || attachment.size < 0) return [];
        // Stored URLs are untrusted; downloads always go through the existing ACL route.
        attachments.push({ id: attachment.id, name: attachment.name, mimeType: attachment.mimeType,
          size: attachment.size, url: `/api/files/${attachment.id}` });
      }
      if (!row.body.trim() && attachments.length === 0) return [];
      ids.add(row.id);
      return [{ id: row.id, body: row.body, createdAt: row.createdAt, attachments,
        ...(typeof row.rfpId === 'string' || row.rfpId === null ? { rfpId: row.rfpId } : {}),
        ...(row.unconfirmed !== undefined ? { unconfirmed: row.unconfirmed } : {}) }];
    });
  } catch {
    return null;
  }
}

function mergeMessages<M extends RecoverableMessage>(server: M[], local: M[]): M[] {
  const serverIds = new Set(server.map((message) => message.id));
  const unsent = local.filter((message) => (message.pending || message.failed) && !serverIds.has(message.id));
  if (unsent.length === 0) return server;
  return [...server, ...unsent].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function writeFailures(key: string, failures: FailedMessage[]): boolean {
  try {
    if (failures.length) window.localStorage.setItem(key, JSON.stringify(failures.map(({ id, body, createdAt, attachments, rfpId, unconfirmed }) =>
      ({ id, body, createdAt, attachments, ...(rfpId !== undefined ? { rfpId } : {}),
        ...(unconfirmed !== undefined ? { unconfirmed } : {}) }))));
    else window.localStorage.removeItem(key);
    return true;
  } catch {
    // Unavailable/full storage must not block sending or current-screen recovery.
    return false;
  }
}

const recoveryEvent = 'chat-recovery-change';
type RecoveryChange = { key: string; confirmedId?: string; origin?: object };
const localId = (message: RecoverableMessage) => message.localKey ?? message.id;

// Failed sends are separate from the composer draft. Each caller scopes the key to
// its viewer/thread and rebuilds author metadata from the current session.
export function useRecoverableMessages<M extends RecoverableMessage>(
  key: string,
  messages: M[],
  restore: (message: FailedMessage) => M,
): [M[], Dispatch<SetStateAction<M[]>>, (tempId: string) => void] {
  // The first client render must match the server. Restore browser-only rows
  // after mounting, before any owned recovery records can be persisted.
  const [localMessages, setLocalMessages] = useState<M[]>(messages);
  const [previousMessages, setPreviousMessages] = useState(messages);
  const restoreRef = useRef(restore);
  const instance = useRef({});
  const ready = useRef(false);
  const ownedIds = useRef(new Set<string>());
  const observedIds = useRef(new Set<string>());
  const confirmedIds = useRef(new Set<string>());
  const snapshots = useRef(new Map<string, FailedMessage>());

  useEffect(() => { restoreRef.current = restore; }, [restore]);

  const synchronize = useCallback((saved: FailedMessage[], confirmedId?: string) => {
    const storedIds = new Set(saved.map((message) => message.id));
    for (const id of observedIds.current) {
      if (!storedIds.has(id)) confirmedIds.current.add(id);
    }
    if (confirmedId) confirmedIds.current.add(confirmedId);
    observedIds.current = storedIds;
    const remaining = saved.filter((message) => !confirmedIds.current.has(message.id));
    for (const message of remaining) snapshots.current.set(message.id, message);
    for (const id of confirmedIds.current) snapshots.current.delete(id);
    setLocalMessages((current) => {
      const kept = current.filter((message) => !(message.pending || message.failed)
        || !confirmedIds.current.has(localId(message)));
      const ids = new Set(kept.map(localId));
      const additions = remaining.filter((message) => !ids.has(message.id)).map(restoreRef.current);
      if (kept.length === current.length && additions.length === 0) return current;
      return mergeMessages(kept, additions);
    });
  }, []);

  useEffect(() => {
    ready.current = false;
    ownedIds.current.clear();
    observedIds.current.clear();
    confirmedIds.current.clear();
    snapshots.current.clear();
    const saved = readFailures(key);
    if (saved !== null) {
      ready.current = true;
      synchronize(saved);
    }
    const onRecoveryChange = (event: Event) => {
      const detail = (event as CustomEvent<RecoveryChange>).detail;
      if (detail.key !== key || detail.origin === instance.current) return;
      const current = readFailures(key);
      if (current !== null) synchronize(current, detail.confirmedId);
      else if (detail.confirmedId) synchronize([...snapshots.current.values()], detail.confirmedId);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      const current = readFailures(key);
      if (current !== null) synchronize(current);
    };
    window.addEventListener(recoveryEvent, onRecoveryChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(recoveryEvent, onRecoveryChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [key, synchronize]);

  // A refreshed server list must retain unsent rows, including an in-flight retry.
  if (previousMessages !== messages) {
    setPreviousMessages(messages);
    setLocalMessages((current) => mergeMessages(messages, current));
  }

  useEffect(() => {
    if (!ready.current || ownedIds.current.size === 0) return;
    const saved = readFailures(key);
    if (saved === null) return;
    // Read before merging: a removal confirmed in another tab must not be
    // resurrected by this tab's older failed/pending state.
    synchronize(saved);
    const failures = new Map(saved.filter((message) => !confirmedIds.current.has(message.id))
      .map((message) => [message.id, message]));
    for (const id of ownedIds.current) {
      if (confirmedIds.current.has(id)) continue;
      const message = localMessages.find((row) => localId(row) === id);
      if (message?.failed || (message?.pending && snapshots.current.has(id))) {
        failures.set(id, { ...message, id });
      } else {
        failures.delete(id);
      }
    }
    const merged = [...failures.values()];
    if (writeFailures(key, merged)) {
      observedIds.current = new Set(merged.map((message) => message.id));
      window.dispatchEvent(new CustomEvent<RecoveryChange>(recoveryEvent, { detail: { key } }));
    }
  }, [key, localMessages, synchronize]);

  const updateMessages = useCallback<Dispatch<SetStateAction<M[]>>>((update) => {
    setLocalMessages((current) => {
      const next = typeof update === 'function' ? update(current) : update;
      for (const message of next) {
        const id = localId(message);
        if (confirmedIds.current.has(id) || (!message.pending && !message.failed)) continue;
        if (message !== current.find((row) => localId(row) === id)) ownedIds.current.add(id);
        if (message.failed) snapshots.current.set(id, { ...message, id });
      }
      return next.filter((message) => !(message.pending || message.failed)
        || !confirmedIds.current.has(localId(message)));
    });
  }, []);

  const confirmFailure = useCallback((tempId: string) => {
    confirmedIds.current.add(tempId);
    ownedIds.current.delete(tempId);
    snapshots.current.delete(tempId);
    // Action completion can arrive after unmount, when state effects no longer
    // run. Remove only this ID from the current stored list, keeping other sends.
    const saved = readFailures(key);
    if (saved !== null) writeFailures(key, saved.filter((message) => message.id !== tempId));
    // Keep the caller's pending row until its next setter promotes the real ID.
    // An explicit discard targets a failed row and can remove it immediately.
    setLocalMessages((current) => current.filter((message) => !message.failed || localId(message) !== tempId));
    // Native storage events do not reach other views in this document. A
    // confirmed action also clears their stale rows if storage writing failed.
    window.dispatchEvent(new CustomEvent<RecoveryChange>(recoveryEvent, {
      detail: { key, confirmedId: tempId, origin: instance.current },
    }));
  }, [key]);

  return [localMessages, updateMessages, confirmFailure];
}
