// team-thread-cache — Suspense 용 모듈 레벨 Promise 캐시 (thread-cache 선례).
// 계약: 같은 rfpId 는 같은 Promise(재호출 없음), invalidate 후 재로드, clearAll.

import { afterEach, describe, expect, it, vi } from 'vitest';

const loadTeamThread = vi.fn();
vi.mock('@/lib/server/actions/chat/teamThreadLoader', () => ({
  loadTeamThread: (...args: unknown[]) => loadTeamThread(...args),
}));

import {
  clearAllTeamThreadCache,
  getTeamThreadPromise,
  invalidateTeamThread,
} from '../team-thread-cache';

afterEach(() => {
  clearAllTeamThreadCache();
  loadTeamThread.mockReset();
});

describe('getTeamThreadPromise', () => {
  it('같은 rfpId 는 같은 Promise 를 돌려준다 (로더 1회 호출)', () => {
    loadTeamThread.mockResolvedValue({ ok: true, messages: [] });

    const a = getTeamThreadPromise('rfp-1');
    const b = getTeamThreadPromise('rfp-1');

    expect(a).toBe(b);
    expect(loadTeamThread).toHaveBeenCalledTimes(1);
    expect(loadTeamThread).toHaveBeenCalledWith('rfp-1');
  });

  it('다른 rfpId 는 별도 Promise 다', () => {
    loadTeamThread.mockResolvedValue({ ok: true, messages: [] });

    const a = getTeamThreadPromise('rfp-1');
    const b = getTeamThreadPromise('rfp-2');

    expect(a).not.toBe(b);
    expect(loadTeamThread).toHaveBeenCalledTimes(2);
  });

  it('invalidateTeamThread 후 다시 요청하면 재로드한다', () => {
    loadTeamThread.mockResolvedValue({ ok: true, messages: [] });

    const a = getTeamThreadPromise('rfp-1');
    invalidateTeamThread('rfp-1');
    const b = getTeamThreadPromise('rfp-1');

    expect(a).not.toBe(b);
    expect(loadTeamThread).toHaveBeenCalledTimes(2);
  });

  it('clearAllTeamThreadCache 는 모든 항목을 비운다', () => {
    loadTeamThread.mockResolvedValue({ ok: true, messages: [] });

    getTeamThreadPromise('rfp-1');
    getTeamThreadPromise('rfp-2');
    clearAllTeamThreadCache();
    getTeamThreadPromise('rfp-1');
    getTeamThreadPromise('rfp-2');

    expect(loadTeamThread).toHaveBeenCalledTimes(4);
  });

  it('로더가 reject 하면 {ok:false} 로 정규화한다 — use() 가 throw 해 페이지 전체가 죽는 것을 방지', async () => {
    loadTeamThread.mockRejectedValue(new Error('network'));

    await expect(getTeamThreadPromise('rfp-1')).resolves.toEqual({
      ok: false,
      error: 'NETWORK',
    });
  });
});
