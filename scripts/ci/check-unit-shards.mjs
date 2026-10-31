// Read the paginated `gh api .../jobs?filter=all` response from stdin.
// Matrix needs.result alone can miss a shard cancelled before acquiring a runner.
import { readFileSync } from 'node:fs';

try {
  const pages = JSON.parse(readFileSync(0, 'utf8'));
  if (
    !Array.isArray(pages) ||
    pages.some((page) => !Array.isArray(page.jobs))
  ) {
    throw new Error('Invalid workflow jobs response');
  }
  const jobs = pages.flatMap((page) => page.jobs);
  for (const name of ['unit shard 1/2', 'unit shard 2/2']) {
    const matches = jobs.filter((job) => job.name === name);
    if (
      !matches.length ||
      matches.some(
        (job) => !Number.isInteger(job.run_attempt) || job.run_attempt < 1,
      )
    ) {
      throw new Error(`Missing or invalid result for ${name}`);
    }
    // A failed-jobs rerun retains the other shard's earlier successful result.
    const attempt = Math.max(...matches.map((job) => job.run_attempt));
    const latest = matches.filter((job) => job.run_attempt === attempt);
    if (
      latest.length !== 1 ||
      latest[0].status !== 'completed' ||
      latest[0].conclusion !== 'success'
    ) {
      throw new Error(`${name} did not complete successfully`);
    }
  }
  console.log('Both unit shards completed successfully');
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Could not verify unit shards',
  );
  process.exitCode = 1;
}
