// Suspense 용 모듈 레벨 Promise 캐시 팩토리 — thread-cache / team-thread-cache 의 공통 구현.
//
// Suspense 는 re-render 마다 같은 Promise 객체를 요구한다 — 컴포넌트 state 는 렌더 사이클마다
// 리셋되므로 쓸 수 없다. 그래서 키 → in-flight/resolved Promise 를 모듈 레벨 Map 에 캐시한다.
//
// reject 는 {ok:false, error:'NETWORK'} 로 정규화한다 — rejected promise 가 캐시되면 use() 가
// throw 해 (에러 바운더리 없는) 세그먼트 전체가 에러 페이지로 교체되고 reset 해도 같은 rejected
// promise 를 다시 받아 루프에 갇힌다.

// 캐시 결과는 항상 판별 유니온(성공/실패)이라 실패 분기는 {ok:false; error:string} 형태다.
type CacheableResult = { ok: true } | { ok: false; error: string };

export interface SuspensePromiseCache<T extends CacheableResult> {
  get(key: string): Promise<T>;
  invalidate(key: string): void;
  clearAll(): void;
}

export function createSuspensePromiseCache<T extends CacheableResult>(
  loader: (key: string) => Promise<T>,
): SuspensePromiseCache<T> {
  const cache = new Map<string, Promise<T>>();
  return {
    get: (key: string): Promise<T> => {
      if (!cache.has(key)) {
        cache.set(
          key,
          // {ok:false; error:'NETWORK'} 는 T 의 실패 분기에 해당하지만 제네릭 T 로는
          // 증명되지 않아 명시 캐스트한다 (CacheableResult 제약이 형태를 보장).
          loader(key).catch((): T => ({ ok: false, error: 'NETWORK' }) as T),
        );
      }
      return cache.get(key)!;
    },
    invalidate: (key: string): void => {
      cache.delete(key);
    },
    clearAll: (): void => {
      cache.clear();
    },
  };
}
