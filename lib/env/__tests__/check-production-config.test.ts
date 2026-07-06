import { describe, it, expect } from 'vitest';

// Baseline valid production env — individual tests knock out one variable at
// a time so each assertion isolates a single check.
const R2_ENV = {
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
};

describe('checkProductionConfig', () => {
  it('throws when NODE_ENV=production and RESEND_API_KEY is empty string', async () => {
    const { checkProductionConfig } = await import('../check-production-config');
    expect(() =>
      checkProductionConfig({
        NODE_ENV: 'production',
        RESEND_API_KEY: '',
        ...R2_ENV,
      } as NodeJS.ProcessEnv),
    ).toThrow('RESEND_API_KEY is set to an empty string in production');
  });

  it('does not throw when NODE_ENV=production and RESEND_API_KEY is a non-empty string', async () => {
    const { checkProductionConfig } = await import('../check-production-config');
    expect(() =>
      checkProductionConfig({
        NODE_ENV: 'production',
        RESEND_API_KEY: 're_abc123',
        ...R2_ENV,
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('does not throw when NODE_ENV=production and RESEND_API_KEY is undefined', async () => {
    const { checkProductionConfig } = await import('../check-production-config');
    expect(() =>
      checkProductionConfig({ NODE_ENV: 'production', ...R2_ENV } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('does not throw in development even when RESEND_API_KEY is empty string', async () => {
    const { checkProductionConfig } = await import('../check-production-config');
    expect(() =>
      checkProductionConfig({ NODE_ENV: 'development', RESEND_API_KEY: '' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('does not throw in test even when RESEND_API_KEY is empty string', async () => {
    const { checkProductionConfig } = await import('../check-production-config');
    expect(() =>
      checkProductionConfig({ NODE_ENV: 'test', RESEND_API_KEY: '' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('throws at boot when NODE_ENV=production and any single R2 var is missing', async () => {
    const { checkProductionConfig } = await import('../check-production-config');
    for (const missing of Object.keys(R2_ENV)) {
      const env = { NODE_ENV: 'production', ...R2_ENV, [missing]: undefined };
      expect(() => checkProductionConfig(env as NodeJS.ProcessEnv)).toThrow(missing);
    }
  });

  it('throws at boot when NODE_ENV=production and all R2 vars are missing', async () => {
    const { checkProductionConfig } = await import('../check-production-config');
    expect(() =>
      checkProductionConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow('R2');
  });

  it('does not throw in development when R2 vars are missing', async () => {
    const { checkProductionConfig } = await import('../check-production-config');
    expect(() =>
      checkProductionConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
