import { execFileSync } from 'node:child_process';
import { expect, it, vi } from 'vitest';
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
import { readFile } from 'node:fs/promises';
import { loadPlatformSeal } from '../platform-seal';

it('법인도장 원본은 공개 Git 저장소에 포함하지 않는다', () => {
  const path = 'lib/server/signing/assets/noon-seal-2026-10-21.png';
  expect(execFileSync('git', ['check-ignore', path], { encoding: 'utf8' }).trim()).toBe(path);
  expect(execFileSync('git', ['ls-files', '--', path], { encoding: 'utf8' }).trim()).toBe('');
});
it('비공개 원본이 없거나 판본이 다르면 날인을 거부한다', async () => {
  vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'));
  await expect(loadPlatformSeal()).rejects.toThrow('ENOENT');
  vi.mocked(readFile).mockResolvedValueOnce(Buffer.from('not the corporate seal'));
  await expect(loadPlatformSeal()).rejects.toThrow('PLATFORM_SEAL_CHANGED');
});
