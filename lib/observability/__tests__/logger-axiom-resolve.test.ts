// Regression tests for the instrumentation-hook crash:
// "Cannot find module '@axiomhq/pino'" (Sentry issue 7499226682).
//
// Root cause: createRequire(...).resolve('@axiomhq/pino') ran unconditionally
// in makeNodeLogger() — before the AXIOM_TOKEN && AXIOM_DATASET guard — so a
// missing/unresolvable package crashed the module-level `export const logger`
// and brought down the whole instrumentation register() hook.
//
// These tests use a controlled resolver mock so we can simulate the crash
// without depending on the real filesystem layout (process.cwd() fragility).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mock factories so they are established before any module imports.
const { resolveMock, createRequireMock, pinoTransport, pinoFactory } = vi.hoisted(() => {
  const resolveMock = vi.fn();
  const createRequireMock = vi.fn(() => ({ resolve: resolveMock }));
  const pinoTransport = vi.fn().mockReturnValue({});
  const pinoFactory = Object.assign(
    vi.fn().mockImplementation(() => ({
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    })),
    { transport: pinoTransport },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
  return { resolveMock, createRequireMock, pinoTransport, pinoFactory };
});

// Mock the node `module` builtin so we control createRequire.
vi.mock('module', () => ({ createRequire: createRequireMock }));
// Mock pino so tests don't hit real worker-thread transport setup.
vi.mock('pino', () => ({ default: pinoFactory }));

import { createLogger } from '../logger';

describe('makeNodeLogger — @axiomhq/pino resolution safety', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    pinoFactory.mockClear();
    pinoTransport.mockClear();
    resolveMock.mockClear();
    createRequireMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not call resolve when Axiom is not configured', () => {
    // Simulate the production crash condition: resolver would throw if called.
    resolveMock.mockImplementation(() => {
      throw new Error("Cannot find module '@axiomhq/pino'");
    });
    vi.stubEnv('AXIOM_TOKEN', '');
    vi.stubEnv('AXIOM_DATASET', '');

    // Must not throw even though the resolver would blow up.
    expect(() => createLogger('nodejs')).not.toThrow();
    // And resolve must never have been called — no point touching the package.
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('does not throw when Axiom is configured but resolution fails', () => {
    // Simulate: AXIOM_TOKEN & AXIOM_DATASET set, but @axiomhq/pino not in node_modules.
    resolveMock.mockImplementation(() => {
      throw new Error("Cannot find module '@axiomhq/pino'");
    });
    vi.stubEnv('AXIOM_TOKEN', 'xapt-test-token');
    vi.stubEnv('AXIOM_DATASET', 'bidit-prod');

    // Should degrade gracefully — no throw.
    expect(() => createLogger('nodejs')).not.toThrow();
    // Transport must not have been set up (resolution failed before pinoLib.transport).
    expect(pinoTransport).not.toHaveBeenCalled();
    // But a plain pino logger must still be constructed (stdout fallback).
    expect(pinoFactory).toHaveBeenCalledOnce();
  });
});
