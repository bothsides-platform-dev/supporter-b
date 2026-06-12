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
    // reject 를 {ok:false} 로 정규화 — rejected promise 가 캐시되면 use() 가
    // throw 해 에러 바운더리 없는 상세 페이지 전체가 죽고, reset 해도 같은
    // rejected promise 를 다시 받아 루프에 갇힌다.
    cache.set(
      rfpId,
      loadTeamThread(rfpId).catch(
        (): LoadTeamThreadResult => ({ ok: false, error: 'NETWORK' }),
      ),
    );
  }
  return cache.get(rfpId)!;
}

export function invalidateTeamThread(rfpId: string) {
  cache.delete(rfpId);
}

export function clearAllTeamThreadCache() {
  cache.clear();
}
