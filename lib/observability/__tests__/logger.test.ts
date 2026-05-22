import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted so the mock factory can close over them before any import runs.
const { pinoFactory, pinoTransport, pinoInfo, pinoWarn, pinoError, pinoDebug } = vi.hoisted(() => {
  const pinoInfo  = vi.fn();
  const pinoWarn  = vi.fn();
  const pinoError = vi.fn();
  const pinoDebug = vi.fn();
  const pinoTransport = vi.fn().mockReturnValue({});
  const pinoFactory = vi.fn().mockImplementation(() => ({
    info: pinoInfo, warn: pinoWarn, error: pinoError, debug: pinoDebug,
  })) as any;
  pinoFactory.transport = pinoTransport;
  return { pinoFactory, pinoTransport, pinoInfo, pinoWarn, pinoError, pinoDebug };
});

vi.mock('pino', () => ({ default: pinoFactory }));

import { createLogger } from '../logger';

describe('createLogger — Node.js runtime', () => {
  let log: ReturnType<typeof createLogger>;

  beforeEach(() => {
    pinoFactory.mockClear();
    pinoInfo.mockReset();
    pinoWarn.mockReset();
    pinoError.mockReset();
    pinoDebug.mockReset();
    log = createLogger('nodejs');
  });

  it('info calls pino.info(attrs, msg)', () => {
    log.info('rfp.created', { rfpId: 'P-2605-0001' });
    expect(pinoInfo).toHaveBeenCalledWith({ rfpId: 'P-2605-0001' }, 'rfp.created');
  });

  it('info passes empty object when no attrs given', () => {
    log.info('app.start');
    expect(pinoInfo).toHaveBeenCalledWith({}, 'app.start');
  });

  it('warn calls pino.warn(attrs, msg)', () => {
    log.warn('retry.attempt', { n: 2 });
    expect(pinoWarn).toHaveBeenCalledWith({ n: 2 }, 'retry.attempt');
  });

  it('error calls pino.error(attrs, msg)', () => {
    log.error('action.failed', { action: 'sendDraft' });
    expect(pinoError).toHaveBeenCalledWith({ action: 'sendDraft' }, 'action.failed');
  });

  it('debug calls pino.debug(attrs, msg)', () => {
    log.debug('db.query', { table: 'rfps' });
    expect(pinoDebug).toHaveBeenCalledWith({ table: 'rfps' }, 'db.query');
  });

  it('never throws even if pino throws', () => {
    pinoInfo.mockImplementation(() => { throw new Error('pino down'); });
    expect(() => log.info('crash')).not.toThrow();
  });
});

describe('createLogger — log level selection', () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origLogLevel = process.env.LOG_LEVEL;

  afterEach(() => {
    process.env.NODE_ENV  = origNodeEnv;
    process.env.LOG_LEVEL = origLogLevel;
    pinoFactory.mockClear();
  });

  it('uses debug level in development', () => {
    process.env.NODE_ENV  = 'development';
    delete process.env.LOG_LEVEL;
    createLogger('nodejs');
    expect(pinoFactory).toHaveBeenLastCalledWith(
      expect.objectContaining({ level: 'debug' }),
    );
  });

  it('uses info level in production', () => {
    process.env.NODE_ENV  = 'production';
    delete process.env.LOG_LEVEL;
    createLogger('nodejs');
    expect(pinoFactory).toHaveBeenLastCalledWith(
      expect.objectContaining({ level: 'info' }),
    );
  });

  it('LOG_LEVEL env var overrides NODE_ENV default', () => {
    process.env.NODE_ENV  = 'production';
    process.env.LOG_LEVEL = 'warn';
    createLogger('nodejs');
    expect(pinoFactory).toHaveBeenLastCalledWith(
      expect.objectContaining({ level: 'warn' }),
    );
  });
});

describe('createLogger — Edge runtime', () => {
  let log: ReturnType<typeof createLogger>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = createLogger('edge');
    infoSpy  = vi.spyOn(console, 'info' ).mockImplementation(() => {});
    warnSpy  = vi.spyOn(console, 'warn' ).mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('info calls console.info', () => {
    log.info('edge.info', { key: 'val' });
    expect(infoSpy).toHaveBeenCalledOnce();
  });

  it('warn calls console.warn', () => {
    log.warn('edge.warn');
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('error calls console.error', () => {
    log.error('edge.error', { code: 500 });
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('debug calls console.debug', () => {
    log.debug('edge.debug');
    expect(debugSpy).toHaveBeenCalledOnce();
  });

  it('log line is valid JSON with level and msg fields', () => {
    let captured = '';
    infoSpy.mockImplementation((line: string) => { captured = line; });
    log.info('edge.structured', { userId: 'u1' });
    const parsed = JSON.parse(captured);
    expect(parsed).toMatchObject({ level: 'info', msg: 'edge.structured', userId: 'u1' });
  });
});

describe('createLogger — Axiom transport', () => {
  const origToken   = process.env.AXIOM_TOKEN;
  const origDataset = process.env.AXIOM_DATASET;

  afterEach(() => {
    process.env.AXIOM_TOKEN   = origToken;
    process.env.AXIOM_DATASET = origDataset;
    pinoFactory.mockClear();
    pinoTransport.mockClear();
  });

  it('uses @axiomhq/pino transport when both AXIOM_TOKEN and AXIOM_DATASET are set', () => {
    process.env.AXIOM_TOKEN   = 'xapt-test-token';
    process.env.AXIOM_DATASET = 'bidit-prod';
    createLogger('nodejs');
    expect(pinoTransport).toHaveBeenCalledOnce();
    const callArg = pinoTransport.mock.calls[0][0] as { target: string; options: Record<string, string> };
    expect(path.isAbsolute(callArg.target)).toBe(true);
    expect(callArg.options).toMatchObject({ token: 'xapt-test-token', dataset: 'bidit-prod' });
  });

  it('does not use Axiom transport when AXIOM_TOKEN is absent', () => {
    delete process.env.AXIOM_TOKEN;
    process.env.AXIOM_DATASET = 'bidit-prod';
    createLogger('nodejs');
    expect(pinoTransport).not.toHaveBeenCalled();
  });

  it('does not use Axiom transport when AXIOM_DATASET is absent', () => {
    process.env.AXIOM_TOKEN = 'xapt-test-token';
    delete process.env.AXIOM_DATASET;
    createLogger('nodejs');
    expect(pinoTransport).not.toHaveBeenCalled();
  });
});
