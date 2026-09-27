export type CalendarOverride = {
  date: string; closed: boolean; name: string; source: string; actor: string; reason: string;
};

export function parseOverrideArgs(args: string[]): CalendarOverride {
  const values = new Map<string, string>();
  const allowed = new Set(['--date', '--closed', '--name', '--source', '--actor', '--reason']);
  if (args.length % 2 !== 0) throw new Error('INVALID_CALENDAR_OVERRIDE');
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]) || values.has(args[i])) throw new Error('INVALID_CALENDAR_OVERRIDE');
    values.set(args[i], args[i + 1]);
  }
  const [date, closed, name, source, actor, reason] =
    ['--date', '--closed', '--name', '--source', '--actor', '--reason'].map((field) => values.get(field)?.trim());
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date ||
    (closed !== 'true' && closed !== 'false') || !name || !source || !actor || !reason ||
    [name, source, actor, reason].some((value) => value.length > 200)) {
    throw new Error('INVALID_CALENDAR_OVERRIDE');
  }
  return { date, closed: closed === 'true', name, source, actor, reason };
}
