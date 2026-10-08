'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Attachment } from '@/lib/types/common';

type FailedMessage = {
  id: string;
  body: string;
  createdAt: string;
  attachments: Attachment[];
  rfpId?: string | null;
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
        ...(typeof row.rfpId === 'string' || row.rfpId === null ? { rfpId: row.rfpId } : {}) }];
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

function writeFailures(key: string, failures: FailedMessage[]): void {
  try {
    if (failures.length) window.localStorage.setItem(key, JSON.stringify(failures.map(({ id, body, createdAt, attachments, rfpId }) =>
      ({ id, body, createdAt, attachments, ...(rfpId !== undefined ? { rfpId } : {}) }))));
    else window.localStorage.removeItem(key);
  } catch {
    // Unavailable/full storage must not block sending or current-screen recovery.
  }
}

// Failed sends are separate from the composer draft. Each caller scopes the key to
// its viewer/thread and rebuilds author metadata from the current session.
export function useRecoverableMessages<M extends RecoverableMessage>(
  key: string,
  messages: M[],
  restore: (message: FailedMessage) => M,
): [M[], Dispatch<SetStateAction<M[]>>, (tempId: string) => void] {
  const [initialFailures] = useState(() => readFailures(key));
  const [localMessages, setLocalMessages] = useState<M[]>(() => mergeMessages(messages, (initialFailures ?? []).map(restore)));
  const [previousMessages, setPreviousMessages] = useState(messages);
  const savedIds = useRef(new Set<string>());

  // A refreshed server list must retain unsent rows, including an in-flight retry.
  if (previousMessages !== messages) {
    setPreviousMessages(messages);
    setLocalMessages((current) => mergeMessages(messages, current));
  }

  useEffect(() => {
    // If the initial read failed, do not overwrite recovery records we could
    // not load. The current screen still works without persistent recovery.
    if (initialFailures === null) return;
    // Keep a failed snapshot until an action response/echo confirms its real ID.
    // Retrying only changes the display to pending; it must not discard recovery.
    const failures = localMessages.filter((message) => message.failed
      || (message.pending && savedIds.current.has(message.localKey ?? message.id)));
    savedIds.current = new Set(failures.map((message) => message.localKey ?? message.id));
    writeFailures(key, failures);
  }, [initialFailures, key, localMessages]);

  const confirmFailure = useCallback((tempId: string) => {
    savedIds.current.delete(tempId);
    // Action completion can arrive after unmount, when state effects no longer
    // run. Remove only this ID from the current stored list, keeping other sends.
    const saved = readFailures(key);
    if (saved !== null) writeFailures(key, saved.filter((message) => message.id !== tempId));
  }, [key]);

  return [localMessages, setLocalMessages, confirmFailure];
}
