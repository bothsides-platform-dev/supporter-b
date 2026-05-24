import { describe, it, expect } from 'vitest';
import {
  matchesDeadlineBucket,
  matchesGrade,
  resolveBoardView,
  filterRfps,
} from '../filterRfps';
import type { RFP } from '@/lib/types/rfp';

// Fixed "now": 2026-05-24 (local).
const NOW = new Date(2026, 4, 24, 9, 0, 0);
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0).toISOString();

describe('matchesDeadlineBucket', () => {
  it('returns true when bucket is absent/unknown (no filter)', () => {
    expect(matchesDeadlineBucket(iso(2026, 5, 27), undefined, NOW)).toBe(true);
    expect(matchesDeadlineBucket(iso(2026, 5, 27), '', NOW)).toBe(true);
    expect(matchesDeadlineBucket(iso(2026, 5, 27), 'bogus', NOW)).toBe(true);
  });

  it('d7 = today through +7 days', () => {
    expect(matchesDeadlineBucket(iso(2026, 5, 27), 'd7', NOW)).toBe(true); // +3
    expect(matchesDeadlineBucket(iso(2026, 6, 3), 'd7', NOW)).toBe(false); // +10
    expect(matchesDeadlineBucket(iso(2026, 5, 23), 'd7', NOW)).toBe(false); // -1 (overdue)
  });

  it('overdue = strictly before today', () => {
    expect(matchesDeadlineBucket(iso(2026, 5, 23), 'overdue', NOW)).toBe(true);
    expect(matchesDeadlineBucket(iso(2026, 5, 24), 'overdue', NOW)).toBe(false);
    expect(matchesDeadlineBucket(iso(2026, 5, 27), 'overdue', NOW)).toBe(false);
  });

  it('month = same calendar month/year', () => {
    expect(matchesDeadlineBucket(iso(2026, 5, 15), 'month', NOW)).toBe(true);
    expect(matchesDeadlineBucket(iso(2026, 5, 30), 'month', NOW)).toBe(true);
    expect(matchesDeadlineBucket(iso(2026, 6, 1), 'month', NOW)).toBe(false);
  });
});

describe('matchesGrade', () => {
  it('returns true when no grade param (no filter)', () => {
    expect(matchesGrade('sme1', undefined)).toBe(true);
    expect(matchesGrade(undefined, '')).toBe(true);
  });
  it('matches exact raw grade enum', () => {
    expect(matchesGrade('sme1', 'sme1')).toBe(true);
    expect(matchesGrade('general', 'sme1')).toBe(false);
    expect(matchesGrade(undefined, 'sme1')).toBe(false);
  });
});

describe('resolveBoardView', () => {
  it('prefers URL param when valid', () => {
    expect(resolveBoardView('board', 'table')).toBe('board');
    expect(resolveBoardView('table', 'board')).toBe('table');
  });
  it('falls back to cookie when param absent/invalid', () => {
    expect(resolveBoardView(undefined, 'board')).toBe('board');
    expect(resolveBoardView('bogus', 'board')).toBe('board');
  });
  it('defaults to table when neither valid', () => {
    expect(resolveBoardView(undefined, undefined)).toBe('table');
    expect(resolveBoardView('bogus', 'bogus')).toBe('table');
  });
});

describe('filterRfps (status + deadline + grade, AND)', () => {
  const base: Omit<RFP, 'id' | 'status' | 'deadline' | 'bizProfile'> = {
    code: 'P-2605-0001',
    buyerWsId: 'ws1',
    title: 't',
    memo: '',
    rfpFiles: [],
    allowedPgWorkspaceIds: [],
    createdBy: 'u1',
    createdAt: iso(2026, 5, 1),
  };
  const rfp = (over: Partial<RFP>): RFP => ({ ...base, id: 'x', status: 'sent', deadline: iso(2026, 5, 27), ...over } as RFP);

  const rows: RFP[] = [
    rfp({ id: 'a', status: 'sent', deadline: iso(2026, 5, 27), bizProfile: { grade: 'sme1', gradeSource: 'unset' } }),
    rfp({ id: 'b', status: 'draft', deadline: iso(2026, 6, 10), bizProfile: { grade: 'general', gradeSource: 'unset' } }),
    rfp({ id: 'c', status: 'sent', deadline: iso(2026, 6, 10), bizProfile: { grade: 'sme1', gradeSource: 'unset' } }),
  ];

  it('no params → all', () => {
    expect(filterRfps(rows, {}, NOW).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('status=active (→ sent)', () => {
    expect(filterRfps(rows, { status: 'active' }, NOW).map((r) => r.id)).toEqual(['a', 'c']);
  });
  it('deadline=d7 keeps only near deadlines', () => {
    expect(filterRfps(rows, { deadline: 'd7' }, NOW).map((r) => r.id)).toEqual(['a']);
  });
  it('grade=sme1', () => {
    expect(filterRfps(rows, { grade: 'sme1' }, NOW).map((r) => r.id)).toEqual(['a', 'c']);
  });
  it('combined status=active & grade=sme1 & deadline=d7', () => {
    expect(filterRfps(rows, { status: 'active', grade: 'sme1', deadline: 'd7' }, NOW).map((r) => r.id)).toEqual(['a']);
  });
});
