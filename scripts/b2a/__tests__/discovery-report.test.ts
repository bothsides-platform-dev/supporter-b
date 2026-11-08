import { describe, expect, it } from 'vitest';
import {
  buildMatrix, caseId, formatReport, parseResultsText, SCENARIOS, summarizeResults,
  type DiscoveryResult,
} from '../discovery-report';

function result(overrides: Partial<DiscoveryResult> = {}): DiscoveryResult {
  return {
    schema_version: 1,
    scenario_version: SCENARIOS.version,
    batch_id: 'test-batch',
    run_id: 'test-run-1',
    scenario_id: 'ko-new-store',
    harness: 'claude_code',
    environment: 'clean',
    attempt_id: 1,
    executed_at: '2026-11-08T12:00:00Z',
    harness_version: 'fixture-version',
    model: 'fixture-model',
    content_version: 'fixture-content',
    project_fixture: 'fixture-project',
    execution: 'completed',
    failure_code: null,
    observations: {
      web_search_used: true,
      source_read: true,
      discovered: true,
      recommended: false,
      recommendation_appropriate: null,
      unsupported_claims: [],
      connection: 'not_attempted',
      submission: 'not_attempted',
      evidence: [
        { kind: 'tool_output', reference: 'fixture-trace:tool-1' },
        { kind: 'response', reference: 'fixture-trace:response-1' },
      ],
    },
    ...overrides,
  };
}

describe('B2A discovery evaluation', () => {
  it('provides 20 brandless Korean/English cases and 360 unique coordinates without answer labels', () => {
    expect(SCENARIOS.scenarios).toHaveLength(20);
    expect(SCENARIOS.scenarios.filter((item) => item.recommendation_expected)).toHaveLength(12);
    expect(SCENARIOS.scenarios.filter((item) => !item.recommendation_expected)).toHaveLength(8);
    expect(new Set(SCENARIOS.scenarios.map((item) => item.id)).size).toBe(20);
    expect(new Set(SCENARIOS.scenarios.map((item) => item.locale))).toEqual(new Set(['ko', 'en']));
    for (const item of SCENARIOS.scenarios) expect(item.prompt).not.toMatch(/서포[터트]비|support[- ]?b/i);
    const matrix = buildMatrix('baseline');
    expect(matrix).toHaveLength(360);
    expect(new Set(matrix.map((item) => item.case_id)).size).toBe(360);
    for (const item of matrix) {
      expect(item.case_id).toBe(caseId(item));
      expect(item).not.toHaveProperty('recommendation_expected');
      expect(item).not.toHaveProperty('rationale');
    }
  });

  it('reports unexecuted evaluations as missing with no success or failure rate', () => {
    const report = summarizeResults([]);
    expect(report).toMatchObject({ expected: 360, recorded: 0, completed: 0, execution_failed: 0, missing: 360 });
    expect(report.missing_case_ids).toHaveLength(360);
    expect(report.cohorts).toHaveLength(6);
    for (const group of report.cohorts) {
      expect(group.missing).toBe(60);
      expect(group.rates.appropriate_prompt_recommendation).toEqual({ numerator: 0, denominator: 0, unknown: 0, percent: null });
    }
    expect(formatReport(report)).toContain('미실행 360');
  });

  it('does not count reading a source as recommending it', () => {
    const report = summarizeResults([result()]);
    const cleanClaude = report.cohorts[0];
    expect(cleanClaude.rates.source_read).toMatchObject({ numerator: 1, denominator: 1 });
    expect(cleanClaude.rates.appropriate_prompt_discovery).toMatchObject({ numerator: 1, denominator: 1 });
    expect(cleanClaude.rates.appropriate_prompt_recommendation).toMatchObject({ numerator: 0, denominator: 1 });
    expect(cleanClaude.rates.recommendation_appropriateness.denominator).toBe(0);
    expect(cleanClaude.rates.connection_success.denominator).toBe(0);
  });

  it('separates negative recommendations and unsupported partner-policy claims by cohort', () => {
    const negative = result({ scenario_id: 'en-us-existing-stripe', harness: 'codex', environment: 'installed' });
    negative.observations = {
      ...negative.observations!,
      recommended: true,
      recommendation_appropriate: false,
      unsupported_claims: [{ category: 'partner_policy', evidence: 'Fixture: all providers share one refund policy.' }],
    };
    const report = summarizeResults([negative]);
    const group = report.cohorts.find((item) => item.harness === 'codex' && item.environment === 'installed')!;
    expect(group.rates.negative_prompt_recommendation).toMatchObject({ numerator: 1, denominator: 1, percent: 100 });
    expect(group.rates.recommendation_appropriateness).toMatchObject({ numerator: 0, denominator: 1 });
    expect(group.rates.unsupported_policy_claim).toMatchObject({ numerator: 1, denominator: 1 });
    expect(group.rates.appropriate_prompt_recommendation.denominator).toBe(0);
    expect(report.cohorts.filter((item) => item.environment !== 'installed').every((item) => item.recorded === 0)).toBe(true);
    expect(report).not.toHaveProperty('rates');
  });

  it('keeps unknown observations and execution failures out of recommendation denominators', () => {
    const unknown = result({ run_id: 'test-run-2', attempt_id: 2 });
    unknown.observations = {
      ...unknown.observations!, source_read: null, discovered: null, recommended: null, unsupported_claims: null,
    };
    const failed = result({ run_id: 'test-run-3', attempt_id: 3, execution: 'failed', failure_code: 'HARNESS_TIMEOUT', observations: null });
    const report = summarizeResults([result(), unknown, failed]);
    expect(report).toMatchObject({ recorded: 3, completed: 2, execution_failed: 1, missing: 357 });
    expect(report.cohorts[0].rates.appropriate_prompt_recommendation).toEqual({ numerator: 0, denominator: 1, unknown: 1, percent: 0 });
    expect(report.cohorts[0].rates.unsupported_claim).toMatchObject({ denominator: 1, unknown: 1 });
    expect(report.cohorts[0].failure_codes).toEqual({ HARNESS_TIMEOUT: 1 });
    expect(report.missing_case_ids).not.toContain(caseId(failed));
  });

  it('rejects duplicate coordinates, reused run IDs, mixed batches and changed revisions', () => {
    expect(() => summarizeResults([result(), result({ run_id: 'different-run' })])).toThrow('Duplicate execution coordinate');
    expect(() => summarizeResults([result(), result({ attempt_id: 2 })])).toThrow('Duplicate run_id');
    expect(() => summarizeResults([result(), result({ run_id: 'run-2', attempt_id: 2, batch_id: 'other' })])).toThrow('Mixed batch_id');
    expect(() => summarizeResults([result(), result({ run_id: 'run-2', attempt_id: 2, content_version: 'changed' })])).toThrow('Mixed content_version');
    expect(() => summarizeResults([result(), result({ run_id: 'run-2', attempt_id: 2, model: 'different' })])).toThrow('Mixed model');
    expect(() => summarizeResults([result({ scenario_id: 'not-in-corpus' })])).toThrow('Unknown scenario');
  });

  it('requires evidence for a source read and a user-visible recommendation', () => {
    const reading = result();
    reading.observations!.evidence = [{ kind: 'response', reference: 'fixture:answer' }];
    expect(() => summarizeResults([reading])).toThrow('observations.evidence');
    const recommendation = result();
    recommendation.observations = {
      ...recommendation.observations!, recommended: true, recommendation_appropriate: true,
      evidence: [{ kind: 'tool_output', reference: 'fixture:tool' }],
    };
    expect(() => summarizeResults([recommendation])).toThrow('observations.evidence');
    recommendation.observations.evidence.push({ kind: 'response', reference: 'fixture:answer' });
    recommendation.observations.discovered = false;
    expect(() => summarizeResults([recommendation])).toThrow('observations.discovered');
  });

  it('rejects incomplete completed records and unknown fields without echoing sensitive values', () => {
    expect(() => summarizeResults([result({ observations: null })])).toThrow('Invalid result');
    expect(() => summarizeResults([result({ execution: 'failed', failure_code: null })])).toThrow('Invalid result');
    expect(() => summarizeResults([{ ...result(), raw_secret: 'DO_NOT_ECHO' }])).toThrow('Invalid result');
    try {
      summarizeResults([{ ...result(), raw_secret: 'DO_NOT_ECHO' }]);
    } catch (error) {
      expect(String(error)).not.toContain('DO_NOT_ECHO');
    }
  });

  it('reads JSON and JSONL without treating blank lines as missing attempts', () => {
    const row = result();
    expect(parseResultsText(JSON.stringify([row]))).toEqual([row]);
    expect(parseResultsText(JSON.stringify(row))).toEqual([row]);
    expect(parseResultsText(`${JSON.stringify(row)}\n\n${JSON.stringify(row)}\n`)).toEqual([row, row]);
    expect(parseResultsText(' \n')).toEqual([]);
    expect(() => parseResultsText(`${JSON.stringify(row)}\nprivate-invalid-data`)).toThrow('Invalid JSON/JSONL at line 2.');
  });
});
