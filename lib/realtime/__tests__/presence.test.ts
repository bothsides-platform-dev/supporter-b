import { describe, expect, it } from 'vitest';
import { onlineWorkspaceIds, deriveActivity, type PresenceEntry } from '@/lib/realtime/presence';

const owner = (ws: string): PresenceEntry => ({ connInfo: { workspaceId: ws } });

describe('onlineWorkspaceIds', () => {
  it('returns workspaceIds that have at least one owner entry', () => {
    const got = onlineWorkspaceIds([owner('a'), owner('a'), owner('b')]);
    expect([...got].sort()).toEqual(['a', 'b']);
  });
  it('is empty for an empty map', () => {
    expect(onlineWorkspaceIds([]).size).toBe(0);
  });
  it('ignores entries with missing/garbage connInfo (fail-closed)', () => {
    const got = onlineWorkspaceIds([{}, { connInfo: {} }, { connInfo: { workspaceId: '' } }]);
    expect(got.size).toBe(0);
  });
});

describe('deriveActivity', () => {
  it('offline when no entry matches the workspace', () => {
    expect(deriveActivity([owner('other')], 'V')).toBe('offline');
  });
  it('online (active) when an owner entry has a validated active state', () => {
    expect(deriveActivity([{ connInfo: { workspaceId: 'V' }, data: { state: 'active' } }], 'V')).toBe('active');
  });
  it('owner present but no/unknown activity → idle (never active)', () => {
    expect(deriveActivity([owner('V')], 'V')).toBe('idle');
    expect(deriveActivity([{ connInfo: { workspaceId: 'V' }, data: { state: 'bogus' } }], 'V')).toBe('idle');
  });
  it('ignores publications attributed to a different workspace (spoof bound)', () => {
    // a publication carrying state but connInfo for another ws must not flip V active
    const entries = [owner('V'), { connInfo: { workspaceId: 'X' }, data: { state: 'active' } }];
    expect(deriveActivity(entries, 'V')).toBe('idle');
  });
});
