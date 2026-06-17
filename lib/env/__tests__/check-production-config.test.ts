import { describe, it, expect } from 'vitest';

describe('checkProductionConfig', () => {
  it('throws when NODE_ENV=production and RESEND_API_KEY is empty string', async () => {
    const { checkProductionConfig } = await import('../check-production-config');
    expect(() =>
      checkProductionConfig({ NODE_ENV: 'production', RESEND_API_KEY: '' } as NodeJS.ProcessEnv),
    ).toThrow('RESEND_API_KEY is set to an empty string in production');
  });

  it('does not throw when NODE_ENV=production and RESEND_API_KEY is a non-empty string', async () => {
    const { checkProductionConfig } = await import('../check-production-config');
    expect(() =>
      checkProductionConfig({ NODE_ENV: 'production', RESEND_API_KEY: 're_abc123' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('does not throw when NODE_ENV=production and RESEND_API_KEY is undefined', async () => {
    const { checkProductionConfig } = await import('../check-production-config');
    expect(() =>
      checkProductionConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
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
});
