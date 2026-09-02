// Process-wide singletons for services and infra clients.
//
// One registry replaces the per-module copy of
//   declare global { var __bidit_x__ } + getX() + __setXForTest + __resetXForTest
// that every service, the SnowSign client, storage and the NTS client carried.
// The slots live on globalThis so Next dev HMR doesn't multiply instances
// (same reason repositories/factory caches its bundle there).
//
// Semantics (pinned by lib/server/__tests__/_singleton.test.ts):
//   get()   → override ?? cache ?? build()   — build runs once per process
//   set(x)  → override slot; set(undefined) clears ONLY the override, so a test
//             double can be removed while the real cached instance survives
//   reset() → clears override and cache
// Groups let the test harness drop every *service* (they hold repos built on a
// previous PGlite bundle) without touching infra doubles a test installed in
// beforeAll: repositories/factory.__resetForTest() resets the 'service' group.

export type SingletonGroup = 'service' | 'infra';

type Slot = { group: SingletonGroup; cache: unknown; override: unknown };

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
        `defineSingleton('${key}'): already registered under group '${existing.group}', cannot re-register as '${group}'`,
      );
    }
    // HMR re-evaluated the defining module — keep the live slot (and instance).
    return existing;
  }
  const slot: Slot = { group, cache: undefined, override: undefined };
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

export function defineSingleton<T>(key: string, group: SingletonGroup, build: () => T): Singleton<T> {
  const slot = slotFor(key, group);
  return {
    get: () => {
      if (slot.override !== undefined) return slot.override as T;
      if (slot.cache === undefined) slot.cache = build();
      return slot.cache as T;
    },
    set: (value) => {
      slot.override = value;
    },
    reset: () => {
      slot.override = undefined;
      slot.cache = undefined;
    },
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
      if (slot.cache === undefined) slot.cache = await build();
      return slot.cache as T;
    },
    set: (value) => {
      slot.override = value;
    },
    reset: () => {
      slot.override = undefined;
      slot.cache = undefined;
    },
  };
}

/** Test-only — drop override + cache of every singleton in `group`. */
export function __resetSingletonGroupForTest(group: SingletonGroup): void {
  for (const slot of registry().values()) {
    if (slot.group !== group) continue;
    slot.override = undefined;
    slot.cache = undefined;
  }
}

/** Test-only — drop override + cache of every registered singleton. */
export function __resetAllSingletonsForTest(): void {
  for (const slot of registry().values()) {
    slot.override = undefined;
    slot.cache = undefined;
  }
}
