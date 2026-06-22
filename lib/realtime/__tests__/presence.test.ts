import { describe, expect, it } from 'vitest';
import {
  onlineWorkspaceIds,
  onlineUserIds,
  deriveActivity,
  type PresenceEntry,
} from '@/lib/realtime/presence';

const owner = (ws: string): PresenceEntry => ({ connInfo: { workspaceId: ws } });
const ownerU = (ws: string, user: string): PresenceEntry => ({
  connInfo: { workspaceId: ws },
  userId: user,
});

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

describe('onlineUserIds', () => {
  it('returns the userIds of owner connections of the given workspace', () => {
    const entries = [ownerU('V', 'u1'), ownerU('V', 'u2'), ownerU('X', 'u3')];
    expect([...onlineUserIds(entries, 'V')].sort()).toEqual(['u1', 'u2']);
  });
  it('dedupes a user with multiple connections in the same workspace', () => {
    expect([...onlineUserIds([ownerU('V', 'u1'), ownerU('V', 'u1')], 'V')]).toEqual(['u1']);
  });
  it('excludes owners attributed to another workspace (spoof bound)', () => {
    expect(onlineUserIds([ownerU('X', 'u3')], 'V').size).toBe(0);
  });
  it('ignores entries with missing userId or workspace (fail-closed)', () => {
    const entries: PresenceEntry[] = [
      { connInfo: { workspaceId: 'V' } }, // no userId
      { userId: 'u1' }, // no workspace
      {},
    ];
    expect(onlineUserIds(entries, 'V').size).toBe(0);
  });
  it('is empty for an empty map', () => {
    expect(onlineUserIds([], 'V').size).toBe(0);
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
