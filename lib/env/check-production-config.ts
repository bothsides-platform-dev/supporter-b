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

  // Attachment storage is R2-only in production (no bytea/disk fallback).
  // getStorage() also throws on incomplete config, but only at the first
  // file request — checking here at boot turns a silent per-request 500
  // into a PM2-visible crash so a bad deploy is caught immediately.
  const missingR2 = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
  ].filter((name) => !env[name]);
  if (missingR2.length > 0) {
    throw new Error(
      `Missing R2 attachment-storage configuration in production: ${missingR2.join(', ')}. ` +
        'All four R2_* variables are required — see docs/DEPLOY_LIGHTSAIL.md.',
    );
  }
}
