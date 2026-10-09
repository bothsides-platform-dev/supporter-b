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

const isLocalId = (id: string) => /^pending-[\w-]+$/.test(id) && id.length <= 64;
const recordPrefix = (key: string) => `${key}:message:`;
const recordKey = (key: string, id: string) => `${recordPrefix(key)}${id}`;
const isConfirmed = (value: unknown) => isRecord(value) && value.confirmed === true;

function parseStored(raw: string | null): unknown {
  try { return raw === null ? null : JSON.parse(raw); } catch { return null; }
}

function restoreFailure(row: unknown, id: string): FailedMessage | null {
  if (!isRecord(row) || row.id !== id || !isLocalId(id) || typeof row.body !== 'string'
    || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))
    || !Array.isArray(row.attachments)
    || (row.unconfirmed !== undefined && typeof row.unconfirmed !== 'boolean')
    || (row.rfpId != null && (typeof row.rfpId !== 'string' || !/^[\w-]+$/.test(row.rfpId)))) return null;
  const attachments: Attachment[] = [];
  for (const attachment of row.attachments) {
    if (!isRecord(attachment) || typeof attachment.id !== 'string' || !/^[\w-]+$/.test(attachment.id)
      || typeof attachment.name !== 'string' || typeof attachment.mimeType !== 'string'
      || typeof attachment.size !== 'number' || !Number.isFinite(attachment.size) || attachment.size < 0) return null;
    // Stored URLs are untrusted; downloads always go through the existing ACL route.
    attachments.push({ id: attachment.id, name: attachment.name, mimeType: attachment.mimeType,
      size: attachment.size, url: `/api/files/${attachment.id}` });
  }
  if (!row.body.trim() && attachments.length === 0) return null;
  return { id, body: row.body, createdAt: row.createdAt, attachments,
    ...(typeof row.rfpId === 'string' || row.rfpId === null ? { rfpId: row.rfpId } : {}),
    ...(row.unconfirmed !== undefined ? { unconfirmed: row.unconfirmed } : {}) };
}

type RecoverySnapshot = { failures: FailedMessage[]; confirmedIds: string[] };

function readRecovery(key: string): RecoverySnapshot | null {
  const snapshot: RecoverySnapshot = { failures: [], confirmedIds: [] };
  if (typeof window === 'undefined') return snapshot;
  try {
    const storage = window.localStorage;
    const prefix = recordPrefix(key);
    for (let index = 0; index < storage.length; index += 1) {
      const storedKey = storage.key(index);
      if (!storedKey?.startsWith(prefix)) continue;
      const id = storedKey.slice(prefix.length);
      if (!isLocalId(id)) continue;
      const row = parseStored(storage.getItem(storedKey));
      if (isConfirmed(row)) snapshot.confirmedIds.push(id);
      else {
        const failure = restoreFailure(row, id);
        if (failure) snapshot.failures.push(failure);
      }
    }
    return snapshot;
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

function writeFailure(key: string, message: FailedMessage): 'saved' | 'confirmed' | 'unavailable' {
  try {
    const target = recordKey(key, message.id);
    if (isConfirmed(parseStored(window.localStorage.getItem(target)))) return 'confirmed';
    const { id, body, createdAt, attachments, rfpId, unconfirmed } = message;
    window.localStorage.setItem(target, JSON.stringify({ id, body, createdAt, attachments,
      ...(rfpId !== undefined ? { rfpId } : {}),
      ...(unconfirmed !== undefined ? { unconfirmed } : {}),
    }));
    return 'saved';
  } catch {
    // Unavailable/full storage must not block sending or current-screen recovery.
    return 'unavailable';
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
  const ownedIds = useRef(new Set<string>());
  const confirmedIds = useRef(new Set<string>());
  const snapshots = useRef(new Map<string, FailedMessage>());

  useEffect(() => { restoreRef.current = restore; }, [restore]);

  const synchronize = useCallback((saved: RecoverySnapshot | null, confirmedId?: string) => {
    for (const id of saved?.confirmedIds ?? []) confirmedIds.current.add(id);
    if (confirmedId) confirmedIds.current.add(confirmedId);
    // A missing record/clear is not evidence that the server received a send.
    const remaining = (saved?.failures ?? []).filter((message) => !confirmedIds.current.has(message.id));
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
    ownedIds.current.clear();
    confirmedIds.current.clear();
    snapshots.current.clear();
    synchronize(readRecovery(key));
    const onRecoveryChange = (event: Event) => {
      const detail = (event as CustomEvent<RecoveryChange>).detail;
      if (detail.key !== key || detail.origin === instance.current) return;
      synchronize(readRecovery(key), detail.confirmedId);
    };
    const onStorage = (event: StorageEvent) => {
      const prefix = recordPrefix(key);
      if (event.key !== null && !event.key.startsWith(prefix)) return;
      const id = event.key?.slice(prefix.length);
      const confirmedId = id && isLocalId(id) && isConfirmed(parseStored(event.newValue)) ? id : undefined;
      synchronize(readRecovery(key), confirmedId);
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
    let saved = false;
    for (const id of ownedIds.current) {
      if (confirmedIds.current.has(id)) continue;
      const message = localMessages.find((row) => localId(row) === id);
      if (message?.failed || (message?.pending && snapshots.current.has(id))) {
        // Each ID has an independent write target: concurrent A/B failures can
        // never overwrite one another's records. A known confirmation wins
        // over a stale retry; localStorage cannot make same-ID races atomic.
        const result = writeFailure(key, { ...message, id });
        if (result === 'confirmed') synchronize(null, id);
        else if (result === 'saved') saved = true;
      }
    }
    if (saved) {
      window.dispatchEvent(new CustomEvent<RecoveryChange>(recoveryEvent, { detail: { key, origin: instance.current } }));
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
    const hadRecovery = snapshots.current.has(tempId);
    confirmedIds.current.add(tempId);
    ownedIds.current.delete(tempId);
    snapshots.current.delete(tempId);
    // Only recoverable sends need a persisted confirmation. Fresh successful
    // sends leave no storage record. This also works after the view unmounts.
    try {
      const target = recordKey(key, tempId);
      if (hadRecovery || window.localStorage.getItem(target) !== null) {
        window.localStorage.setItem(target, JSON.stringify({ confirmed: true }));
      }
    } catch {
      // The explicit document event still clears mounted memory recovery rows.
    }
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
