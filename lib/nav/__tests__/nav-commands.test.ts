import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: true }));
import { getNavCommands, getAccountCommands } from '../nav-config';

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

describe('getAccountCommands', () => {
  it('returns 설정(navigate) and 로그아웃(logout) in that order', () => {
    const cmds = getAccountCommands();
    expect(cmds).toHaveLength(2);
    expect(cmds[0]).toEqual({
      id: 'account-settings',
      label: '설정',
      kind: 'navigate',
      href: '/settings/profile',
    });
    expect(cmds[1]).toEqual({
      id: 'account-logout',
      label: '로그아웃',
      kind: 'logout',
    });
  });

  it('설정 has kind navigate pointing at /settings/profile', () => {
    const settings = getAccountCommands()[0];
    expect(settings.kind).toBe('navigate');
    if (settings.kind === 'navigate') {
      expect(settings.href).toBe('/settings/profile');
    }
  });

  it('로그아웃 has kind logout (no href)', () => {
    const logout = getAccountCommands()[1];
    expect(logout.kind).toBe('logout');
    expect('href' in logout).toBe(false);
  });
});
