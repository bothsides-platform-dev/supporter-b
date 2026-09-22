// createSuspensePromiseCache().seed — 랜딩 데모가 서버 액션 없이 스레드 페인을
// 고정 데이터로 구동하는 유일한 경로. 계약 셋:
//   ① 로더를 부르지 않고 값이 들어간다 (비로그인에서 서명 액션을 태울 수 없다)
//   ② `use()` 가 동기적으로 읽도록 status/value 가 붙은 thenable 이어야 한다
//      (맨 Promise 면 첫 렌더가 suspend 한 뒤 fallback 에서 돌아오지 않는다)
//   ③ invalidate 를 견딘다 — 스레드 페인은 언마운트마다 무효화하므로, 지워지면
//      대화를 닫고 다시 열었을 때 로더가 불려 데모가 빈 스레드로 떨어진다
//   ④ clearAll 로만 사라진다 (실제 앱은 seed 를 쓰지 않으므로 기존 동작 불변)

import { describe, expect, it, vi } from 'vitest';

import { createSuspensePromiseCache } from '../suspense-promise-cache';

type Result = { ok: true; who?: string } | { ok: false; error: string };

function setup() {
  const loader = vi.fn(async (): Promise<Result> => ({ ok: true, who: 'loader' }));
  return { loader, cache: createSuspensePromiseCache(loader) };
}

describe('createSuspensePromiseCache — seed (랜딩 데모 전용)', () => {
  it('시딩한 키는 로더를 부르지 않고 그 값을 돌려준다', async () => {
    const { loader, cache } = setup();

    cache.seed('k1', { ok: true, who: 'seeded' });

    await expect(cache.get('k1')).resolves.toEqual({ ok: true, who: 'seeded' });
    expect(loader).not.toHaveBeenCalled();
  });

  it('시딩 결과는 status/value 가 붙은 완료 thenable 이다 (use() 동기 판독)', () => {
    const { cache } = setup();
    const value: Result = { ok: true, who: 'seeded' };

    cache.seed('k1', value);

    const promise = cache.get('k1') as Promise<Result> & { status?: string; value?: Result };
    expect(promise.status).toBe('fulfilled');
    expect(promise.value).toEqual(value);
  });

  it('invalidate 해도 시딩 값이 남는다 (로더 호출 없음)', async () => {
    const { loader, cache } = setup();
    cache.seed('k1', { ok: true, who: 'seeded' });

    cache.invalidate('k1');

    await expect(cache.get('k1')).resolves.toEqual({ ok: true, who: 'seeded' });
    expect(loader).not.toHaveBeenCalled();
  });

  it('invalidate 후에도 완료 thenable 이라 다시 suspend 하지 않는다', () => {
    const { cache } = setup();
    cache.seed('k1', { ok: true, who: 'seeded' });

    cache.invalidate('k1');

    const promise = cache.get('k1') as Promise<Result> & { status?: string };
    expect(promise.status).toBe('fulfilled');
  });

  it('시딩되지 않은 키의 invalidate 는 기존대로 캐시를 비운다', () => {
    const { loader, cache } = setup();
    cache.seed('seeded', { ok: true, who: 'seeded' });

    const a = cache.get('other');
    cache.invalidate('other');
    const b = cache.get('other');

    expect(a).not.toBe(b);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('clearAll 은 시딩까지 지운다 — 이후에는 로더가 다시 불린다', async () => {
    const { loader, cache } = setup();
    cache.seed('k1', { ok: true, who: 'seeded' });

    cache.clearAll();

    await expect(cache.get('k1')).resolves.toEqual({ ok: true, who: 'loader' });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('같은 키를 다시 시딩하면 최신 값으로 갈아치운다', async () => {
    const { cache } = setup();
    cache.seed('k1', { ok: true, who: 'first' });
    cache.seed('k1', { ok: true, who: 'second' });

    await expect(cache.get('k1')).resolves.toEqual({ ok: true, who: 'second' });
    cache.invalidate('k1');
    await expect(cache.get('k1')).resolves.toEqual({ ok: true, who: 'second' });
  });

  it('이미 로더로 채워진 키를 시딩하면 시딩 값이 이긴다', async () => {
    const { cache } = setup();
    cache.get('k1');

    cache.seed('k1', { ok: true, who: 'seeded' });

    await expect(cache.get('k1')).resolves.toEqual({ ok: true, who: 'seeded' });
  });
});
