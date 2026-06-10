import { loadConversationThread } from '@/lib/server/actions/chat/conversationLoaders';
import type { LoadThreadResult } from '@/lib/server/actions/chat/conversationLoaders';

// Module-level Promise cache: maps conversationId → in-flight or resolved Promise.
// Suspense requires the same Promise object across re-renders — component state
// won't work because it resets on every render cycle.
const cache = new Map<string, Promise<LoadThreadResult>>();

export function getThreadPromise(id: string): Promise<LoadThreadResult> {
  if (!cache.has(id)) {
    // reject 를 {ok:false} 로 정규화 — rejected promise 가 캐시되면 use() 가
    // throw 해 세그먼트 전체가 에러 페이지로 교체되고 reset 루프에 갇힌다.
    cache.set(
      id,
      loadConversationThread(id).catch(
        (): LoadThreadResult => ({ ok: false, error: 'NETWORK' }),
      ),
    );
  }
  return cache.get(id)!;
}

export function invalidateThread(id: string) {
  cache.delete(id);
}

export function clearAllThreadCache() {
  cache.clear();
}
