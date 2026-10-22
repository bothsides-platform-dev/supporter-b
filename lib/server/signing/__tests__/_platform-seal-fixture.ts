import { vi } from 'vitest';

// CI uses a synthetic pixel. The real PDF renderer/hash checks still run;
// the private corporate original is only used for local/deployment verification.
vi.mock('@/lib/server/signing/platform-seal', async () => {
  const { createHash } = await import('node:crypto');
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=', 'base64');
  return {
    PLATFORM_SEAL: { version: 'synthetic-test-only', sha256: createHash('sha256').update(bytes).digest('hex') },
    loadPlatformSeal: async () => bytes,
  };
});
