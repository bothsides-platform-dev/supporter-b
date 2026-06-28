import "@testing-library/jest-dom";
import { vi, beforeEach } from "vitest";

// Node 22+ exposes a process-level `localStorage` that requires --localstorage-file
// and throws on access, shadowing jsdom's implementation in the unit-jsdom project.
// Stub with an in-memory map so component tests can use localStorage normally.
// Note: the store is shared within a file; beforeEach clears it to prevent cross-test pollution.
const _localStorageStore: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => _localStorageStore[k] ?? null,
  setItem: (k: string, v: string) => { _localStorageStore[k] = String(v); },
  removeItem: (k: string) => { delete _localStorageStore[k]; },
  clear: () => { Object.keys(_localStorageStore).forEach((k) => delete _localStorageStore[k]); },
  get length() { return Object.keys(_localStorageStore).length; },
  key: (i: number) => Object.keys(_localStorageStore)[i] ?? null,
});
beforeEach(() => { localStorage.clear(); });

// `next/cache`의 revalidatePath/Tag는 Next.js 요청·액션 컨텍스트 (static
// generation store)를 요구해 vitest에서 직접 호출하면 throw 한다. 액션 본문이
// 캐시 무효화를 부수효과로 가지더라도 단위·통합 테스트는 그 효과를 검증하지
// 않으므로 no-op 으로 무력화한다.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
