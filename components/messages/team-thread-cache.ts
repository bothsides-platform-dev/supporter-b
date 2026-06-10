import { loadTeamThread } from '@/lib/server/actions/chat/teamThreadLoader';
import type { LoadTeamThreadResult } from '@/lib/server/actions/chat/teamThreadLoader';

// Module-level Promise cache: maps rfpId → in-flight or resolved Promise.
// Suspense requires the same Promise object across re-renders — component state
// won't work because it resets on every render cycle. (thread-cache.ts 선례 —
// 스코프 키만 conversationId → rfpId 로 다르다. 세션 워크스페이스는 서버가
// 결정하므로 클라이언트 키에 포함하지 않는다.)
const cache = new Map<string, Promise<LoadTeamThreadResult>>();

export function getTeamThreadPromise(rfpId: string): Promise<LoadTeamThreadResult> {
  if (!cache.has(rfpId)) {
    cache.set(rfpId, loadTeamThread(rfpId));
  }
  return cache.get(rfpId)!;
}

export function invalidateTeamThread(rfpId: string) {
  cache.delete(rfpId);
}

export function clearAllTeamThreadCache() {
  cache.clear();
}
