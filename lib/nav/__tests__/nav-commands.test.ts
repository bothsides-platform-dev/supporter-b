import { describe, it, expect } from 'vitest';
import { getNavCommands } from '../nav-config';

// getNavCommands flattens the nav tree (top + workspace section + settings) into
// a flat list of navigable command-palette destinations, scoped to workspace type.
describe('getNavCommands — buyer', () => {
  const hrefs = () => getNavCommands('buyer').map((c) => c.href);

  it('includes home, notifications, messages, RFP section + statuses + new + settings links', () => {
    expect(hrefs()).toEqual(
      expect.arrayContaining([
        '/home',
        '/notifications',
        '/messages',
        '/rfp',
        '/rfp?status=active',
        '/rfp?status=closed',
        '/rfp?status=awarded',
        '/rfp-create',
        '/settings/profile',
        '/settings/members',
        '/settings/audit-log',
      ]),
    );
  });

  it('does NOT leak pg-only destinations', () => {
    expect(hrefs()).not.toContain('/inbox');
    expect(hrefs()).not.toContain('/opportunities');
    expect(hrefs()).not.toContain('/quote-templates');
  });

  it('carries the chord shortcut for 새 견적 요청', () => {
    const newRfp = getNavCommands('buyer').find((c) => c.href === '/rfp-create');
    expect(newRfp?.label).toBe('새 견적 요청');
    expect(newRfp?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'c' });
  });

  it('has no duplicate hrefs (settings base does not double-emit profile)', () => {
    const hs = hrefs();
    expect(new Set(hs).size).toBe(hs.length);
  });
});

describe('getNavCommands — pg', () => {
  const hrefs = () => getNavCommands('pg').map((c) => c.href);

  it('includes inbox section + statuses, opportunities, and pg-only quote templates', () => {
    expect(hrefs()).toEqual(
      expect.arrayContaining([
        '/home',
        '/notifications',
        '/messages',
        '/inbox',
        '/inbox?status=new',
        '/inbox?status=submitted',
        '/inbox?status=closed',
        '/opportunities',
        '/settings/profile',
        '/settings/members',
        '/settings/audit-log',
        '/quote-templates',
      ]),
    );
  });

  it('does NOT leak buyer-only destinations', () => {
    expect(hrefs()).not.toContain('/rfp');
    expect(hrefs()).not.toContain('/rfp-create');
  });
});
