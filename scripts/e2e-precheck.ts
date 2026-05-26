/**
 * scripts/e2e-precheck.ts — kill a hung dev server on :3001 before `pnpm e2e`.
 *
 * Defends against this failure mode:
 *   A previous `pnpm dev --port 3001` (often Playwright's own webServer from
 *   a prior run) gets stuck in an uncaught-exception report loop — 100%+
 *   CPU, binds :3001, never answers HTTP. Playwright's webServer config
 *   has `reuseExistingServer: !process.env.CI` (true locally), so it skips
 *   the `command` field and polls `url` forever. Test run hangs at 0%
 *   with no spec ever starting.
 *
 * Strategy
 *   - Nothing on :3001 → no-op. Playwright will spin one up via `command`.
 *   - Something on :3001, HTTP responds within PROBE_TIMEOUT_MS → leave
 *     alone. Playwright reuses it (fast local iteration preserved).
 *   - Something on :3001, no HTTP response → SIGKILL the listening PID(s),
 *     wait for the port to free, exit. Playwright then starts fresh.
 *
 * Safe in CI: in CI `reuseExistingServer` is false and nothing is on
 * :3001, so the script no-ops. The dev port 3000 is never touched —
 * only :3001 (the e2e port).
 */
import { spawnSync } from 'node:child_process';

const PORT = Number(process.env.E2E_PRECHECK_PORT ?? 3001);
const PROBE_TIMEOUT_MS = Number(process.env.E2E_PRECHECK_TIMEOUT_MS ?? 3000);
const FREE_WAIT_MS = 5_000;

function getPidsOnPort(port: number): number[] {
  // `lsof -ti :PORT -sTCP:LISTEN` prints listening PIDs, one per line.
  // Exits non-zero with empty stdout when nothing matches — treat as empty.
  const r = spawnSync('lsof', ['-ti', `:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf-8',
  });
  return (r.stdout ?? '')
    .split('\n')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function probe(url: string, timeoutMs: number): Promise<boolean> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    // Any HTTP response (even 500) counts as alive — what we're filtering
    // out is the "TCP accept but never write a byte back" zombie state.
    await fetch(url, { signal: ac.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function waitForPortFree(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (getPidsOnPort(port).length === 0) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main(): Promise<void> {
  const pids = getPidsOnPort(PORT);
  if (pids.length === 0) {
    console.log(`[e2e-precheck] :${PORT} is free.`);
    return;
  }

  console.log(
    `[e2e-precheck] :${PORT} occupied by PID(s) ${pids.join(', ')} — probing…`,
  );
  const alive = await probe(`http://localhost:${PORT}/`, PROBE_TIMEOUT_MS);
  if (alive) {
    console.log(
      `[e2e-precheck] :${PORT} responds — leaving in place for Playwright reuse.`,
    );
    return;
  }

  console.warn(
    `[e2e-precheck] :${PORT} listener unresponsive (>${PROBE_TIMEOUT_MS}ms) — ` +
      `SIGKILL PID(s) ${pids.join(', ')}.`,
  );
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (err) {
      // ESRCH = process already gone; anything else we want to see.
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ESRCH') console.warn(`[e2e-precheck] kill ${pid} failed:`, err);
    }
  }

  const freed = await waitForPortFree(PORT, FREE_WAIT_MS);
  if (!freed) {
    throw new Error(
      `[e2e-precheck] :${PORT} still occupied ${FREE_WAIT_MS}ms after SIGKILL — abort.`,
    );
  }
  console.log(`[e2e-precheck] :${PORT} freed.`);
}

main().catch((err) => {
  console.error('[e2e-precheck] failed:', err);
  process.exit(1);
});
