// Process-wide singletons for services and infra clients.
//
// One registry replaces the per-module copy of
//   declare global { var __bidit_x__ } + getX() + __setXForTest + __resetXForTest
// that every service, the SnowSign client, storage and the NTS client carried.
// The slots live on globalThis so Next dev HMR doesn't multiply instances
// (same reason repositories/factory caches its bundle there).
//
// Semantics (pinned by lib/server/__tests__/_singleton.test.ts):
//   get()   → override ?? cache ?? build()   — build runs once per process for
//             sequential callers (a cold-start burst may build concurrently and
//             the last writer wins — same as the old per-module blocks; no
//             in-flight promise dedupe on purpose)
//   set(x)  → override slot; set(undefined) clears ONLY the override, so a test
//             double can be removed while the real cached instance survives
//   reset() → clears override and cache; an async build that was already in
//             flight completes for its caller but does NOT repopulate the slot
// `undefined` is the only "empty" sentinel — `null`/falsy values are real values.
// Groups let the test harness drop every *service* (they hold repos built on a
// previous PGlite bundle) without touching infra doubles a test installed in
// beforeAll: repositories/factory.__resetForTest() resets the 'service' group.
// HMR note: because slots live on globalThis and a re-evaluated module re-attaches
// to its existing slot, a cached instance (services AND the real infra clients)
// survives a dev-server hot reload until the process restarts — same as the old
// per-module globals did for services; new for nts/snowsign, whose real client
// used to live in a module-local `let`.
// Keys are free-form strings; uniqueness across modules is pinned by
// lib/server/__tests__/singleton-keys.test.ts (a same-key/same-group re-register
// is indistinguishable from an HMR re-evaluation, so it cannot throw here).

export type SingletonGroup = 'service' | 'infra';

// `gen` counts resets: an async build that was in flight when the slot was reset
// must not land in the reset slot (it was built on the previous repo bundle).
type Slot = { group: SingletonGroup; cache: unknown; override: unknown; gen: number };

declare global {
  var __bidit_singletons__: Map<string, Slot> | undefined;
}

function registry(): Map<string, Slot> {
  return (globalThis.__bidit_singletons__ ??= new Map());
}

function slotFor(key: string, group: SingletonGroup): Slot {
  const reg = registry();
  const existing = reg.get(key);
  if (existing) {
    if (existing.group !== group) {
      throw new Error(
        `singleton '${key}': already registered under group '${existing.group}', cannot re-register as '${group}'`,
      );
    }
    // HMR re-evaluated the defining module — keep the live slot (and instance).
    return existing;
  }
  const slot: Slot = { group, cache: undefined, override: undefined, gen: 0 };
  reg.set(key, slot);
  return slot;
}

export type Singleton<T> = {
  get: () => T;
  set: (value: T | undefined) => void;
  reset: () => void;
};

export type AsyncSingleton<T> = {
  get: () => Promise<T>;
  set: (value: T | undefined) => void;
  reset: () => void;
};

function clear(slot: Slot): void {
  slot.override = undefined;
  slot.cache = undefined;
  slot.gen += 1;
}

function slotApi<T>(slot: Slot): Pick<Singleton<T>, 'set' | 'reset'> {
  return {
    set: (value) => {
      slot.override = value;
    },
    reset: () => clear(slot),
  };
}

export function defineSingleton<T>(key: string, group: SingletonGroup, build: () => T): Singleton<T> {
  const slot = slotFor(key, group);
  return {
    get: () => {
      if (slot.override !== undefined) return slot.override as T;
      if (slot.cache === undefined) slot.cache = build();
      return slot.cache as T;
    },
    ...slotApi<T>(slot),
  };
}

export function defineAsyncSingleton<T>(
  key: string,
  group: SingletonGroup,
  build: () => Promise<T>,
): AsyncSingleton<T> {
  const slot = slotFor(key, group);
  return {
    get: async () => {
      if (slot.override !== undefined) return slot.override as T;
      if (slot.cache !== undefined) return slot.cache as T;
      const gen = slot.gen;
      const built = await build();
      // A reset during the await means `built` sits on a bundle that no longer
      // exists — hand it to this caller, but don't let it repopulate the slot.
      if (slot.gen === gen) slot.cache = built;
      return built;
    },
    ...slotApi<T>(slot),
  };
}

/** Test-only — drop override + cache of every singleton in `group` (all groups when omitted). */
export function __resetSingletonGroupForTest(group?: SingletonGroup): void {
  for (const slot of registry().values()) {
    if (group !== undefined && slot.group !== group) continue;
    clear(slot);
  }
}

/** Test-only — drop override + cache of every registered singleton. */
export function __resetAllSingletonsForTest(): void {
  __resetSingletonGroupForTest();
}
