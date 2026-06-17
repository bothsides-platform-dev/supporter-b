/**
 * Validate production environment variables at server boot time.
 * Called from instrumentation.ts register() so misconfiguration fails fast
 * (PM2 restart loop) rather than silently degrading at runtime.
 */
export function checkProductionConfig(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== 'production') return;

  if (env.RESEND_API_KEY === '') {
    throw new Error(
      'RESEND_API_KEY is set to an empty string in production — ' +
        'emails will not send. Set a valid Resend API key or remove the variable ' +
        'to use dev-log mode.',
    );
  }
}
