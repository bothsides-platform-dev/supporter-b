// createSuspensePromiseCache — Suspense 용 모듈 레벨 Promise 캐시 팩토리.
// thread-cache / team-thread-cache 의 공통 구현. 계약: 같은 키는 같은 Promise(재호출
// 없음), invalidate 후 재로드, clearAll, reject 는 {ok:false, error:'NETWORK'} 로 정규화.

import { describe, expect, it, vi } from 'vitest';

import { createSuspensePromiseCache } from '../suspense-promise-cache';

type Result = { ok: true } | { ok: false; error: string };

describe('createSuspensePromiseCache', () => {
  it('같은 키는 같은 Promise 를 돌려준다 (로더 1회 호출)', () => {
    const loader = vi.fn(async (): Promise<Result> => ({ ok: true }));
    const cache = createSuspensePromiseCache(loader);

    const a = cache.get('k1');
    const b = cache.get('k1');

    expect(a).toBe(b);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith('k1');
  });

  it('다른 키는 별도 Promise 다', () => {
    const loader = vi.fn(async (): Promise<Result> => ({ ok: true }));
    const cache = createSuspensePromiseCache(loader);

    expect(cache.get('k1')).not.toBe(cache.get('k2'));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('invalidate 후 다시 요청하면 재로드한다', () => {
    const loader = vi.fn(async (): Promise<Result> => ({ ok: true }));
    const cache = createSuspensePromiseCache(loader);

    const a = cache.get('k1');
    cache.invalidate('k1');
    const b = cache.get('k1');

    expect(a).not.toBe(b);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('clearAll 는 모든 항목을 비운다', () => {
    const loader = vi.fn(async (): Promise<Result> => ({ ok: true }));
    const cache = createSuspensePromiseCache(loader);

    cache.get('k1');
    cache.get('k2');
    cache.clearAll();
    cache.get('k1');
    cache.get('k2');

    expect(loader).toHaveBeenCalledTimes(4);
  });

  it('로더가 reject 하면 {ok:false, error:NETWORK} 로 정규화한다', async () => {
    const loader = vi.fn(
      (): Promise<Result> => Promise.reject(new Error('network')),
    );
    const cache = createSuspensePromiseCache(loader);

    await expect(cache.get('k1')).resolves.toEqual({ ok: false, error: 'NETWORK' });
  });
});
