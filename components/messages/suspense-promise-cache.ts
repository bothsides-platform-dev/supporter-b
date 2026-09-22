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
  /**
   * 로더를 호출하지 않고 결과를 미리 넣는다 — 랜딩 데모가 실제 스레드 페인을
   * 고정 데이터로 구동하기 위한 유일한 경로다(비로그인 상태에서 서명 액션을
   * 태울 수 없다).
   *
   * 시딩된 키는 `invalidate` 로 지워지지 않는다(다시 시딩된다) — 스레드 페인은
   * 언마운트마다 무효화하므로, 그냥 넣어 두면 대화를 닫고 다시 열었을 때 로더가
   * 불려 데모가 빈 스레드로 떨어진다. `clearAll` 로만 사라진다.
   */
  seed(key: string, result: T): void;
}

/**
 * 이미 값을 가진 thenable — `use()` 가 **동기적으로** 값을 내주도록 React 가 읽는
 * 필드(`status`/`value`)를 붙인다.
 *
 * 왜 `Promise.resolve(v)` 로 부족한가(실측): 맨 프로미스를 넘기면 첫 렌더가 무조건
 * suspend 하고, 값이 이미 있는데도 fallback 에서 **돌아오지 않는다**(리졸브 핑으로
 * 재시도되지 않음). 로더가 실제로 대기하는 정상 경로는 pending → 리졸브 순서라
 * 이 문제를 겪지 않는다. 시딩(데모)만 "처음부터 완료" 상태라 이 표기가 필요하다.
 */
function fulfilledThenable<T>(value: T): Promise<T> {
  const thenable = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
  thenable.status = 'fulfilled';
  thenable.value = value;
  return thenable;
}

export function createSuspensePromiseCache<T extends CacheableResult>(
  loader: (key: string) => Promise<T>,
): SuspensePromiseCache<T> {
  const cache = new Map<string, Promise<T>>();
  // 시딩된(데모) 결과 — invalidate 를 견딘다. 실제 앱에서는 늘 빈 Map 이다.
  const seeded = new Map<string, T>();
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
      const stuck = seeded.get(key);
      if (stuck !== undefined) {
        cache.set(key, fulfilledThenable(stuck));
        return;
      }
      cache.delete(key);
    },
    clearAll: (): void => {
      cache.clear();
      seeded.clear();
    },
    seed: (key: string, result: T): void => {
      seeded.set(key, result);
      cache.set(key, fulfilledThenable(result));
    },
  };
}
