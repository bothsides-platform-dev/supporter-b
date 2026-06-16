import { loadConversationThread } from '@/lib/server/actions/chat/conversationLoaders';
import type { LoadThreadResult } from '@/lib/server/actions/chat/conversationLoaders';
import { createSuspensePromiseCache } from './suspense-promise-cache';

// 대화(상대방) 스레드용 Suspense Promise 캐시 — 키는 conversationId.
// 동작·정규화 규칙은 createSuspensePromiseCache 참조.
const cache = createSuspensePromiseCache<LoadThreadResult>(loadConversationThread);

export const getThreadPromise = cache.get;
export const invalidateThread = cache.invalidate;
export const clearAllThreadCache = cache.clearAll;
