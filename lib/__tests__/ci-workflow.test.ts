// @vitest-environment node
// Guards the CI workflow used by release PRs.
// Value: protects=the e2e job in .github/workflows/ci.yml needs exactly
//   [lint], so it runs alongside unit instead of after it;
//   fails_when=a back-merge conflict resolution or a revert restores
//   needs: [lint, unit-test] or drops lint (CI stays green, so nothing else
//   signals the lost decision);
//   why_new=no other test reads ci.yml; seam=none;
//   no_claim=GitHub Actions scheduling and branch protection (text read of
//   the e2e block; no YAML parser, no live run)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// No YAML parser is a direct dependency, so this reads the e2e job block as
// text. Every lookup throws when the expected shape is missing: a guard that
// cannot find its target must fail, not pass.
function e2eJobBlock(): string[] {
  const lines = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8').split(
    '\n',
  );
  const start = lines.indexOf('  e2e:');
  if (start === -1)
    throw new Error('ci.yml: no "  e2e:" job found; update this guard');
  const rest = lines.slice(start + 1);
  // The block ends at the next key indented two spaces or less (next job).
  const end = rest.findIndex((line) => /^ {0,2}[^\s#]/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

function unquote(name: string): string {
  return name.trim().replace(/^(['"])(.*)\1$/, '$2');
}

// Reads only the single-line spellings of `needs` (flow list or scalar). A
// block list throws instead of being parsed: stopping at an interleaved
// comment or blank line would silently drop items and keep the guard green.
function e2eNeeds(): string[] {
  const found = e2eJobBlock().flatMap((line) => {
    const match = line.match(/^ {4}needs:(.*)$/);
    return match ? [match[1].replace(/\s+#.*$/, '').trim()] : [];
  });
  if (found.length !== 1) {
    throw new Error(
      `ci.yml e2e job: expected one "needs:" key, found ${found.length}`,
    );
  }
  const [raw] = found;
  if (raw === '') {
    throw new Error(
      'ci.yml e2e needs: block list is not supported; write it on one line or update this guard',
    );
  }
  if (!raw.startsWith('[')) return [unquote(raw)];
  if (!raw.endsWith(']'))
    throw new Error(`ci.yml e2e needs: unclosed list "${raw}"`);
  return raw.slice(1, -1).split(',').map(unquote).filter(Boolean);
}

describe('ci workflow e2e job', () => {
  it('waits only on lint, so it runs alongside the unit job', () => {
    expect(
      e2eNeeds(),
      'e2e must not wait on unit-test (2026-10-21: parallel cuts the main run from ~29 to ~18 min)',
    ).toEqual(['lint']);
  });
});

// Execute the workflow's gate command, including non-success conclusions.
// This verifies the fail-closed gate locally; GitHub scheduling itself is not simulated.
describe('unit shard gate', () => {
  const workflow = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
  const job = (id: string) => {
    const block = workflow.match(
      new RegExp(
        `^  ${id}:\\n[\\s\\S]*?(?=^  [a-z][a-z0-9-]*:|$(?![\\s\\S]))`,
        'm',
      ),
    )?.[0];
    if (!block) throw new Error(`Missing CI job: ${id}`);
    return block;
  };

  it.each(['success', 'failure', 'cancelled', 'skipped'])(
    'accepts only success, including %s',
    (result) => {
      const gate = job('unit-test');
      expect(gate).toContain('name: unit (vitest)');
      expect(gate).toContain('if: always()');
      expect(gate).toContain('needs: [unit-shard]');
      expect(gate).toContain('UNIT_RESULT: ${{ needs.unit-shard.result }}');
      const command = gate.match(/^        run: (.+)$/m)?.[1];
      expect(command).toBeDefined();
      const run = spawnSync('bash', ['-c', command!], {
        env: { ...process.env, UNIT_RESULT: result },
      });
      expect(run.status).toBe(result === 'success' ? 0 : 1);
    },
  );

  it('checks actual shard jobs and fails closed on an API error', () => {
    const gate = job('unit-test');
    expect(gate).toContain('actions: read');
    expect(gate).toContain('GH_TOKEN: ${{ github.token }}');
    const command = gate.match(/^          (gh api .+)$/m)?.[1];
    expect(command).toContain('$GITHUB_RUN_ID/jobs?filter=all&per_page=100');
    const jobs = [1, 2].map((index) => ({
      name: `unit shard ${index}/2`,
      run_attempt: 1,
      status: 'completed',
      conclusion: 'success',
    }));
    for (const apiExit of [0, 1]) {
      const run = spawnSync(
        'bash',
        [
          '-eo',
          'pipefail',
          '-c',
          `gh() { printf '%s' "$MOCK_JOBS"; return "$API_EXIT"; }; ${command}`,
        ],
        {
          env: {
            ...process.env,
            MOCK_JOBS: JSON.stringify([{ jobs }]),
            API_EXIT: String(apiExit),
          },
        },
      );
      expect(run.status).toBe(apiExit);
    }
  });

  it('runs both shards without fail-fast and keeps deployment behind the gate', () => {
    const shards = job('unit-shard');
    expect(shards).toContain('fail-fast: false');
    expect(shards).toContain('shard: [1, 2]');
    expect(shards).toContain('pnpm test -- --shard=${{ matrix.shard }}/2');
    expect(job('deploy-staging')).toContain(
      'needs: [lint, unit-test, build-staging]',
    );
  });
});

describe('individual unit shard conclusions', () => {
  const shard = (
    index: number,
    conclusion: string | null = 'success',
    attempt = 1,
  ) => ({
    name: `unit shard ${index}/2`,
    status: 'completed',
    conclusion,
    run_attempt: attempt,
  });
  const check = (pages: unknown) =>
    spawnSync(process.execPath, ['scripts/ci/check-unit-shards.mjs'], {
      input: JSON.stringify(pages),
      encoding: 'utf8',
    });

  it('accepts both successful shards across paginated jobs', () => {
    expect(
      check([
        { jobs: [shard(1)] },
        { jobs: [shard(2), { name: 'e2e', conclusion: 'skipped' }] },
      ]).status,
    ).toBe(0);
  });

  it.each(['failure', 'cancelled', 'skipped', null])(
    'rejects a %s shard even when the matrix result says success',
    (conclusion) => {
      expect(check([{ jobs: [shard(1), shard(2, conclusion)] }]).status).toBe(
        1,
      );
    },
  );

  it('rejects missing, unfinished, duplicate and malformed results', () => {
    for (const jobs of [
      [shard(1)],
      [shard(1), { ...shard(2), status: 'in_progress' }],
      [shard(1), shard(2), shard(2)],
    ]) {
      expect(check([{ jobs }]).status).toBe(1);
    }
    expect(check({ message: 'API unavailable' }).status).toBe(1);
  });

  it('uses the latest attempt of each shard when rerunning failed jobs', () => {
    expect(
      check([{ jobs: [shard(1), shard(2, 'failure'), shard(2, 'success', 2)] }])
        .status,
    ).toBe(0);
    expect(
      check([{ jobs: [shard(1), shard(2), shard(2, 'cancelled', 2)] }]).status,
    ).toBe(1);
  });
});
