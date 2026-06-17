import { loadTeamThread } from '@/lib/server/actions/chat/teamThreadLoader';
import type { LoadTeamThreadResult } from '@/lib/server/actions/chat/teamThreadLoader';
import { createSuspensePromiseCache } from './suspense-promise-cache';

// 팀 스레드용 Suspense Promise 캐시 — 키는 rfpId. 세션 워크스페이스는 서버가
// 결정하므로 클라이언트 키에 포함하지 않는다. 동작·정규화 규칙은
// createSuspensePromiseCache 참조.
const cache = createSuspensePromiseCache<LoadTeamThreadResult>(loadTeamThread);

export const getTeamThreadPromise = cache.get;
export const invalidateTeamThread = cache.invalidate;
export const clearAllTeamThreadCache = cache.clearAll;
