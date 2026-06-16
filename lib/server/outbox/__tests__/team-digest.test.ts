import { describe, expect, it } from 'vitest';
import { teamDigestDedupeKey, parseTeamDigestDedupeKey, teamDigestWindowEnd, TEAM_DIGEST_WINDOW_MS } from '../team-digest';

describe('team-digest keys', () => {
  it('round-trips dedupe key (rfp, workspace, recipient)', () => {
    const now = new Date('2026-06-14T00:01:30Z');
    const key = teamDigestDedupeKey('rfp-1', 'ws-1', 'user-1', now);
    expect(key.startsWith('team-digest:rfp-1:ws-1:user-1:')).toBe(true);
    expect(parseTeamDigestDedupeKey(key)).toEqual({ rfpId: 'rfp-1', workspaceId: 'ws-1', recipientUserId: 'user-1' });
  });
  it('returns null for malformed keys', () => {
    expect(parseTeamDigestDedupeKey(undefined)).toBeNull();
    expect(parseTeamDigestDedupeKey('chat-digest:a:b:1')).toBeNull(); // wrong prefix + arity
    expect(parseTeamDigestDedupeKey('team-digest:a:b')).toBeNull();   // too few parts
  });
  it('window end is the next bucket boundary', () => {
    const now = new Date('2026-06-14T00:01:30Z');
    const end = teamDigestWindowEnd(now);
    expect(end.getTime() % TEAM_DIGEST_WINDOW_MS).toBe(0);
    expect(end.getTime()).toBeGreaterThan(now.getTime());
  });
});
