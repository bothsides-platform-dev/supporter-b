import { readFileSync } from 'node:fs';
import { buildMatrix, formatReport, parseResultsText, summarizeResults } from './discovery-report';

const HELP = [
  'B2A 발견 평가 도구 — 하네스나 외부 API를 실행하지 않습니다.',
  'pnpm exec tsx scripts/b2a/discovery-eval.ts matrix <batch-id>',
  'pnpm exec tsx scripts/b2a/discovery-eval.ts report <results.json|results.jsonl> [--json]',
].join('\n');

function main(args: string[]): void {
  if (args.length === 0 || (args.length === 1 && args[0] === '--help')) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (args[0] === 'matrix' && args.length === 2) {
    process.stdout.write(`${buildMatrix(args[1]).map((row) => JSON.stringify(row)).join('\n')}\n`);
    return;
  }
  if (args[0] === 'report' && (args.length === 2 || (args.length === 3 && args[2] === '--json'))) {
    const report = summarizeResults(parseResultsText(readFileSync(args[1], 'utf8')));
    process.stdout.write(`${args[2] === '--json' ? JSON.stringify(report, null, 2) : formatReport(report)}\n`);
    return;
  }
  throw new Error(HELP);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : '평가 결과를 읽지 못했습니다.'}\n`);
  process.exitCode = 1;
}
