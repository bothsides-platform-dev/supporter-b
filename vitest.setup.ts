import "@testing-library/jest-dom";
import { vi, beforeEach } from "vitest";

// Node 22+ exposes process-level `localStorage`/`sessionStorage`/`Storage` globals
// that vitest's jsdom environment does NOT overwrite: vitest's populateGlobal()
// skips any key already present on `global` unless it's in vitest's fixed
// override list (see getWindowKeys in vitest/dist — `if (k in global) return
// keysArray.includes(k)`). Since Node defines these globally before jsdom's
// environment ever runs, `window.localStorage`/`sessionStorage` end up aliased
// to Node's own (mostly non-functional without --localstorage-file, and
// always a *different* Storage instance/class than jsdom's) globals instead of
// jsdom's real implementation — even though `window === globalThis` in these
// tests. A prior version of this guard read `window.localStorage` directly to
// find jsdom's storage, but that reads the very same shadowed global — it
// never actually reached jsdom's instance, which is why the guard silently
// no-op'd and every `beforeEach(() => jsdomStorage.clear())` consumer crashed.
//
// vitest's jsdom environment stashes the real JSDOM instance at `window.jsdom`
// (`dom.window.jsdom = dom` in vitest's environments.js) — reach through that
// to get jsdom's actual Storage objects/class and rebind the globals to them.
// Rebinding `Storage` itself (not just the two instances) keeps
// `vi.spyOn(Storage.prototype, ...)` working, since bare `Storage` in test
// files would otherwise resolve to Node's unrelated Storage class.
//
// Scoped to jsdom only: server (unit-node) tests without the jsdom pragma have
// no `window` and never touch storage. Crucially we do NOT use `vi.stubGlobal`
// here — node test files that call `vi.unstubAllGlobals()` in afterEach would
// otherwise wipe this stub and make the shared `beforeEach` below throw
// `localStorage is not defined`. `defineProperty` stays outside vitest's stub
// registry, and the beforeEach is registered jsdom-only.
if (typeof window !== "undefined") {
  const jsdomWindow = (window as unknown as { jsdom?: { window?: typeof window } }).jsdom
    ?.window;
  const realLocalStorage = jsdomWindow?.localStorage;
  const realSessionStorage = jsdomWindow?.sessionStorage;
  const realStorageCtor = jsdomWindow?.Storage;
  if (realStorageCtor) {
    Object.defineProperty(globalThis, "Storage", {
      configurable: true,
      writable: true,
      value: realStorageCtor,
    });
  }
  if (realLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: realLocalStorage,
    });
  }
  if (realSessionStorage) {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      writable: true,
      value: realSessionStorage,
    });
  }
  if (realLocalStorage || realSessionStorage) {
    beforeEach(() => {
      realLocalStorage?.clear();
      realSessionStorage?.clear();
    });
  }
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
