// Operational/infra logging (server start, email sends, outbox failures). When
// AXIOM_TOKEN+AXIOM_DATASET are set, pino ships directly to Axiom via the
// @axiomhq/pino transport (self-hosted Lightsail — no Vercel Log Drain); otherwise
// → stdout, captured by `pm2 logs bidit`.
// For product/business events (rfp.created, bid.submitted) use lib/observability/log.ts (Sentry Logs) instead.
import { createRequire } from 'module';
import pinoLib from 'pino';

type Attrs = Record<string, unknown>;

export interface AppLogger {
  info(msg: string, attrs?: Attrs): void;
  warn(msg: string, attrs?: Attrs): void;
  error(msg: string, attrs?: Attrs): void;
  debug(msg: string, attrs?: Attrs): void;
}

function makeEdgeLogger(): AppLogger {
  const line = (level: string, msg: string, attrs?: Attrs): string =>
    JSON.stringify({ level, msg, time: Date.now(), ...attrs });
  return {
    info:  (msg, attrs) => { try { console.info( line('info',  msg, attrs)); } catch {} },
    warn:  (msg, attrs) => { try { console.warn( line('warn',  msg, attrs)); } catch {} },
    error: (msg, attrs) => { try { console.error(line('error', msg, attrs)); } catch {} },
    debug: (msg, attrs) => { try { console.debug(line('debug', msg, attrs)); } catch {} },
  };
}

function makeNodeLogger(): AppLogger {
  const defaultLevel = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
  const level = process.env.LOG_LEVEL ?? defaultLevel;
  // Development pretty output: pipe stdout through pino-pretty in your terminal.
  //   pnpm dev 2>&1 | pnpm exec pino-pretty
  const { AXIOM_TOKEN, AXIOM_DATASET } = process.env;
  const axiomPinoPath = createRequire(process.cwd() + '/package.json').resolve('@axiomhq/pino');
  const transport = (AXIOM_TOKEN && AXIOM_DATASET)
    ? pinoLib.transport({ target: axiomPinoPath, options: { token: AXIOM_TOKEN, dataset: AXIOM_DATASET } })
    : undefined;
  const p = transport ? pinoLib({ level }, transport) : pinoLib({ level });
  return {
    info:  (msg, attrs) => { try { p.info( attrs ?? {}, msg); } catch {} },
    warn:  (msg, attrs) => { try { p.warn( attrs ?? {}, msg); } catch {} },
    error: (msg, attrs) => { try { p.error(attrs ?? {}, msg); } catch {} },
    debug: (msg, attrs) => { try { p.debug(attrs ?? {}, msg); } catch {} },
  };
}

/** Creates a logger for the given runtime. Exported for testing. */
export function createLogger(runtime = process.env.NEXT_RUNTIME): AppLogger {
  return runtime === 'edge' ? makeEdgeLogger() : makeNodeLogger();
}

export const logger: AppLogger = createLogger();
