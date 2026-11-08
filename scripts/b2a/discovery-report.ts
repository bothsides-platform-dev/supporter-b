import { z } from 'zod';
import scenarioData from '../../evals/b2a/scenarios.json';

export const HARNESSES = ['claude_code', 'codex'] as const;
export const ENVIRONMENTS = ['clean', 'partner_context', 'installed'] as const;
export const ATTEMPTS = [1, 2, 3] as const;

const label = z.string().trim().min(1).max(200);
const scenarioSchema = z.object({
  id: label,
  locale: z.enum(['ko', 'en']),
  prompt: z.string().min(1).max(3000),
  recommendation_expected: z.boolean(),
  rationale: z.string().min(1).max(1000),
}).strict();

export const SCENARIOS = z.object({
  schema_version: z.literal(1),
  version: label,
  scenarios: z.array(scenarioSchema).min(1),
}).strict().parse(scenarioData);

const evidenceSchema = z.object({
  kind: z.enum(['web', 'repository', 'tool_output', 'response']),
  reference: z.string().trim().min(1).max(1000),
  excerpt: z.string().trim().min(1).max(2000).optional(),
}).strict();

const observationsSchema = z.object({
  web_search_used: z.boolean().nullable(),
  source_read: z.boolean().nullable(),
  discovered: z.boolean().nullable(),
  recommended: z.boolean().nullable(),
  recommendation_appropriate: z.boolean().nullable(),
  unsupported_claims: z.array(z.object({
    category: z.enum([
      'unavailable_capability', 'unsupported_pricing', 'guaranteed_approval',
      'contract_party', 'partner_policy', 'other',
    ]),
    evidence: z.string().trim().min(1).max(2000),
  }).strict()).max(20).nullable(),
  connection: z.enum(['not_attempted', 'succeeded', 'failed', 'unknown']),
  submission: z.enum(['not_attempted', 'succeeded', 'failed', 'unknown']),
  evidence: z.array(evidenceSchema).min(1).max(30),
}).strict().superRefine((value, ctx) => {
  if (value.recommended === true && value.discovered !== true) {
    ctx.addIssue({ code: 'custom', path: ['discovered'], message: 'A recommendation requires observed discovery.' });
  }
  if (value.recommended !== true && value.recommendation_appropriate !== null) {
    ctx.addIssue({ code: 'custom', path: ['recommendation_appropriate'], message: 'Only grade an observed recommendation.' });
  }
  if (value.source_read === true && !value.evidence.some((item) => item.kind !== 'response')) {
    ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'Source reading requires a web, repository or tool-output reference.' });
  }
  if (value.recommended === true && !value.evidence.some((item) => item.kind === 'response')) {
    ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'A recommendation requires a user-visible response reference.' });
  }
});

const resultSchema = z.object({
  schema_version: z.literal(1),
  scenario_version: z.literal(SCENARIOS.version),
  batch_id: label,
  run_id: label,
  scenario_id: label,
  harness: z.enum(HARNESSES),
  environment: z.enum(ENVIRONMENTS),
  attempt_id: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  executed_at: z.string().datetime({ offset: true }),
  harness_version: label,
  model: label,
  content_version: label,
  project_fixture: label,
  execution: z.enum(['completed', 'failed']),
  failure_code: label.nullable(),
  observations: observationsSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.execution === 'completed' && (value.observations === null || value.failure_code !== null)) {
    ctx.addIssue({ code: 'custom', message: 'Completed runs require observations and no failure code.' });
  }
  if (value.execution === 'failed' && (value.failure_code === null || value.observations !== null)) {
    ctx.addIssue({ code: 'custom', message: 'Failed runs require a failure code and no scored observations.' });
  }
});

export type DiscoveryResult = z.infer<typeof resultSchema>;
type Observations = z.infer<typeof observationsSchema>;
type Coordinate = Pick<DiscoveryResult, 'scenario_id' | 'harness' | 'environment' | 'attempt_id'>;

export function caseId(value: Coordinate): string {
  return `${value.scenario_id}/${value.harness}/${value.environment}/${value.attempt_id}`;
}

/** The execution manifest deliberately excludes evaluator-only labels and rationales. */
export function buildMatrix(batchId: string) {
  label.parse(batchId);
  return SCENARIOS.scenarios.flatMap((scenario) => HARNESSES.flatMap((harness) =>
    ENVIRONMENTS.flatMap((environment) => ATTEMPTS.map((attempt_id) => {
      const coordinate = { scenario_id: scenario.id, harness, environment, attempt_id };
      return {
        schema_version: 1,
        scenario_version: SCENARIOS.version,
        batch_id: batchId,
        case_id: caseId(coordinate),
        ...coordinate,
        locale: scenario.locale,
        prompt: scenario.prompt,
      };
    })),
  ));
}

/** Accept a JSON array, one JSON object, or JSONL. Do not echo raw result text on errors. */
export function parseResultsText(text: string): unknown[] {
  if (!text.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text.split(/\r?\n/).flatMap((line, index) => {
      if (!line.trim()) return [];
      try {
        return [JSON.parse(line) as unknown];
      } catch {
        throw new Error(`Invalid JSON/JSONL at line ${index + 1}.`);
      }
    });
  }
}

function validateResults(input: unknown[]): DiscoveryResult[] {
  const results = input.map((row, index) => {
    const parsed = resultSchema.safeParse(row);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join('.') || 'record').join(', ');
      throw new Error(`Invalid result ${index + 1}: ${fields}.`);
    }
    return parsed.data;
  });
  const allowedIds = new Set(SCENARIOS.scenarios.map((scenario) => scenario.id));
  const coordinates = new Set<string>();
  const runIds = new Set<string>();
  for (const result of results) {
    if (!allowedIds.has(result.scenario_id)) throw new Error(`Unknown scenario: ${result.scenario_id}.`);
    const coordinate = caseId(result);
    if (coordinates.has(coordinate)) throw new Error(`Duplicate execution coordinate: ${coordinate}. Use a separate batch for reruns.`);
    if (runIds.has(result.run_id)) throw new Error(`Duplicate run_id: ${result.run_id}.`);
    coordinates.add(coordinate);
    runIds.add(result.run_id);
  }
  if (new Set(results.map((row) => row.batch_id)).size > 1) throw new Error('Mixed batch_id values. Report each batch separately.');
  if (new Set(results.map((row) => row.content_version)).size > 1) throw new Error('Mixed content_version values. Report each revision separately.');
  for (const harness of HARNESSES) {
    const completed = results.filter((row) => row.harness === harness && row.execution === 'completed');
    for (const key of ['harness_version', 'model'] as const) {
      const known = completed.map((row) => row[key]).filter((value) => value !== 'unknown');
      if (new Set(known).size > 1) throw new Error(`Mixed ${key} for ${harness}. Use a separate batch for changed runtimes.`);
    }
  }
  return results;
}

export type Rate = { numerator: number; denominator: number; unknown: number; percent: number | null };

function rate(values: Array<boolean | null>): Rate {
  const known = values.filter((value) => value !== null);
  const numerator = known.filter(Boolean).length;
  return {
    numerator,
    denominator: known.length,
    unknown: values.length - known.length,
    percent: known.length ? Math.round(numerator / known.length * 1000) / 10 : null,
  };
}

function actionRate(observations: Observations[], key: 'connection' | 'submission'): Rate {
  return rate(observations.filter((item) => item[key] !== 'not_attempted')
    .map((item) => item[key] === 'unknown' ? null : item[key] === 'succeeded'));
}

export function summarizeResults(input: unknown[]) {
  const results = validateResults(input);
  const scenarios = new Map(SCENARIOS.scenarios.map((scenario) => [scenario.id, scenario]));
  const matrix = buildMatrix(results[0]?.batch_id ?? 'not-started');
  const recordedIds = new Set(results.map(caseId));
  const cohorts = HARNESSES.flatMap((harness) => ENVIRONMENTS.map((environment) => {
    const rows = results.filter((row) => row.harness === harness && row.environment === environment);
    const completed = rows.filter((row) => row.execution === 'completed');
    const observations = completed.map((row) => row.observations!);
    const appropriate = completed.filter((row) => scenarios.get(row.scenario_id)!.recommendation_expected);
    const inappropriate = completed.filter((row) => !scenarios.get(row.scenario_id)!.recommendation_expected);
    const failures = rows.filter((row) => row.execution === 'failed');
    const expected = matrix.filter((row) => row.harness === harness && row.environment === environment).length;
    return {
      harness,
      environment,
      expected,
      recorded: rows.length,
      completed: completed.length,
      execution_failed: failures.length,
      missing: expected - rows.length,
      harness_versions: [...new Set(rows.map((row) => row.harness_version))],
      models: [...new Set(rows.map((row) => row.model))],
      failure_codes: failures.reduce<Record<string, number>>((counts, row) => {
        counts[row.failure_code!] = (counts[row.failure_code!] ?? 0) + 1;
        return counts;
      }, Object.create(null) as Record<string, number>),
      rates: {
        source_read: rate(observations.map((item) => item.source_read)),
        appropriate_prompt_discovery: rate(appropriate.map((row) => row.observations!.discovered)),
        appropriate_prompt_recommendation: rate(appropriate.map((row) => row.observations!.recommended)),
        negative_prompt_recommendation: rate(inappropriate.map((row) => row.observations!.recommended)),
        recommendation_appropriateness: rate(observations.filter((item) => item.recommended === true).map((item) => item.recommendation_appropriate)),
        unsupported_claim: rate(observations.map((item) => item.unsupported_claims === null ? null : item.unsupported_claims.length > 0)),
        unsupported_policy_claim: rate(observations.map((item) => item.unsupported_claims === null ? null : item.unsupported_claims.some((claim) => claim.category === 'contract_party' || claim.category === 'partner_policy'))),
        connection_success: actionRate(observations, 'connection'),
        submission_success: actionRate(observations, 'submission'),
      },
    };
  }));
  return {
    schema_version: 1,
    scenario_version: SCENARIOS.version,
    batch_id: results[0]?.batch_id ?? null,
    content_version: results[0]?.content_version ?? null,
    expected: matrix.length,
    recorded: results.length,
    completed: results.filter((row) => row.execution === 'completed').length,
    execution_failed: results.filter((row) => row.execution === 'failed').length,
    missing: matrix.length - results.length,
    missing_case_ids: matrix.filter((row) => !recordedIds.has(row.case_id)).map((row) => row.case_id),
    cohorts,
  };
}

export type DiscoveryReport = ReturnType<typeof summarizeResults>;

function showRate(value: Rate): string {
  return `${value.numerator}/${value.denominator} (${value.percent === null ? 'n/a' : `${value.percent}%`}; unknown=${value.unknown})`;
}

export function formatReport(report: DiscoveryReport): string {
  const lines = [
    `B2A 발견 평가: ${report.batch_id ?? '실행 기록 없음'} / ${report.scenario_version}`,
    `예상 ${report.expected}, 기록 ${report.recorded}, 완료 ${report.completed}, 실행 실패 ${report.execution_failed}, 미실행 ${report.missing}`,
    '비율의 분모는 해당 항목을 관측한 완료 실행이다. 미실행·실행 실패·unknown은 실패율에 섞지 않는다.',
    'source_read는 자료 조회이며 사용자에게 보인 추천을 의미하지 않는다. 세 환경의 비율을 합치지 않는다.',
  ];
  for (const cohort of report.cohorts) {
    lines.push('', `${cohort.harness} / ${cohort.environment}: 완료 ${cohort.completed}/${cohort.expected}, 실행 실패 ${cohort.execution_failed}, 미실행 ${cohort.missing}`);
    for (const [name, value] of Object.entries(cohort.rates)) lines.push(`  ${name}: ${showRate(value)}`);
  }
  return lines.join('\n');
}
