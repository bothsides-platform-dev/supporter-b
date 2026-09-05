import { describe, expect, it } from 'vitest';

import { isChatReadEvent } from '@/lib/chat/read-state/event';

describe('isChatReadEvent', () => {
  it('accepts a workspace-scoped server read event', () => {
    expect(
      isChatReadEvent({
        type: 'read',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        readAt: '2026-09-06T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('rejects missing identity and invalid watermarks', () => {
    expect(
      isChatReadEvent({
        type: 'read',
        userId: 'user-1',
        workspaceId: '',
        readAt: '2026-09-06T00:00:00.000Z',
      }),
    ).toBe(false);
    expect(
      isChatReadEvent({
        type: 'read',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        readAt: 'not-a-date',
      }),
    ).toBe(false);
  });
});
