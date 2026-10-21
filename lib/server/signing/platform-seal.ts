import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const PLATFORM_SEAL = {
  version: 'noon-2026-10-21',
  sha256: '008201905d3942bd6228cc472b99ee3afa4cf84441c0d54a4dac0ee5533aadc8',
} as const;

/** Installed privately on the server; never committed to the public repository. */
export async function loadPlatformSeal() {
  const bytes = await readFile(path.join(process.cwd(), 'lib/server/signing/assets/noon-seal-2026-10-21.png'));
  if (createHash('sha256').update(bytes).digest('hex') !== PLATFORM_SEAL.sha256)
    throw new Error('PLATFORM_SEAL_CHANGED');
  return bytes;
}
