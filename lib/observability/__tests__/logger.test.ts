import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted so the mock factory can close over them before any import runs.
const { pinoFactory, pinoTransport, pinoInfo, pinoWarn, pinoError, pinoDebug } = vi.hoisted(() => {
  const pinoInfo  = vi.fn();
  const pinoWarn  = vi.fn();
  const pinoError = vi.fn();
  const pinoDebug = vi.fn();
  const pinoTransport = vi.fn().mockReturnValue({});
  const pinoFactory = Object.assign(
    vi.fn().mockImplementation(() => ({
      info: pinoInfo, warn: pinoWarn, error: pinoError, debug: pinoDebug,
    })),
    { transport: pinoTransport },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock is used both as the pino fn and a vitest Mock (mockClear); no single precise type fits.
  ) as any;
  return { pinoFactory, pinoTransport, pinoInfo, pinoWarn, pinoError, pinoDebug };
});

vi.mock('pino', () => ({ default: pinoFactory }));

import { createLogger } from '../logger';

// 이 파일의 단언 다수가 "pino 가 인자 **하나로** 불렸다"·"transport 가 **한 번**
// 불렸다" 형태라, 주변 환경에 `AXIOM_*` 이 없다는 것을 **암묵적으로** 깔고 있었다.
// 그 가정은 로컬 풀 스위트에서 깨진다 — 워커들이 공유하는 `process.env` 에 `.env` 가
// 실려 들어오면(예: `scripts/seed.ts` 의 import 시점 `dotenv/config`) `logger.ts` 가
// transport 분기를 타서 ① pino 호출에 2번째 인자가 붙고 ② transport 호출이 describe
// 블록을 넘어 누적된다. 원인 하나가 관측된 4건을 전부 설명한다. 한 줄로 재현된다:
//
//   AXIOM_TOKEN=x AXIOM_DATASET=y pnpm exec vitest run lib/observability/__tests__/logger.test.ts
//
// 그래서 가정을 **명시**한다 — 환경을 실제로 재는 블록은 자기 자리에서 다시 stub 한다.
// `pinoTransport` 도 여기서 비운다: 누적은 블록 경계를 넘어 일어나므로 파일 단위로
// 막아야 한다(블록별 afterEach 만으로는 ②가 다시 산다).
beforeEach(() => {
  vi.stubEnv('AXIOM_TOKEN', '');
  vi.stubEnv('AXIOM_DATASET', '');
  pinoTransport.mockClear();
});

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
  // NODE_ENV is typed read-only by @types/node — use vi.stubEnv (not direct
  // assignment) and restore via unstubAllEnvs.
  afterEach(() => {
    vi.unstubAllEnvs();
    pinoFactory.mockClear();
  });

  it('uses debug level in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOG_LEVEL', undefined);
    createLogger('nodejs');
    expect(pinoFactory).toHaveBeenLastCalledWith(
      expect.objectContaining({ level: 'debug' }),
    );
  });

  it('uses info level in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', undefined);
    createLogger('nodejs');
    expect(pinoFactory).toHaveBeenLastCalledWith(
      expect.objectContaining({ level: 'info' }),
    );
  });

  it('LOG_LEVEL env var overrides NODE_ENV default', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'warn');
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
  // 환경 조작은 `vi.stubEnv` 하나로 통일한다. 직접 `process.env` 에 쓰고 저장해 둔 값을
  // 되돌리는 방식은 형제 파일(`logger-axiom-resolve.test.ts`)이 같은 키를 stub 하고
  // `vi.unstubAllEnvs()` 로 되돌릴 때 서로의 값을 지운다 — 두 기법이 같은 키를 두고
  // 싸우면 어느 쪽이 이기는지가 실행 순서에 달린다. 한 기법이면 그 축이 사라진다.
  afterEach(() => {
    vi.unstubAllEnvs();
    pinoFactory.mockClear();
    pinoTransport.mockClear();
  });

  it('uses @axiomhq/pino transport when both AXIOM_TOKEN and AXIOM_DATASET are set', () => {
    vi.stubEnv('AXIOM_TOKEN', 'xapt-test-token');
    vi.stubEnv('AXIOM_DATASET', 'bidit-prod');
    createLogger('nodejs');
    expect(pinoTransport).toHaveBeenCalledOnce();
    const callArg = pinoTransport.mock.calls[0][0] as { target: string; options: Record<string, string> };
    expect(path.isAbsolute(callArg.target)).toBe(true);
    expect(callArg.options).toMatchObject({ token: 'xapt-test-token', dataset: 'bidit-prod' });
  });

  // `vi.stubEnv(k, undefined)` 는 키를 지운다 — `delete process.env[k]` 와 같은 뜻이되
  // 되돌리기가 `unstubAllEnvs` 한 곳으로 모인다.
  it('does not use Axiom transport when AXIOM_TOKEN is absent', () => {
    vi.stubEnv('AXIOM_TOKEN', undefined);
    vi.stubEnv('AXIOM_DATASET', 'bidit-prod');
    createLogger('nodejs');
    expect(pinoTransport).not.toHaveBeenCalled();
  });

  it('does not use Axiom transport when AXIOM_DATASET is absent', () => {
    vi.stubEnv('AXIOM_TOKEN', 'xapt-test-token');
    vi.stubEnv('AXIOM_DATASET', undefined);
    createLogger('nodejs');
    expect(pinoTransport).not.toHaveBeenCalled();
  });
});
