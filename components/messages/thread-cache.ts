import { loadConversationThread } from '@/lib/server/actions/chat/conversationLoaders';
import type { LoadThreadResult } from '@/lib/server/actions/chat/conversationLoaders';

// Module-level Promise cache: maps conversationId → in-flight or resolved Promise.
// Suspense requires the same Promise object across re-renders — component state
// won't work because it resets on every render cycle.
const cache = new Map<string, Promise<LoadThreadResult>>();

export function getThreadPromise(id: string): Promise<LoadThreadResult> {
  if (!cache.has(id)) {
    cache.set(id, loadConversationThread(id));
  }
  return cache.get(id)!;
}

export function invalidateThread(id: string) {
  cache.delete(id);
}

export function clearAllThreadCache() {
  cache.clear();
}
