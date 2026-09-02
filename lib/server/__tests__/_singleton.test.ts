import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  __resetAllSingletonsForTest,
  __resetSingletonGroupForTest,
  defineAsyncSingleton,
  defineSingleton,
} from '../_singleton';

// 서비스 13개 + snowsign·storage·nts 가 각자 손으로 복사하던
// `declare global` + `globalThis.__bidit_x__` + getX + __setXForTest + __resetXForTest
// 블록의 단일 출처. 여기서 고정하는 의미:
//   get()  = override ?? cache ?? build()   (build 는 프로세스당 1회)
//   set(x) = override 슬롯 (undefined 면 override 만 지운다 — 캐시된 실 인스턴스는 남는다)
//   reset() = override·cache 둘 다 비움
// 그룹('service' | 'infra')별 일괄 리셋은 factory.__resetForTest 가 서비스만 떨어뜨리기 위한 것.

afterEach(() => __resetAllSingletonsForTest());

let seq = 0;
const key = () => `test_singleton_${++seq}`;

describe('defineSingleton (sync)', () => {
  it('builds once and returns the same instance afterwards', () => {
    const build = vi.fn(() => ({ id: Math.random() }));
    const s = defineSingleton(key(), 'infra', build);

    const a = s.get();
    const b = s.get();

    expect(b).toBe(a);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('set(x) overrides without building; set(undefined) falls back to the cached build', () => {
    const build = vi.fn(() => ({ real: true }));
    const s = defineSingleton(key(), 'infra', build);
    const real = s.get();
    const fake = { real: false };

    s.set(fake);
    expect(s.get()).toBe(fake);

    s.set(undefined);
    expect(s.get()).toBe(real);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('reset() drops both override and cache so the next get builds again', () => {
    const build = vi.fn(() => ({ n: build.mock.calls.length }));
    const s = defineSingleton(key(), 'infra', build);
    const first = s.get();
    s.set({ n: -1 });

    s.reset();
    const second = s.get();

    expect(second).not.toBe(first);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('re-defining the same key shares the slot (HMR re-evaluation keeps the instance)', () => {
    const k = key();
    const first = defineSingleton(k, 'infra', () => ({ from: 'first' }));
    const built = first.get();

    const second = defineSingleton(k, 'infra', () => ({ from: 'second' }));

    expect(second.get()).toBe(built);
  });

  it('refuses to re-define a key under a different group', () => {
    const k = key();
    defineSingleton(k, 'infra', () => 1);

    expect(() => defineSingleton(k, 'service', () => 2)).toThrow(/group/);
  });
});

describe('defineAsyncSingleton', () => {
  it('caches the resolved instance, not the promise, and builds once', async () => {
    const build = vi.fn(async () => ({ id: Math.random() }));
    const s = defineAsyncSingleton(key(), 'service', build);

    const a = await s.get();
    const b = await s.get();

    expect(b).toBe(a);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('set/reset behave like the sync variant', async () => {
    const build = vi.fn(async () => ({ real: true }));
    const s = defineAsyncSingleton(key(), 'service', build);
    const real = await s.get();
    const fake = { real: false };

    s.set(fake);
    expect(await s.get()).toBe(fake);

    s.reset();
    expect(await s.get()).not.toBe(real);
    expect(build).toHaveBeenCalledTimes(2);
  });
});

describe('group resets', () => {
  it('__resetSingletonGroupForTest only drops singletons of that group', async () => {
    const svc = defineAsyncSingleton(key(), 'service', async () => ({ kind: 'svc' }));
    const infra = defineSingleton(key(), 'infra', () => ({ kind: 'infra' }));
    const svc1 = await svc.get();
    const infra1 = infra.get();

    __resetSingletonGroupForTest('service');

    expect(await svc.get()).not.toBe(svc1);
    expect(infra.get()).toBe(infra1);
  });

  it('__resetAllSingletonsForTest drops every group', async () => {
    const svc = defineAsyncSingleton(key(), 'service', async () => ({ kind: 'svc' }));
    const infra = defineSingleton(key(), 'infra', () => ({ kind: 'infra' }));
    const svc1 = await svc.get();
    const infra1 = infra.get();

    __resetAllSingletonsForTest();

    expect(await svc.get()).not.toBe(svc1);
    expect(infra.get()).not.toBe(infra1);
  });
});
