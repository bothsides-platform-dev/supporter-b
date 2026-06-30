import "@testing-library/jest-dom";
import { vi, beforeEach } from "vitest";

// Node 22+ exposes a process-level `localStorage` that requires --localstorage-file
// and throws on access, shadowing jsdom's own implementation in the unit-jsdom
// project. Point the bare `localStorage` global at jsdom's real Storage instance
// so component tests use it normally — using the real Storage (not a plain-object
// stub) keeps `vi.spyOn(Storage.prototype, ...)` working.
//
// Scoped to jsdom only: server (unit-node) tests have no `window` and never touch
// localStorage. Crucially we do NOT use `vi.stubGlobal` here — node test files that
// call `vi.unstubAllGlobals()` in afterEach would otherwise wipe this stub and make
// the shared `beforeEach` below throw `localStorage is not defined`. `defineProperty`
// stays outside vitest's stub registry, and the beforeEach is registered jsdom-only.
if (typeof window !== "undefined" && window.localStorage) {
  const jsdomStorage = window.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: jsdomStorage,
  });
  beforeEach(() => { jsdomStorage.clear(); });
}

// `next/cache`의 revalidatePath/Tag는 Next.js 요청·액션 컨텍스트 (static
// generation store)를 요구해 vitest에서 직접 호출하면 throw 한다. 액션 본문이
// 캐시 무효화를 부수효과로 가지더라도 단위·통합 테스트는 그 효과를 검증하지
// 않으므로 no-op 으로 무력화한다.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
