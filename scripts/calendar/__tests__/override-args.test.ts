import { describe, expect, it } from 'vitest';
import { parseOverrideArgs } from '../override-args';

describe('calendar override CLI arguments', () => {
  const args = ['--date', '2026-10-05', '--closed', 'true', '--name', '임시공휴일', '--source', '행안부 공고', '--actor', 'ops-1', '--reason', '공고 확인'];
  it('requires an attributable source, actor and reason for each change', () => {
    expect(parseOverrideArgs(args)).toEqual({ date: '2026-10-05', closed: true, name: '임시공휴일', source: '행안부 공고', actor: 'ops-1', reason: '공고 확인' });
    expect(() => parseOverrideArgs(args.slice(0, -2))).toThrow('INVALID_CALENDAR_OVERRIDE');
  });
  it('rejects impossible dates and unknown options', () => {
    expect(() => parseOverrideArgs(['--date', '2026-02-30', ...args.slice(2)])).toThrow('INVALID_CALENDAR_OVERRIDE');
    expect(() => parseOverrideArgs([...args, '--force', 'yes'])).toThrow('INVALID_CALENDAR_OVERRIDE');
  });
});
