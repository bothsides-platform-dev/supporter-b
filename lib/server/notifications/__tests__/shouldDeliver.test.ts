import { describe, expect, it } from 'vitest';

import { shouldDeliverToWorkspace } from '../shouldDeliver';
import type { Notification } from '@/lib/types/notification';

function notif(workspaceId: string | null): Notification {
  return {
    id: 'n1',
    userId: 'u1',
    workspaceId,
    type: 'workspace.invited',
    title: 't',
    body: 'b',
    channel: 'inapp',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}

describe('shouldDeliverToWorkspace', () => {
  it('delivers when the notification belongs to the current workspace', () => {
    expect(shouldDeliverToWorkspace(notif('ws-1'), 'ws-1')).toBe(true);
  });

  it('delivers user-level (workspaceId null) notifications regardless of workspace', () => {
    expect(shouldDeliverToWorkspace(notif(null), 'ws-1')).toBe(true);
    expect(shouldDeliverToWorkspace(notif(null), 'ws-2')).toBe(true);
  });

  it('does not deliver notifications scoped to a different workspace (no leakage)', () => {
    expect(shouldDeliverToWorkspace(notif('ws-2'), 'ws-1')).toBe(false);
  });
});
