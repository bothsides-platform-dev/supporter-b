import * as Sentry from '@sentry/nextjs';

// Structured business-event logging via Sentry Logs (init has `enableLogs: true`
// on the server). Logs have a generous free-plan budget (5GB/mo), but centralise
// here so call sites stay consistent and one place can throttle if needed.
//
// Server-side only — the client Sentry init does not enable logs.

type LogAttrs = Record<string, unknown>;
type LogLevel = 'info' | 'warn' | 'error';

function emit(level: LogLevel, name: string, attrs?: LogAttrs): void {
  try {
    Sentry.logger?.[level]?.(name, attrs);
  } catch {
    // Telemetry must never break the path it instruments.
  }
}

export function logBusinessEvent(name: string, attrs?: LogAttrs): void {
  emit('info', name, attrs);
}

export function logBusinessWarn(name: string, attrs?: LogAttrs): void {
  emit('warn', name, attrs);
}

export function logBusinessError(name: string, attrs?: LogAttrs): void {
  emit('error', name, attrs);
}
